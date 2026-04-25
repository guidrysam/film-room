"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  get,
  onValue,
  ref,
  remove,
  set,
  update,
  serverTimestamp,
} from "firebase/database";
import type { YouTubePlayer } from "react-youtube";
import YouTube from "react-youtube";
import { db } from "@/lib/firebase";
import {
  buildViewerRoomUrl,
  isRoomHost,
  markRoomHost,
  subscribeToRoomHostStore,
} from "@/lib/room-host";
import { useAuth } from "@/components/AuthProvider";
import { TelestratorOverlay } from "@/components/TelestratorOverlay";
import { signInWithGoogle } from "@/lib/auth-google";
import { getSavedSession, saveSessionTemplate } from "@/lib/saved-sessions";
import {
  angleTimeFromGameTime,
  gameTimeFromAngleTime,
  parseVideoAngles,
  pickAngle,
  type VideoAngle,
} from "@/lib/video-angle";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

const HOST_SPEEDS = [0.25, 0.5, 1] as const;
const DEFAULT_PLAYBACK_RATE = 1;

/** Fast-forward tiers: off → 2× → 4× → 8× → off (4×/8× use native 2× + seek assist). */
const FF_TIERS = [0, 2, 4, 8] as const;
const FF_SIM_MS = 700;
const FF_NATIVE_CAP = 2;

const PLAY_RETRY_MS = 250;
const PAUSE_RETRY_MS = 150;

/** Dev-only sync trace; set localStorage FILM_ROOM_SYNC_DEBUG=1 to always log. */
function syncLog(...args: unknown[]) {
  if (
    typeof window !== "undefined" &&
    (process.env.NODE_ENV === "development" ||
      window.localStorage?.getItem("FILM_ROOM_SYNC_DEBUG") === "1")
  ) {
    console.log("[FilmRoom sync]", ...args);
  }
}

/** Immediate play/pause/seek/resync envelope (Firebase `playbackCommand`). */
type PlaybackCommand = {
  type: "play" | "pause" | "seek" | "resync";
  roomId: string;
  /** YouTube video active when the host issued the command (ignore if clip changed). */
  activeVideoId: string;
  issuedAt: number;
  anchorVideoTime: number;
  playbackRate: number;
  commandId: number;
};

function parsePlaybackCommand(raw: unknown): PlaybackCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (
    type !== "play" &&
    type !== "pause" &&
    type !== "seek" &&
    type !== "resync"
  ) {
    return null;
  }
  if (typeof o.roomId !== "string") return null;
  if (typeof o.activeVideoId !== "string") return null;
  if (typeof o.issuedAt !== "number") return null;
  if (typeof o.anchorVideoTime !== "number") return null;
  if (typeof o.playbackRate !== "number") return null;
  if (typeof o.commandId !== "number") return null;
  return {
    type,
    roomId: o.roomId,
    activeVideoId: o.activeVideoId,
    issuedAt: o.issuedAt,
    anchorVideoTime: o.anchorVideoTime,
    playbackRate: o.playbackRate,
    commandId: o.commandId,
  };
}

/**
 * Shared embed options; `fs` is set per role in RoomContent (`useMemo` + stable ref)
 * so the coach iframe omits YouTube fullscreen (keeps host controls visible).
 */
const YOUTUBE_PLAYER_OPTS_BASE = {
  width: "100%",
  height: "100%",
  playerVars: {
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
  },
} as const;

/** Host-issued transport; `sync` is occasional time reference only (not command transport). */
type TransportAction =
  | "init"
  | "play"
  | "pause"
  | "seek"
  | "resync"
  | "rate"
  | "sync"
  | "clip";

type ClipEntry = { videoId: string; label?: string };

/** Saved jump points; `videoId` ties each marker to a clip in the queue. */
type ChapterEntry = {
  time: number;
  label: string;
  videoId: string;
  /** Shared game-clock moment (optional; legacy chapters use `time` as game time on the reference angle). */
  gameTime?: number;
};

type RoomState = {
  videoId: string;
  /** In-session queue; active clip is `clips[currentClipIndex]` (kept in sync with `videoId`). */
  clips: ClipEntry[];
  currentClipIndex: number;
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  updatedAt: number;
  action: TransportAction;
  /** Monotonic per room — viewer applies command when this advances. */
  actionId: number;
  /** Latest immediate transport for play/pause/seek (reconcile uses `action: sync` separately). */
  playbackCommand: PlaybackCommand | null;
  chapters: ChapterEntry[];
  /** Camera angles (same game clock); synthesized as a single default angle when absent from RTDB. */
  angles: VideoAngle[];
  currentAngleId: string;
};

/** Shared moment for chapter ordering / navigation (legacy: `time` on reference angle). */
function chapterGameMoment(ch: ChapterEntry): number {
  return ch.gameTime ?? ch.time;
}

/** Next default label for one-tap "Mark Play" (Play → Play 2 → Play 3 …). */
function nextMarkPlayLabel(chapters: ChapterEntry[]): string {
  let maxNum = 0;
  for (const ch of chapters) {
    if (ch.label === "Play") {
      maxNum = Math.max(maxNum, 1);
    } else {
      const m = /^Play (\d+)$/.exec(ch.label);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]!, 10));
    }
  }
  if (maxNum === 0) return "Play";
  return `Play ${maxNum + 1}`;
}

function parseTransportAction(raw: unknown): TransportAction {
  if (
    raw === "init" ||
    raw === "play" ||
    raw === "pause" ||
    raw === "seek" ||
    raw === "resync" ||
    raw === "rate" ||
    raw === "sync" ||
    raw === "clip"
  ) {
    return raw;
  }
  return "init";
}

function formatChapterTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Compact host control for rename affordances (chapters / clips). */
const miniHostBtn =
  "rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-[10px] font-medium text-zinc-200 transition duration-150 hover:border-white/25 hover:bg-white/[0.10] hover:text-white active:scale-95 active:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

function parseChapters(raw: unknown): ChapterEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ChapterEntry[] = [];
  let i = 0;
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.time !== "number" || typeof o.videoId !== "string") continue;
    const label =
      typeof o.label === "string" && o.label.trim() !== ""
        ? o.label
        : `Chapter ${i + 1}`;
    const gameTime =
      typeof o.gameTime === "number" && Number.isFinite(o.gameTime)
        ? o.gameTime
        : undefined;
    out.push({
      time: o.time,
      label,
      videoId: o.videoId,
      ...(gameTime !== undefined ? { gameTime } : {}),
    });
    i += 1;
  }
  return out;
}

/** Session chapter order: clip index in queue, then time (supports multi-clip lists). */
const CHAPTER_NAV_EPS = 0.05;

/** Queue index for sort/navigation; unknown `videoId` sorts after all clips in the queue. */
function clipSortIndexForOrder(clips: ClipEntry[], videoId: string): number {
  const i = clips.findIndex((c) => c.videoId === videoId);
  return i >= 0 ? i : clips.length;
}

function compareChapterOrder(
  clips: ClipEntry[],
  a: ChapterEntry,
  b: ChapterEntry,
): number {
  const ia = clipSortIndexForOrder(clips, a.videoId);
  const ib = clipSortIndexForOrder(clips, b.videoId);
  if (ia !== ib) return ia - ib;
  return chapterGameMoment(a) - chapterGameMoment(b);
}

function sortChaptersForNavigation(
  clips: ClipEntry[],
  chapters: ChapterEntry[],
): ChapterEntry[] {
  return [...chapters].sort((a, b) => compareChapterOrder(clips, a, b));
}

/** Display order: clip queue order, then time ascending; carries RTDB index for edits. */
function buildChaptersDisplayList(
  clips: ClipEntry[],
  chapters: ChapterEntry[],
): Array<{ chapter: ChapterEntry; sourceIndex: number }> {
  const rows = chapters.map((chapter, sourceIndex) => ({
    chapter,
    sourceIndex,
  }));
  rows.sort((a, b) => compareChapterOrder(clips, a.chapter, b.chapter));
  return rows;
}

function formatClipLabel(clip: ClipEntry, index: number): string {
  const t = clip.label?.trim();
  if (t) return t;
  return `Clip ${index + 1}`;
}

function clipToSavedClip(c: ClipEntry): { videoId: string; label?: string } {
  const label = c.label?.trim();
  return label ? { videoId: c.videoId, label } : { videoId: c.videoId };
}

function chapterStrictlyBeforeCursor(
  clips: ClipEntry[],
  ch: ChapterEntry,
  cursorClipIdx: number,
  cursorMoment: number,
): boolean {
  const ci = clipSortIndexForOrder(clips, ch.videoId);
  const chMoment = chapterGameMoment(ch);
  return (
    ci < cursorClipIdx ||
    (ci === cursorClipIdx && chMoment < cursorMoment - CHAPTER_NAV_EPS)
  );
}

function chapterStrictlyAfterCursor(
  clips: ClipEntry[],
  ch: ChapterEntry,
  cursorClipIdx: number,
  cursorMoment: number,
): boolean {
  const ci = clipSortIndexForOrder(clips, ch.videoId);
  const chMoment = chapterGameMoment(ch);
  return (
    ci > cursorClipIdx ||
    (ci === cursorClipIdx && chMoment > cursorMoment + CHAPTER_NAV_EPS)
  );
}

function findPrevChapterInSession(
  clips: ClipEntry[],
  chapters: ChapterEntry[],
  cursorClipIdx: number,
  cursorMoment: number,
): ChapterEntry | null {
  if (!chapters.length) return null;
  const sorted = sortChaptersForNavigation(clips, chapters);
  let best: ChapterEntry | null = null;
  for (const ch of sorted) {
    if (chapterStrictlyBeforeCursor(clips, ch, cursorClipIdx, cursorMoment)) {
      best = ch;
    }
  }
  return best;
}

function findNextChapterInSession(
  clips: ClipEntry[],
  chapters: ChapterEntry[],
  cursorClipIdx: number,
  cursorMoment: number,
): ChapterEntry | null {
  if (!chapters.length) return null;
  const sorted = sortChaptersForNavigation(clips, chapters);
  for (const ch of sorted) {
    if (chapterStrictlyAfterCursor(clips, ch, cursorClipIdx, cursorMoment)) {
      return ch;
    }
  }
  return null;
}

/** Most recent chapter on the active clip at or before playback time `t` (index in `chapters`). */
const CHAPTER_ACTIVE_UI_EPS = 0.2;

function findActiveChapterIndexForUi(
  chapters: ChapterEntry[],
  activeClipCanonicalVideoId: string,
  t: number,
  angle: VideoAngle,
): number | null {
  let bestIdx: number | null = null;
  let bestTime = -Infinity;
  const cursorGame = gameTimeFromAngleTime(t, angle);
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (ch.videoId !== activeClipCanonicalVideoId) continue;
    const g = chapterGameMoment(ch);
    if (g <= cursorGame + CHAPTER_ACTIVE_UI_EPS && g >= bestTime) {
      bestTime = g;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function parseClipEntries(raw: unknown): ClipEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ClipEntry[] = [];
  for (const row of raw) {
    if (
      row &&
      typeof row === "object" &&
      typeof (row as ClipEntry).videoId === "string"
    ) {
      const o = row as Record<string, unknown>;
      const labelRaw = o.label;
      const label =
        typeof labelRaw === "string" && labelRaw.trim() !== ""
          ? labelRaw.trim()
          : undefined;
      out.push({
        videoId: (row as ClipEntry).videoId,
        ...(label ? { label } : {}),
      });
    }
  }
  return out;
}

/** Normalize clip list + index; `videoId` from RTDB is authoritative for the active stream. */
function parseRoomFromDb(val: Record<string, unknown> | null): RoomState | null {
  if (!val) return null;
  const videoIdRaw = val.videoId;
  const isPlaying = val.isPlaying;
  const currentTime = val.currentTime;
  if (
    typeof videoIdRaw !== "string" ||
    typeof isPlaying !== "boolean" ||
    typeof currentTime !== "number"
  ) {
    return null;
  }

  let clips = parseClipEntries(val.clips);
  if (clips.length === 0) {
    clips = [{ videoId: videoIdRaw }];
  }

  let idx =
    typeof val.currentClipIndex === "number" && Number.isFinite(val.currentClipIndex)
      ? Math.floor(val.currentClipIndex)
      : 0;
  if (idx < 0 || idx >= clips.length) {
    idx = 0;
  }

  const canonicalClipId = clips[idx]?.videoId ?? videoIdRaw;
  const angles = parseVideoAngles(val.angles, canonicalClipId);

  const rawAngleId = val.currentAngleId;
  let currentAngleId =
    typeof rawAngleId === "string" &&
    rawAngleId.trim() !== "" &&
    angles.some((a) => a.id === rawAngleId.trim())
      ? rawAngleId.trim()
      : angles[0]!.id;

  const angleByVideo = angles.findIndex((a) => a.videoId === videoIdRaw);
  if (angleByVideo >= 0) {
    currentAngleId = angles[angleByVideo]!.id;
  }

  const matchIdx = clips.findIndex((c) => c.videoId === videoIdRaw);
  if (angles.length === 1 && matchIdx >= 0) {
    idx = matchIdx;
  }

  const activeVideoId =
    angleByVideo >= 0
      ? videoIdRaw
      : pickAngle(angles, currentAngleId).videoId;

  return {
    videoId: activeVideoId,
    clips,
    currentClipIndex: idx,
    isPlaying,
    currentTime,
    playbackRate: normalizePlaybackRate(val.playbackRate),
    updatedAt: typeof val.updatedAt === "number" ? val.updatedAt : 0,
    action: parseTransportAction(val.action),
    actionId: typeof val.actionId === "number" ? val.actionId : 0,
    playbackCommand: parsePlaybackCommand(val.playbackCommand),
    chapters: parseChapters(val.chapters),
    angles,
    currentAngleId,
  };
}

function stableKey(s: RoomState): string {
  const pc = s.playbackCommand?.commandId ?? 0;
  return `${s.videoId}|${s.currentAngleId}|${s.isPlaying}|${s.currentTime}|${s.playbackRate}|${s.updatedAt}|${s.action}|${s.actionId}|pc:${pc}`;
}

/** Compare Firebase `currentTime` snapshots (often stale during playback). */
function sameDbClock(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.05;
}

/** Paused: keep picture aligned with DB. */
const SEEK_DRIFT_PAUSED_S = 0.4;
/** Firebase time step over this = explicit host transport (-10s, scrub, etc.). */
const PLAYBACK_EXPLICIT_STEP_S = 3.0;
/**
 * While playing: only seek if local is this far behind remote (no backward seek, no small/medium seeks).
 */
const SEEK_WHILE_PLAYING_LARGE_S = 4.0;
/** Within this drift (seconds), viewer uses exact host playbackRate (wider = less speed hunting). */
const RATE_SYNC_DEADBAND_S = 1.12;
/** Nudge magnitude relative to host rate when moderately ahead/behind (applied to host rate). */
const RATE_NUDGE_DELTA = 0.08;
/** Min change before applying a viewer correction rate vs last applied (reduces setPlaybackRate churn). */
const VIEWER_RATE_CORRECTION_EPS = 0.028;
/** First apply / explicit host playhead move: small deadband. */
const SEEK_AFTER_TRANSPORT_JUMP_S = 0.2;
const SEEK_INITIAL_SYNC_S = 0.3;

/** Host time ping while playing (RTDB `action: sync`, not `playbackCommand`). */
const HOST_PLAYBACK_HEARTBEAT_MS = 5_000;
/**
 * Heartbeat / host echo: while playing, explicit time jumps (e.g. heartbeat) only seek
 * when drift exceeds this — avoids micro-seeks on each ping.
 */
const EXPLICIT_SEEK_PLAYING_MIN_DRIFT_S = 0.55;
/**
 * Viewer heartbeat (`action: sync`): aligned within this — no seek, no rate nudge vs host.
 */
const VIEWER_HEARTBEAT_DRIFT_IGNORE_S = 1.2;
/** Viewer heartbeat: one seek to host if |drift| exceeds this (seconds). */
const VIEWER_HEARTBEAT_LARGE_SEEK_S = 4.5;

/** Growing `getDuration()` while playing ⇒ treat as YouTube live / DVR window. */
const LIVE_DURATION_GROWTH_S = 0.75;
const LIVE_DURATION_MIN_BASE_S = 5;
const LIVE_EDGE_CLAMP_PAD_S = 0.15;

function meaningfulCurrentTimeChange(
  prev: RoomState | null,
  state: RoomState,
): boolean {
  if (prev === null) return false;
  return !sameDbClock(prev.currentTime, state.currentTime);
}

/**
 * Same logical transport, only `updatedAt` changed (e.g. metadata) — do not seek/play.
 */
function isUpdatedAtOnlyFirebaseUpdate(
  prev: RoomState | null,
  state: RoomState,
): boolean {
  if (prev === null) return false;
  return (
    prev.videoId === state.videoId &&
    prev.isPlaying === state.isPlaying &&
    sameDbClock(prev.currentTime, state.currentTime) &&
    Math.abs(prev.playbackRate - state.playbackRate) < 1e-9 &&
    prev.updatedAt !== state.updatedAt
  );
}

/**
 * drift = localT - remoteT. Viewer-only smoothing: nudge playback rate vs host while playing.
 * Large drift returns host rate (caller seeks first); deadband uses exact host rate.
 */
function computeViewerPlaybackRate(hostRate: number, drift: number): number {
  const a = Math.abs(drift);
  if (a <= RATE_SYNC_DEADBAND_S) {
    return hostRate;
  }
  if (a >= SEEK_WHILE_PLAYING_LARGE_S) {
    return hostRate;
  }
  if (drift < 0) {
    return hostRate + RATE_NUDGE_DELTA;
  }
  return Math.max(hostRate - RATE_NUDGE_DELTA, 0.25);
}

/**
 * Only push a new correction playbackRate when it meaningfully differs from the last
 * applied value — avoids rapid oscillation between host rate and nudged rate on heartbeats.
 */
function shouldApplyViewerCorrectionRate(
  prevApplied: number,
  target: number,
  hostRate: number,
): boolean {
  if (!Number.isFinite(prevApplied)) return true;
  const targetAtHost = Math.abs(target - hostRate) < 1e-6;
  const prevAtHost = Math.abs(prevApplied - hostRate) < 1e-6;
  if (targetAtHost && prevAtHost) return false;
  if (targetAtHost && !prevAtHost) return true;
  if (!targetAtHost && prevAtHost) {
    return Math.abs(target - hostRate) > VIEWER_RATE_CORRECTION_EPS;
  }
  return Math.abs(prevApplied - target) > VIEWER_RATE_CORRECTION_EPS;
}

function shouldSeekToRemoteTime(params: {
  localT: number;
  remoteT: number;
  isPlaying: boolean;
  prev: RoomState | null;
  state: RoomState;
}): boolean {
  const { localT, remoteT, isPlaying, prev, state } = params;
  const drift = localT - remoteT;

  if (prev === null) {
    return Math.abs(drift) > SEEK_INITIAL_SYNC_S;
  }

  if (meaningfulCurrentTimeChange(prev, state)) {
    const timeStep = Math.abs(state.currentTime - prev.currentTime);
    const explicitTransport = timeStep > PLAYBACK_EXPLICIT_STEP_S;

    if (explicitTransport) {
      if (isPlaying) {
        return Math.abs(drift) > EXPLICIT_SEEK_PLAYING_MIN_DRIFT_S;
      }
      return Math.abs(drift) > SEEK_AFTER_TRANSPORT_JUMP_S;
    }

    if (!isPlaying) {
      return Math.abs(drift) > SEEK_DRIFT_PAUSED_S;
    }

    /* Playing + heartbeat-sized step: no seek for small/medium drift; large behind only. */
    if (drift >= 0) {
      return false;
    }
    return drift < -SEEK_WHILE_PLAYING_LARGE_S;
  }

  if (!isPlaying) {
    return Math.abs(drift) > SEEK_DRIFT_PAUSED_S;
  }

  if (drift >= 0) {
    return false;
  }
  return drift < -SEEK_WHILE_PLAYING_LARGE_S;
}

/**
 * Host speed-only writes send `{ playbackRate, updatedAt }`; RTDB keeps the same
 * `currentTime` / `isPlaying`. In that case we must not seek or toggle play/pause.
 */
function isRateOnlyFirebaseUpdate(
  prev: RoomState | null,
  state: RoomState,
): boolean {
  if (prev === null) return false;
  return (
    prev.videoId === state.videoId &&
    prev.isPlaying === state.isPlaying &&
    sameDbClock(prev.currentTime, state.currentTime) &&
    Math.abs(prev.playbackRate - state.playbackRate) > 1e-9
  );
}

const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_UNSTARTED = -1;
const YT_CUED = 5;

function youtubeStateLabel(data: number): string {
  switch (data) {
    case YT_UNSTARTED:
      return "UNSTARTED";
    case YT_ENDED:
      return "ENDED";
    case YT_PLAYING:
      return "PLAYING";
    case YT_PAUSED:
      return "PAUSED";
    case YT_BUFFERING:
      return "BUFFERING";
    case YT_CUED:
      return "CUED";
    default:
      return String(data);
  }
}

/** After host taps Play, suppress heartbeat RTDB writes to avoid racing BUFFERING on mobile. */
const HOST_PLAY_HEARTBEAT_SUPPRESS_MS = 2800;

async function readYoutubePlayerState(
  player: YouTubePlayer,
): Promise<number | undefined> {
  const p = player as YouTubePlayer & {
    getPlayerState?: () => number | Promise<number>;
  };
  if (typeof p.getPlayerState !== "function") return undefined;
  try {
    const raw = p.getPlayerState();
    const st = await Promise.resolve(raw);
    return typeof st === "number" ? st : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Only toggles play/pause when the iframe state disagrees — avoids stop-start from repeated calls.
 * Caller should invoke only on play/pause intent change or after seek (not on every heartbeat).
 */
async function applyPlaybackIfNeeded(
  player: YouTubePlayer,
  shouldPlay: boolean,
): Promise<void> {
  const st = await readYoutubePlayerState(player);
  if (st === undefined) {
    if (shouldPlay) player.playVideo();
    else player.pauseVideo();
    return;
  }
  if (shouldPlay) {
    if (st === YT_PLAYING || st === YT_BUFFERING) return;
    player.playVideo();
    return;
  }
  if (st === YT_PAUSED) return;
  player.pauseVideo();
}

/**
 * Viewer transport: when room says playing, only YT_PLAYING counts as OK — BUFFERING/PAUSED/CUED still
 * get playVideo() so playback actually starts after seek/rate (BUFFERING is not treated as “playing enough”).
 * Until `unlockedRef` is true (user gesture), do not call playVideo — avoids autoplay spam.
 */
async function ensureViewerPlaybackIntent(
  player: YouTubePlayer,
  shouldPlay: boolean,
  unlockedRef: { current: boolean },
): Promise<void> {
  if (!shouldPlay) {
    await applyPlaybackIfNeeded(player, false);
    return;
  }
  if (!unlockedRef.current) {
    return;
  }
  const st = await readYoutubePlayerState(player);
  if (st === undefined) {
    player.playVideo();
    return;
  }
  if (st === YT_PLAYING) {
    return;
  }
  player.playVideo();
}

function safeDecodeVideoId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function normalizePlaybackRate(value: unknown): number {
  if (typeof value === "number" && !Number.isNaN(value) && value > 0) {
    return value;
  }
  return DEFAULT_PLAYBACK_RATE;
}

/** YouTube `getCurrentTime` can reject or be unavailable briefly; never skip the Firebase write because of it. */
async function readYoutubeCurrentTime(
  player: YouTubePlayer | null | undefined,
  fallbackTime: number,
): Promise<number> {
  if (!player) return fallbackTime;
  const p = player as YouTubePlayer & {
    getCurrentTime?: () => number | Promise<number>;
  };
  try {
    const raw = p.getCurrentTime?.();
    const t = await Promise.resolve(raw);
    if (typeof t === "number" && !Number.isNaN(t)) return t;
  } catch {
    /* player API not ready */
  }
  return fallbackTime;
}

/** YouTube reported duration (0 if unknown / live not ready). */
async function readYoutubeDuration(
  player: YouTubePlayer | null | undefined,
): Promise<number> {
  if (!player) return 0;
  const p = player as YouTubePlayer & {
    getDuration?: () => number | Promise<number>;
  };
  try {
    const raw = p.getDuration?.();
    const d = await Promise.resolve(raw);
    if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
  } catch {
    /* API not ready */
  }
  return 0;
}

/** DVR / VOD end of playable range — max(duration, currentTime) when duration is known. */
async function readLiveEdgeTime(
  player: YouTubePlayer | null | undefined,
  fallbackTime: number,
): Promise<number> {
  const ct = await readYoutubeCurrentTime(player, fallbackTime);
  const dur = await readYoutubeDuration(player);
  if (dur > 0.25) return Math.max(dur, ct);
  return ct;
}

async function readYoutubePlaybackRate(
  player: YouTubePlayer | null | undefined,
  fallback: number,
): Promise<number> {
  if (!player) return fallback;
  const p = player as YouTubePlayer & {
    getPlaybackRate?: () => number | Promise<number>;
  };
  try {
    const raw = p.getPlaybackRate?.();
    const r = await Promise.resolve(raw);
    if (typeof r === "number" && !Number.isNaN(r) && r > 0) return r;
  } catch {
    /* API not ready */
  }
  return fallback;
}

/** True when the iframe reports playing intent (playing or buffering). */
function youtubeStateImpliesPlaying(st: number | undefined): boolean {
  return st === YT_PLAYING || st === YT_BUFFERING;
}

function useRoomHostFromSession(roomId: string): boolean {
  return useSyncExternalStore(
    subscribeToRoomHostStore,
    () => (roomId ? isRoomHost(roomId) : false),
    () => false,
  );
}

async function safeSetPlaybackRate(
  player: YouTubePlayer,
  desired: number,
): Promise<void> {
  try {
    const p = player as YouTubePlayer & {
      getAvailablePlaybackRates?: () => Promise<number[]>;
      setPlaybackRate?: (r: number) => Promise<unknown> | unknown;
    };
    let rate = desired;
    if (typeof p.getAvailablePlaybackRates === "function") {
      const available = await p.getAvailablePlaybackRates();
      if (Array.isArray(available) && available.length > 0) {
        const has = available.some((r) => Math.abs(r - desired) < 1e-6);
        if (!has) {
          rate = available.reduce((best, r) =>
            Math.abs(r - desired) < Math.abs(best - desired) ? r : best,
            available[0],
          );
        }
      }
    }
    if (typeof p.setPlaybackRate === "function") {
      await p.setPlaybackRate(rate);
    }
  } catch {
    /* unsupported or not ready */
  }
}

/**
 * Host heartbeat (`action: sync`): align to host clock without micro rate-hunting.
 * YouTube live: still follows `state.currentTime` from the host (not the iframe live edge).
 */
async function viewerApplySyncSnapshot(
  player: YouTubePlayer,
  state: RoomState,
  lastViewerSyncRateRef: { current: number },
  viewerPlaybackUnlockedRef: { current: boolean },
): Promise<void> {
  const localT = await player.getCurrentTime();
  const drift = localT - state.currentTime;
  const hostRate = state.playbackRate;
  const adrift = Math.abs(drift);

  if (state.isPlaying) {
    if (adrift <= VIEWER_HEARTBEAT_DRIFT_IGNORE_S) {
      if (
        shouldApplyViewerCorrectionRate(
          lastViewerSyncRateRef.current,
          hostRate,
          hostRate,
        )
      ) {
        await safeSetPlaybackRate(player, hostRate);
        lastViewerSyncRateRef.current = hostRate;
      }
      await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef);
      return;
    }
    if (adrift > VIEWER_HEARTBEAT_LARGE_SEEK_S) {
      syncLog("viewer heartbeat large drift → seek", {
        drift,
        hostTime: state.currentTime,
      });
      await player.seekTo(state.currentTime, true);
      await safeSetPlaybackRate(player, hostRate);
      lastViewerSyncRateRef.current = hostRate;
      await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef);
      return;
    }
    /* Moderate drift: keep host rate; avoid playback-rate nudge churn. */
    if (
      shouldApplyViewerCorrectionRate(
        lastViewerSyncRateRef.current,
        hostRate,
        hostRate,
      )
    ) {
      await safeSetPlaybackRate(player, hostRate);
      lastViewerSyncRateRef.current = hostRate;
    }
    await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef);
    return;
  } else {
    if (Math.abs(drift) > SEEK_DRIFT_PAUSED_S) {
      await player.seekTo(state.currentTime, true);
    }
    await safeSetPlaybackRate(player, hostRate);
    lastViewerSyncRateRef.current = hostRate;
    const st = await readYoutubePlayerState(player);
    if (st !== undefined && st !== YT_PAUSED) {
      await applyPlaybackIfNeeded(player, false);
    }
  }
}

async function viewerApplyInitialJoin(
  player: YouTubePlayer,
  state: RoomState,
  lastViewerSyncRateRef: { current: number },
  viewerPlaybackUnlockedRef: { current: boolean },
): Promise<void> {
  const localT = await player.getCurrentTime();
  let tForDrift = localT;
  if (Math.abs(localT - state.currentTime) > SEEK_INITIAL_SYNC_S) {
    await player.seekTo(state.currentTime, true);
    tForDrift = await player.getCurrentTime();
  }
  const drift = tForDrift - state.currentTime;
  const target = computeViewerPlaybackRate(state.playbackRate, drift);
  await safeSetPlaybackRate(player, target);
  lastViewerSyncRateRef.current = target;
  await ensureViewerPlaybackIntent(
    player,
    state.isPlaying,
    viewerPlaybackUnlockedRef,
  );
}

async function viewerApplyPlayCommand(
  player: YouTubePlayer,
  state: RoomState,
  lastViewerSyncRateRef: { current: number },
  viewerPlaybackUnlockedRef: { current: boolean },
): Promise<void> {
  const localT = await player.getCurrentTime();
  const drift = localT - state.currentTime;
  await safeSetPlaybackRate(player, state.playbackRate);
  lastViewerSyncRateRef.current = state.playbackRate;
  if (drift < -SEEK_AFTER_TRANSPORT_JUMP_S) {
    await player.seekTo(state.currentTime, true);
  }
  await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef);
}

async function viewerApplyPauseCommand(
  player: YouTubePlayer,
  state: RoomState,
  lastViewerSyncRateRef: { current: number },
): Promise<void> {
  const localT = await player.getCurrentTime();
  const drift = localT - state.currentTime;
  await safeSetPlaybackRate(player, state.playbackRate);
  lastViewerSyncRateRef.current = state.playbackRate;
  if (Math.abs(drift) > SEEK_DRIFT_PAUSED_S) {
    await player.seekTo(state.currentTime, true);
  }
  await applyPlaybackIfNeeded(player, false);
}

async function viewerApplySeekCommand(
  player: YouTubePlayer,
  state: RoomState,
  lastViewerSyncRateRef: { current: number },
  viewerPlaybackUnlockedRef: { current: boolean },
): Promise<void> {
  await player.seekTo(state.currentTime, true);
  await safeSetPlaybackRate(player, state.playbackRate);
  lastViewerSyncRateRef.current = state.playbackRate;
  await ensureViewerPlaybackIntent(
    player,
    state.isPlaying,
    viewerPlaybackUnlockedRef,
  );
}

/**
 * Immediate command path: anchor time + rate, then play/pause/seek follow-up.
 * Schedules one play/pause retry if transport state does not match.
 */
async function applyViewerImmediatePlaybackCommand(
  cmd: PlaybackCommand,
  roomSnapshot: RoomState,
  player: YouTubePlayer,
  lastViewerSyncRateRef: { current: number },
  viewerPlaybackUnlockedRef: { current: boolean },
  playRetryTimerRef: { current: number | null },
  pauseRetryTimerRef: { current: number | null },
  retryTargetCommandIdRef: { current: number },
): Promise<void> {
  if (playRetryTimerRef.current) {
    clearTimeout(playRetryTimerRef.current);
    playRetryTimerRef.current = null;
  }
  if (pauseRetryTimerRef.current) {
    clearTimeout(pauseRetryTimerRef.current);
    pauseRetryTimerRef.current = null;
  }

  await player.seekTo(cmd.anchorVideoTime, true);
  await safeSetPlaybackRate(player, cmd.playbackRate);
  lastViewerSyncRateRef.current = cmd.playbackRate;

  if (cmd.type === "play") {
    await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef);
    retryTargetCommandIdRef.current = cmd.commandId;
    playRetryTimerRef.current = window.setTimeout(() => {
      playRetryTimerRef.current = null;
      if (retryTargetCommandIdRef.current !== cmd.commandId) return;
      void (async () => {
        const st = await readYoutubePlayerState(player);
        if (st === YT_PLAYING || st === YT_BUFFERING) {
          syncLog("viewer play retry skipped", { commandId: cmd.commandId, st });
          return;
        }
        syncLog("viewer play retry", { commandId: cmd.commandId, stBefore: st });
        try {
          await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef);
        } catch {
          /* ignore */
        }
        const st2 = await readYoutubePlayerState(player);
        const ct = await readYoutubeCurrentTime(player, cmd.anchorVideoTime);
        syncLog("viewer post-apply (after play retry)", {
          commandId: cmd.commandId,
          ytState: st2,
          currentTime: ct,
        });
      })();
    }, PLAY_RETRY_MS);
  } else if (cmd.type === "pause") {
    await applyPlaybackIfNeeded(player, false);
    retryTargetCommandIdRef.current = cmd.commandId;
    pauseRetryTimerRef.current = window.setTimeout(() => {
      pauseRetryTimerRef.current = null;
      if (retryTargetCommandIdRef.current !== cmd.commandId) return;
      void (async () => {
        const st = await readYoutubePlayerState(player);
        if (st === YT_PAUSED) {
          syncLog("viewer pause retry skipped", { commandId: cmd.commandId, st });
          return;
        }
        syncLog("viewer pause retry", { commandId: cmd.commandId, stBefore: st });
        try {
          await applyPlaybackIfNeeded(player, false);
        } catch {
          /* ignore */
        }
        const st2 = await readYoutubePlayerState(player);
        const ct = await readYoutubeCurrentTime(player, cmd.anchorVideoTime);
        syncLog("viewer post-apply (after pause retry)", {
          commandId: cmd.commandId,
          ytState: st2,
          currentTime: ct,
        });
      })();
    }, PAUSE_RETRY_MS);
  } else if (cmd.type === "resync") {
    /* Authoritative snap: no play/pause retry timers (unlike play/pause). */
    if (roomSnapshot.isPlaying) {
      await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef);
    } else {
      await applyPlaybackIfNeeded(player, false);
    }
  } else {
    await ensureViewerPlaybackIntent(
      player,
      roomSnapshot.isPlaying,
      viewerPlaybackUnlockedRef,
    );
  }

  const stFinal = await readYoutubePlayerState(player);
  const ctFinal = await readYoutubeCurrentTime(player, cmd.anchorVideoTime);
  syncLog("viewer post-apply (immediate command)", {
    type: cmd.type,
    commandId: cmd.commandId,
    ytState: stFinal,
    currentTime: ctFinal,
    isPlayingIntent: roomSnapshot.isPlaying,
  });
}

/** Pre-command rooms (actionId 0): time-driven apply until host migrates or sends commands. */
async function viewerApplyLegacyTimeDriven(
  player: YouTubePlayer,
  state: RoomState,
  prev: RoomState | null,
  lastViewerSyncRateRef: { current: number },
  viewerPlaybackUnlockedRef: { current: boolean },
  stale: () => boolean,
): Promise<void> {
  const localT = await player.getCurrentTime();
  if (stale()) return;

  let tForDrift = localT;
  let didSeek = false;
  if (
    shouldSeekToRemoteTime({
      localT,
      remoteT: state.currentTime,
      isPlaying: state.isPlaying,
      prev,
      state,
    })
  ) {
    syncLog("viewer legacy drift seek", {
      drift: localT - state.currentTime,
      remoteT: state.currentTime,
    });
    await player.seekTo(state.currentTime, true);
    didSeek = true;
    tForDrift = await player.getCurrentTime();
  }
  if (stale()) return;

  const drift = tForDrift - state.currentTime;
  const hostRate = state.playbackRate;
  const targetPlaybackRate = state.isPlaying
    ? Math.abs(drift) < VIEWER_HEARTBEAT_DRIFT_IGNORE_S
      ? hostRate
      : computeViewerPlaybackRate(hostRate, drift)
    : hostRate;

  const needRate =
    !prev ||
    Math.abs(prev.playbackRate - hostRate) > 1e-6 ||
    shouldApplyViewerCorrectionRate(
      lastViewerSyncRateRef.current,
      targetPlaybackRate,
      hostRate,
    );
  if (needRate) {
    await safeSetPlaybackRate(player, targetPlaybackRate);
    lastViewerSyncRateRef.current = targetPlaybackRate;
  }
  if (stale()) return;

  const playbackIntentChanged =
    prev === null || prev.isPlaying !== state.isPlaying;
  if (playbackIntentChanged || didSeek) {
    await ensureViewerPlaybackIntent(
      player,
      state.isPlaying,
      viewerPlaybackUnlockedRef,
    );
  }
}

function RoomContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = typeof params.id === "string" ? params.id : "";
  const videoFromUrl = searchParams.get("video");
  /** Normalized 11-char id from `?video=` (URLs like /live/…, watch?v=…, youtu.be/…, or raw id). */
  const videoIdFromUrl = useMemo(() => {
    const raw = videoFromUrl?.trim();
    if (!raw) return null;
    return extractYouTubeVideoId(safeDecodeVideoId(raw));
  }, [videoFromUrl]);
  const loadSavedId = searchParams.get("loadSaved");
  const { user, loading: authLoading } = useAuth();
  const [copied, setCopied] = useState(false);
  const [clipUrlDraft, setClipUrlDraft] = useState("");
  const [telDrawOn, setTelDrawOn] = useState(false);
  /** Host-only: minimal mobile layout with video dominant + overlay controls. */
  const [isCleanMode, setIsCleanMode] = useState(false);
  const hostControlsRef = useRef<HTMLDivElement | null>(null);
  /** Live-ish playhead for chapter highlight (player when available, else room time). */
  const [uiPlaybackTime, setUiPlaybackTime] = useState<number | null>(null);
  /** Brief flash on Prev / Next chapter for pressed feedback. */
  const [chapterNavFlash, setChapterNavFlash] = useState<"prev" | "next" | null>(
    null,
  );
  const chapterNavFlashTimerRef = useRef<number | null>(null);
  /** Host-only fast-forward: 0 = off, else simulated tier (2/4/8×). */
  const [ffMode, setFfMode] = useState<(typeof FF_TIERS)[number]>(0);
  const ffModeRef = useRef<(typeof FF_TIERS)[number]>(0);
  const playbackRateBeforeFfRef = useRef(DEFAULT_PLAYBACK_RATE);

  const urlHostLegacy = searchParams.get("host") === "true";
  const sessionHost = useRoomHostFromSession(roomId);
  const isHost = urlHostLegacy || sessionHost;

  /** Host: hide YouTube fullscreen (fs:0) so the coach never loses the app control bar. Viewer: fs:1. */
  const youtubePlayerOpts = useMemo(
    () => ({
      width: YOUTUBE_PLAYER_OPTS_BASE.width,
      height: YOUTUBE_PLAYER_OPTS_BASE.height,
      playerVars: {
        ...YOUTUBE_PLAYER_OPTS_BASE.playerVars,
        fs: isHost ? 0 : 1,
      },
    }),
    [isHost],
  );

  const handleReturnHome = useCallback(() => {
    if (
      isHost &&
      !window.confirm("Leave session? Your session will continue for others.")
    ) {
      return;
    }
    router.push(user ? "/app" : "/");
  }, [isHost, router, user]);

  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const activeYouTubeVideoId = useMemo(
    () => (roomState?.videoId ?? videoIdFromUrl ?? "").trim(),
    [roomState?.videoId, videoIdFromUrl],
  );
  const playerRef = useRef<InstanceType<typeof YouTube>>(null);
  const lastAppliedKey = useRef<string>("");
  /** Monotonic generation for viewer/host apply — newer room snapshots invalidate in-flight async work. */
  const applyRoomGenRef = useRef(0);
  /** Last playback rate applied on the viewer (incl. nudge) — avoids spamming setPlaybackRate. */
  const lastViewerSyncRateRef = useRef(Number.NaN);
  /** Viewer-only: set true after explicit tap so autopolicy allows playVideo (see overlay). */
  const viewerPlaybackUnlockedRef = useRef(false);
  const [viewerPlaybackUnlocked, setViewerPlaybackUnlocked] = useState(false);
  /** Save session dialog (name + optional folder). */
  const [saveSessionOpen, setSaveSessionOpen] = useState(false);
  const [saveSessionName, setSaveSessionName] = useState("");
  const [saveSessionFolder, setSaveSessionFolder] = useState("");
  const [saveSessionOwnerUid, setSaveSessionOwnerUid] = useState<string | null>(
    null,
  );
  const [saveSessionSaving, setSaveSessionSaving] = useState(false);
  /** Host: brief "Marked" feedback after one-tap Mark Play. */
  const [markPlayState, setMarkPlayState] = useState<"idle" | "marked">("idle");
  const markPlayTimerRef = useRef<number | null>(null);
  /** Viewer: last applied `playbackCommand.commandId` (immediate path). */
  const lastAppliedCommandIdRef = useRef(0);
  const pendingPlaybackCommandRef = useRef<PlaybackCommand | null>(null);
  const playRetryTimerRef = useRef<number | null>(null);
  const pauseRetryTimerRef = useRef<number | null>(null);
  const retryTargetCommandIdRef = useRef(0);
  /** Dedupe YouTube `ENDED` for the same clip (iframe can signal more than once). */
  const youtubeEndedGuardRef = useRef<{ videoId: string; at: number } | null>(
    null,
  );
  /** True when the iframe looks like YouTube live (growing duration). */
  const isLiveStreamRef = useRef(false);
  const liveGrowthSampleRef = useRef<{ dur: number; at: number } | null>(null);
  const [isLiveStream, setIsLiveStream] = useState(false);
  /** Host-only: seconds behind DVR live edge (derived from duration vs currentTime). */
  const [liveBehindSec, setLiveBehindSec] = useState<number | null>(null);
  const applyRoomStateToPlayerRef = useRef<
    (state: RoomState, prev: RoomState | null, gen: number) => Promise<void>
  >(async () => {});
  const prevRoomRef = useRef<RoomState | null>(null);
  /** Last `prev` passed into `applyRoomStateToPlayer` (for unlock resync pair with `roomStateRef`). */
  const applyPrevSnapshotRef = useRef<RoomState | null>(null);
  const roomStateRef = useRef<RoomState | null>(null);
  /** Skip redundant host heartbeat RTDB writes when playhead barely moved. */
  const lastHostHeartbeatSentRef = useRef<number | null>(null);
  /** Last host Play tap — used to avoid heartbeat / drift-seek races on Android. */
  const hostLastPlayGestureAtRef = useRef(0);
  /** Last logged YouTube `event.data` for host (avoids duplicate BUFFERING spam). */
  const hostLastYtStateCodeRef = useRef<number | null>(null);

  const isHostRef = useRef(isHost);

  useLayoutEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    return () => {
      if (markPlayTimerRef.current !== null) {
        window.clearTimeout(markPlayTimerRef.current);
        markPlayTimerRef.current = null;
      }
    };
  }, []);

  const cleanMode = isHost && isCleanMode;

  const handleToggleCleanMode = useCallback(
    (e: React.MouseEvent) => {
      if (!isHost) return;
      const target = e.target as Node | null;
      if (target && hostControlsRef.current?.contains(target)) return;
      setIsCleanMode((v) => !v);
    },
    [isHost],
  );

  useLayoutEffect(() => {
    isHostRef.current = isHost;
  });

  useLayoutEffect(() => {
    ffModeRef.current = ffMode;
  }, [ffMode]);

  useEffect(() => {
    lastViewerSyncRateRef.current = Number.NaN;
  }, [roomId]);

  useEffect(() => {
    lastAppliedCommandIdRef.current = 0;
    pendingPlaybackCommandRef.current = null;
    if (playRetryTimerRef.current) clearTimeout(playRetryTimerRef.current);
    if (pauseRetryTimerRef.current) clearTimeout(pauseRetryTimerRef.current);
    playRetryTimerRef.current = null;
    pauseRetryTimerRef.current = null;
  }, [roomState?.videoId]);

  useEffect(() => {
    youtubeEndedGuardRef.current = null;
    liveGrowthSampleRef.current = null;
    setIsLiveStream(false);
    isLiveStreamRef.current = false;
    setLiveBehindSec(null);
    lastHostHeartbeatSentRef.current = null;
    hostLastYtStateCodeRef.current = null;
  }, [activeYouTubeVideoId]);

  useLayoutEffect(() => {
    isLiveStreamRef.current = isLiveStream;
  }, [isLiveStream]);

  useEffect(() => {
    viewerPlaybackUnlockedRef.current = false;
    setClipUrlDraft("");
    setViewerPlaybackUnlocked(false);
    if (chapterNavFlashTimerRef.current !== null) {
      window.clearTimeout(chapterNavFlashTimerRef.current);
      chapterNavFlashTimerRef.current = null;
    }
    setChapterNavFlash(null);
  }, [roomId]);

  useEffect(() => {
    return () => {
      if (chapterNavFlashTimerRef.current !== null) {
        window.clearTimeout(chapterNavFlashTimerRef.current);
        chapterNavFlashTimerRef.current = null;
      }
    };
  }, []);

  const pulseChapterNav = useCallback((which: "prev" | "next") => {
    if (chapterNavFlashTimerRef.current !== null) {
      window.clearTimeout(chapterNavFlashTimerRef.current);
    }
    setChapterNavFlash(which);
    chapterNavFlashTimerRef.current = window.setTimeout(() => {
      chapterNavFlashTimerRef.current = null;
      setChapterNavFlash(null);
    }, 220);
  }, []);

  useEffect(() => {
    const tick = () => {
      const cur = roomStateRef.current;
      if (!cur) {
        setUiPlaybackTime(null);
        return;
      }
      const p = playerRef.current?.getInternalPlayer() as
        | YouTubePlayer
        | undefined;
      if (isHostRef.current || viewerPlaybackUnlockedRef.current) {
        void readYoutubeCurrentTime(p, cur.currentTime ?? 0).then(
          setUiPlaybackTime,
        );
      } else {
        setUiPlaybackTime(cur.currentTime ?? 0);
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [roomId, viewerPlaybackUnlocked]);

  useEffect(() => {
    const onVisibleOrFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (isHostRef.current) return;
      const s = roomStateRef.current;
      const p = playerRef.current?.getInternalPlayer() as
        | YouTubePlayer
        | undefined;
      if (!s || !p) return;
      syncLog("viewer visibility/focus → reconcile");
      void viewerApplySyncSnapshot(
        p,
        s,
        lastViewerSyncRateRef,
        viewerPlaybackUnlockedRef,
      ).then(async () => {
        const st = await readYoutubePlayerState(p);
        const ct = await readYoutubeCurrentTime(p, s.currentTime);
        syncLog("viewer post-apply (visibility reconcile)", {
          action: s.action,
          ytState: st,
          currentTime: ct,
        });
      });
    };
    document.addEventListener("visibilitychange", onVisibleOrFocus);
    window.addEventListener("focus", onVisibleOrFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibleOrFocus);
      window.removeEventListener("focus", onVisibleOrFocus);
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    if (searchParams.get("host") === "true") {
      markRoomHost(roomId);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("host");
      const q = next.toString();
      router.replace(`/room/${roomId}${q ? `?${q}` : ""}`, { scroll: false });
    }
  }, [roomId, router, searchParams]);

  const roomRef = useMemo(
    () => (roomId ? ref(db, `rooms/${roomId}`) : null),
    [roomId],
  );

  const roomRefForWrite = useRef(roomRef);

  useLayoutEffect(() => {
    roomRefForWrite.current = roomRef;
  });

  const hostActionSeqRef = useRef(1);

  useEffect(() => {
    if (isHost && roomState && typeof roomState.actionId === "number") {
      hostActionSeqRef.current = Math.max(
        hostActionSeqRef.current,
        roomState.actionId,
      );
    }
  }, [isHost, roomState]);

  useEffect(() => {
    if (!roomRef || !isHost || !videoIdFromUrl) return;
    if (loadSavedId && authLoading) return;

    const vid = videoIdFromUrl;

    void get(roomRef).then(async (snap) => {
      if (snap.exists()) {
        const d = snap.val() as Record<string, unknown> | null;
        const needsClipMigration =
          !d ||
          !Array.isArray(d.clips) ||
          (d.clips as unknown[]).length === 0;
        const legacyAction =
          d && typeof (d as { actionId?: unknown }).actionId !== "number";
        if (needsClipMigration && d && typeof d.videoId === "string") {
          void update(roomRef, {
            clips: [{ videoId: d.videoId as string }],
            currentClipIndex: 0,
            updatedAt: serverTimestamp(),
            ...(legacyAction
              ? { action: "init", actionId: 1 }
              : {}),
          });
        } else if (legacyAction) {
          void update(roomRef, {
            action: "init",
            actionId: 1,
            updatedAt: serverTimestamp(),
          });
        }
        return;
      }

      if (loadSavedId && user) {
        try {
          const template = await getSavedSession(user.uid, loadSavedId);
          if (
            template &&
            Array.isArray(template.clips) &&
            template.clips.length > 0
          ) {
            const idx = Math.min(
              Math.max(0, template.currentClipIndex),
              template.clips.length - 1,
            );
            const activeId = template.clips[idx]?.videoId ?? vid;
            const tplAngles = template.angles;
            const multiAngle =
              Array.isArray(tplAngles) && tplAngles.length > 1 ? tplAngles : null;
            void set(roomRef, {
              videoId: activeId,
              clips: template.clips.map((c) => ({
                videoId: c.videoId,
                ...(typeof c.label === "string" && c.label.trim() !== ""
                  ? { label: c.label.trim() }
                  : {}),
              })),
              currentClipIndex: idx,
              chapters: (template.chapters ?? []).map((ch) => ({
                time: ch.time,
                label: ch.label,
                videoId: ch.videoId,
                ...(typeof ch.gameTime === "number" ? { gameTime: ch.gameTime } : {}),
              })),
              ...(multiAngle
                ? {
                    angles: multiAngle,
                    currentAngleId:
                      template.currentAngleId &&
                      multiAngle.some((a) => a.id === template.currentAngleId)
                        ? template.currentAngleId
                        : multiAngle[0]!.id,
                  }
                : {}),
              isPlaying: false,
              currentTime: 0,
              playbackRate: DEFAULT_PLAYBACK_RATE,
              playbackCommand: null,
              updatedAt: serverTimestamp(),
              action: "init",
              actionId: 1,
            });
            router.replace(
              `/room/${roomId}?video=${encodeURIComponent(activeId)}`,
            );
            return;
          }
        } catch {
          /* fall through to default room */
        }
      }

      void set(roomRef, {
        videoId: vid,
        clips: [{ videoId: vid }],
        currentClipIndex: 0,
        isPlaying: false,
        currentTime: 0,
        playbackRate: DEFAULT_PLAYBACK_RATE,
        playbackCommand: null,
        chapters: [],
        updatedAt: serverTimestamp(),
        action: "init",
        actionId: 1,
      });
    });
  }, [
    roomRef,
    isHost,
    videoIdFromUrl,
    loadSavedId,
    user,
    authLoading,
    roomId,
    router,
  ]);

  useEffect(() => {
    if (!roomRef) return;
    const unsub = onValue(roomRef, (snap) => {
      const raw = snap.val() as Record<string, unknown> | null;
      const parsed = parseRoomFromDb(raw);
      setRoomState(parsed);
    });
    return () => unsub();
  }, [roomRef]);

  const applyRoomStateToPlayer = useCallback(
    async (state: RoomState, prev: RoomState | null, gen: number) => {
      const stale = () => gen !== applyRoomGenRef.current;
      if (stale()) return;

      const yt = playerRef.current;
      const player = yt?.getInternalPlayer() as YouTubePlayer | null | undefined;

      if (!isHost) {
        const cmd = state.playbackCommand;
        const cmdFresh =
          !!cmd &&
          (cmd.type === "play" ||
            cmd.type === "pause" ||
            cmd.type === "seek" ||
            cmd.type === "resync") &&
          cmd.activeVideoId === state.videoId &&
          cmd.commandId > lastAppliedCommandIdRef.current;

        if (cmdFresh) {
          if (!player) {
            pendingPlaybackCommandRef.current = cmd;
            syncLog("viewer receive (deferred, no player)", cmd);
            return;
          }
        }
      }

      if (!player) return;

      if (stale()) return;

      const key = stableKey(state);
      if (key === lastAppliedKey.current) return;

      const rateOnly = isRateOnlyFirebaseUpdate(prev, state);

      try {
        if (rateOnly && (isHost || !state.actionId)) {
          if (stale()) return;
          await safeSetPlaybackRate(player, state.playbackRate);
          if (!isHost) {
            lastViewerSyncRateRef.current = state.playbackRate;
          }
          if (stale()) return;
          lastAppliedKey.current = key;
          return;
        }

        if (isUpdatedAtOnlyFirebaseUpdate(prev, state)) {
          if (stale()) return;
          lastAppliedKey.current = key;
          return;
        }

        if (!isHost) {
          if (prev === null) {
            if (stale()) return;
            await viewerApplyInitialJoin(
              player,
              state,
              lastViewerSyncRateRef,
              viewerPlaybackUnlockedRef,
            );
            if (stale()) return;
            lastAppliedCommandIdRef.current = Math.max(
              lastAppliedCommandIdRef.current,
              state.playbackCommand?.commandId ?? 0,
            );
            lastAppliedKey.current = key;
            return;
          }

          if (!state.actionId) {
            if (stale()) return;
            await viewerApplyLegacyTimeDriven(
              player,
              state,
              prev,
              lastViewerSyncRateRef,
              viewerPlaybackUnlockedRef,
              stale,
            );
            if (stale()) return;
            lastAppliedKey.current = key;
            return;
          }

          if (stale()) return;

          const cmd = state.playbackCommand;
          const cmdApply =
            !!cmd &&
            (cmd.type === "play" ||
              cmd.type === "pause" ||
              cmd.type === "seek" ||
              cmd.type === "resync") &&
            cmd.activeVideoId === state.videoId &&
            cmd.commandId > lastAppliedCommandIdRef.current;

          if (cmdApply) {
            syncLog("viewer immediate apply", cmd);
            await applyViewerImmediatePlaybackCommand(
              cmd,
              state,
              player,
              lastViewerSyncRateRef,
              viewerPlaybackUnlockedRef,
              playRetryTimerRef,
              pauseRetryTimerRef,
              retryTargetCommandIdRef,
            );
            lastAppliedCommandIdRef.current = cmd.commandId;
          }

          if (stale()) return;

          switch (state.action) {
            case "sync":
              await viewerApplySyncSnapshot(
                player,
                state,
                lastViewerSyncRateRef,
                viewerPlaybackUnlockedRef,
              );
              break;
            case "rate":
              await safeSetPlaybackRate(player, state.playbackRate);
              lastViewerSyncRateRef.current = state.playbackRate;
              break;
            case "seek":
              if (
                !state.playbackCommand ||
                state.playbackCommand.activeVideoId !== state.videoId
              ) {
                await viewerApplySeekCommand(
                  player,
                  state,
                  lastViewerSyncRateRef,
                  viewerPlaybackUnlockedRef,
                );
              }
              break;
            case "resync":
              if (
                !state.playbackCommand ||
                state.playbackCommand.activeVideoId !== state.videoId
              ) {
                await player.seekTo(state.currentTime, true);
                await safeSetPlaybackRate(player, state.playbackRate);
                lastViewerSyncRateRef.current = state.playbackRate;
                if (state.isPlaying) {
                  await ensureViewerPlaybackIntent(
                    player,
                    true,
                    viewerPlaybackUnlockedRef,
                  );
                } else {
                  await applyPlaybackIfNeeded(player, false);
                }
              }
              break;
            case "play":
              if (
                !state.playbackCommand ||
                state.playbackCommand.activeVideoId !== state.videoId
              ) {
                await viewerApplyPlayCommand(
                  player,
                  state,
                  lastViewerSyncRateRef,
                  viewerPlaybackUnlockedRef,
                );
              }
              break;
            case "pause":
              if (
                !state.playbackCommand ||
                state.playbackCommand.activeVideoId !== state.videoId
              ) {
                await viewerApplyPauseCommand(
                  player,
                  state,
                  lastViewerSyncRateRef,
                );
              }
              break;
            case "clip":
            case "init":
              await viewerApplyInitialJoin(
                player,
                state,
                lastViewerSyncRateRef,
                viewerPlaybackUnlockedRef,
              );
              break;
            default:
              await viewerApplyInitialJoin(
                player,
                state,
                lastViewerSyncRateRef,
                viewerPlaybackUnlockedRef,
              );
          }
          if (stale()) return;
          lastAppliedKey.current = key;
          return;
        }

        const localT = await player.getCurrentTime();
        if (stale()) return;

        if (
          prev &&
          state.isPlaying &&
          prev.isPlaying &&
          prev.videoId === state.videoId &&
          Math.abs(localT - state.currentTime) < 1.0
        ) {
          if (stale()) return;
          lastAppliedKey.current = key;
          return;
        }

        if (stale()) return;

        let didSeek = false;
        const pauseToPlayEdge =
          !!prev && !prev.isPlaying && state.isPlaying;
        if (pauseToPlayEdge) {
          syncLog("host apply: skip drift seek (pause→play edge)", {
            localT,
            remoteT: state.currentTime,
            action: state.action,
          });
        }
        if (
          !pauseToPlayEdge &&
          shouldSeekToRemoteTime({
            localT,
            remoteT: state.currentTime,
            isPlaying: state.isPlaying,
            prev,
            state,
          })
        ) {
          syncLog("host apply: drift seek to room time", {
            localT,
            remoteT: state.currentTime,
          });
          await player.seekTo(state.currentTime, true);
          didSeek = true;
          await player.getCurrentTime();
        }
        if (stale()) return;

        const hostRate = state.playbackRate;
        if (
          !prev ||
          Math.abs(prev.playbackRate - hostRate) > 1e-6
        ) {
          await safeSetPlaybackRate(player, hostRate);
        }
        if (stale()) return;

        const playbackIntentChanged =
          prev === null || prev.isPlaying !== state.isPlaying;
        if (playbackIntentChanged || didSeek) {
          await applyPlaybackIfNeeded(player, state.isPlaying);
        }
        if (stale()) return;

        lastAppliedKey.current = key;
      } catch {
        if (!stale()) {
          lastAppliedKey.current = "";
          queueMicrotask(() => {
            const retry = roomStateRef.current;
            if (!retry || stableKey(retry) !== key) return;
            const g = ++applyRoomGenRef.current;
            void applyRoomStateToPlayerRef.current(retry, prev, g);
          });
        }
      }
    },
    [isHost],
  );

  useLayoutEffect(() => {
    applyRoomStateToPlayerRef.current = applyRoomStateToPlayer;
  });

  useEffect(() => {
    if (!roomState) {
      prevRoomRef.current = null;
      applyPrevSnapshotRef.current = null;
      return;
    }
    const prev = prevRoomRef.current;
    prevRoomRef.current = roomState;
    applyPrevSnapshotRef.current = prev;
    const gen = ++applyRoomGenRef.current;
    void applyRoomStateToPlayer(roomState, prev, gen);
  }, [roomState, applyRoomStateToPlayer]);

  const getPlayer = () =>
    playerRef.current?.getInternalPlayer() as YouTubePlayer | null | undefined;

  /** Detect YouTube live / DVR window: duration increases while the player is playing. */
  useEffect(() => {
    if (!activeYouTubeVideoId) return;
    const id = window.setInterval(() => {
      const p = playerRef.current?.getInternalPlayer() as
        | YouTubePlayer
        | undefined;
      if (!p) return;
      void (async () => {
        const d = await readYoutubeDuration(p);
        const st = await readYoutubePlayerState(p);
        const playing = youtubeStateImpliesPlaying(st);
        const prev = liveGrowthSampleRef.current;
        if (
          playing &&
          d >= LIVE_DURATION_MIN_BASE_S &&
          prev !== null &&
          d > prev.dur + LIVE_DURATION_GROWTH_S
        ) {
          syncLog("live mode detected (growing duration)", {
            prevDur: prev.dur,
            nextDur: d,
          });
          setIsLiveStream(true);
          isLiveStreamRef.current = true;
        }
        liveGrowthSampleRef.current = { dur: d, at: Date.now() };
      })();
    }, 4000);
    return () => window.clearInterval(id);
  }, [activeYouTubeVideoId]);

  /** Host: how far behind the DVR live edge (seconds). */
  useEffect(() => {
    if (!isHost || !isLiveStream) {
      setLiveBehindSec(null);
      return;
    }
    const tick = () => {
      const p = playerRef.current?.getInternalPlayer() as YouTubePlayer | undefined;
      if (!p) return;
      void (async () => {
        const fb = roomStateRef.current?.currentTime ?? 0;
        const ct = await readYoutubeCurrentTime(p, fb);
        const edge = await readLiveEdgeTime(p, ct);
        setLiveBehindSec(Math.max(0, edge - ct));
      })();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isHost, isLiveStream, activeYouTubeVideoId]);

  const handleViewerPlaybackUnlock = useCallback(() => {
    viewerPlaybackUnlockedRef.current = true;
    setViewerPlaybackUnlocked(true);
    const p = getPlayer();
    if (p) {
      try {
        p.playVideo();
      } catch {
        /* autoplay / API */
      }
    }
    const s = roomStateRef.current;
    if (s) {
      lastAppliedKey.current = "";
      const gen = ++applyRoomGenRef.current;
      void applyRoomStateToPlayerRef.current(
        s,
        applyPrevSnapshotRef.current,
        gen,
      );
    }
  }, []);

  const writeHostTransport = useCallback(
    (
      partial: Record<string, unknown>,
      action: TransportAction,
      options?: { clearPlaybackCommand?: boolean },
    ) => {
      const rr = roomRefForWrite.current;
      if (!rr || !isHostRef.current) return;
      hostActionSeqRef.current += 1;
      if (action !== "sync") {
        const clipIdx =
          action === "clip" && typeof partial.currentClipIndex === "number"
            ? (partial.currentClipIndex as number)
            : undefined;
        syncLog("host playback event", {
          transportAction: action,
          ...(clipIdx !== undefined ? { currentClipIndex: clipIdx } : {}),
          clearCommand: Boolean(options?.clearPlaybackCommand),
        });
      }
      void update(rr, {
        ...partial,
        ...(options?.clearPlaybackCommand ? { playbackCommand: null } : {}),
        action,
        actionId: hostActionSeqRef.current,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* RTDB permission / network — avoid unhandled rejection */
      });
    },
    [],
  );

  /** Exit fast-forward and restore pre-FF playback rate; returns rate to use for the next transport write. */
  const clearFfIfActive = useCallback((): number => {
    if (ffModeRef.current === 0) {
      return roomStateRef.current?.playbackRate ?? DEFAULT_PLAYBACK_RATE;
    }
    const r = playbackRateBeforeFfRef.current;
    setFfMode(0);
    writeHostTransport({ playbackRate: r }, "rate");
    return r;
  }, [writeHostTransport]);

  const cycleFf = useCallback(() => {
    if (!isHost) return;
    const prev = ffModeRef.current;
    const i = FF_TIERS.indexOf(prev);
    const next = FF_TIERS[(i + 1) % FF_TIERS.length]!;
    if (prev === 0 && next === 2) {
      playbackRateBeforeFfRef.current =
        roomStateRef.current?.playbackRate ?? DEFAULT_PLAYBACK_RATE;
    }
    if (next === 0) {
      writeHostTransport(
        { playbackRate: playbackRateBeforeFfRef.current },
        "rate",
      );
      setFfMode(0);
      return;
    }
    writeHostTransport({ playbackRate: FF_NATIVE_CAP }, "rate");
    setFfMode(next);
  }, [isHost, writeHostTransport]);

  /** Simulated 4× / 8×: YouTube stays at 2×; extra advance is applied via periodic seeks + time sync. */
  useEffect(() => {
    if (!isHost) return;
    if (ffMode !== 4 && ffMode !== 8) return;
    if (!roomState?.isPlaying) return;
    const id = window.setInterval(() => {
      if (!isHostRef.current) return;
      const tier = ffModeRef.current;
      if (tier !== 4 && tier !== 8) return;
      if (!roomStateRef.current?.isPlaying) return;
      const player = getPlayer();
      if (!player) return;
      void (async () => {
        const cur = roomStateRef.current;
        if (!cur?.isPlaying) return;
        const fb = cur.currentTime ?? 0;
        const t = await readYoutubeCurrentTime(player, fb);
        const wallSec = FF_SIM_MS / 1000;
        const extra = (tier - FF_NATIVE_CAP) * wallSec;
        let newT = Math.max(0, t + extra);
        if (isLiveStreamRef.current) {
          const edge = await readLiveEdgeTime(player, t);
          newT = Math.min(
            newT,
            Math.max(0, edge - LIVE_EDGE_CLAMP_PAD_S),
          );
        }
        try {
          (
            player as YouTubePlayer & {
              seekTo?: (s: number, allowSeekAhead: boolean) => void;
            }
          ).seekTo?.(newT, true);
        } catch {
          /* YouTube API */
        }
        writeHostTransport(
          {
            isPlaying: true,
            currentTime: newT,
            playbackRate: FF_NATIVE_CAP,
          },
          "sync",
        );
      })();
    }, FF_SIM_MS);
    return () => window.clearInterval(id);
  }, [isHost, ffMode, roomState?.isPlaying, writeHostTransport]);

  const writeImmediatePlaybackCommand = useCallback(
    (
      transportAction: "play" | "pause" | "seek" | "resync",
      fields: {
        currentTime: number;
        isPlaying: boolean;
        playbackRate: number;
        /** When switching camera angle / stream while seeking. */
        videoId?: string;
        currentAngleId?: string;
      },
    ) => {
      const rr = roomRefForWrite.current;
      if (!rr || !isHostRef.current || !roomId) return;
      hostActionSeqRef.current += 1;
      const commandId = hostActionSeqRef.current;
      const activeVideoId =
        fields.videoId ?? roomStateRef.current?.videoId ?? "";
      const playbackCommand: PlaybackCommand = {
        type: transportAction,
        roomId,
        activeVideoId,
        issuedAt: Date.now(),
        anchorVideoTime: fields.currentTime,
        playbackRate: fields.playbackRate,
        commandId,
      };
      syncLog("host playback event", {
        type: transportAction,
        commandId,
        anchorVideoTime: fields.currentTime,
        isPlaying: fields.isPlaying,
        playbackRate: fields.playbackRate,
      });
      void update(rr, {
        isPlaying: fields.isPlaying,
        currentTime: fields.currentTime,
        playbackRate: fields.playbackRate,
        ...(fields.videoId ? { videoId: fields.videoId } : {}),
        ...(fields.currentAngleId ? { currentAngleId: fields.currentAngleId } : {}),
        playbackCommand,
        action: transportAction === "resync" ? "resync" : transportAction,
        actionId: commandId,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* RTDB */
      });
    },
    [roomId],
  );

  /**
   * When a clip ends, keep the session on this video (no autoplay into YouTube’s next).
   * Everyone: seek slightly before the true end + pause locally.
   * Host: also writes paused state to the room so viewers stay in sync.
   */
  const handleYoutubeStateChange = useCallback(
    (event: { data: number; target: YouTubePlayer }) => {
      if (isHostRef.current && event.data !== hostLastYtStateCodeRef.current) {
        hostLastYtStateCodeRef.current = event.data;
        syncLog("host yt player state", {
          state: youtubeStateLabel(event.data),
          code: event.data,
        });
      }
      if (event.data !== YT_ENDED) return;
      if (isLiveStreamRef.current) {
        syncLog("YT_ENDED ignored (YouTube live mode)");
        return;
      }

      const vid = roomStateRef.current?.videoId ?? "";
      const now = Date.now();
      const guard = youtubeEndedGuardRef.current;
      if (guard && guard.videoId === vid && now - guard.at < 900) return;
      youtubeEndedGuardRef.current = { videoId: vid, at: now };

      const player = event.target;
      let endTime = roomStateRef.current?.currentTime ?? 0;
      try {
        const raw = (
          player as YouTubePlayer & { getDuration?: () => number }
        ).getDuration?.();
        const d =
          typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
        if (d > 0.5) {
          endTime = Math.max(0, d - 0.25);
          player.seekTo?.(endTime, true);
        }
        player.pauseVideo?.();
      } catch {
        /* YouTube API */
      }

      if (!isHostRef.current) return;

      const cur = roomStateRef.current;
      if (!cur) return;
      writeImmediatePlaybackCommand("pause", {
        isPlaying: false,
        currentTime: endTime,
        playbackRate: cur.playbackRate ?? DEFAULT_PLAYBACK_RATE,
      });
    },
    [writeImmediatePlaybackCommand],
  );

  /** Seek on current clip, or switch clip + seek (chapter jump) using the same seek / playbackCommand path. */
  const jumpToChapter = useCallback(
    (chapter: ChapterEntry) => {
      if (!isHost) return;
      const rr = roomRefForWrite.current;
      if (!rr || !roomId) return;
      const pr = clearFfIfActive();
      const cur = roomStateRef.current;
      if (!cur) return;
      const clipIdx = cur.clips.findIndex((c) => c.videoId === chapter.videoId);
      if (clipIdx < 0) return;

      const curAngle = pickAngle(cur.angles, cur.currentAngleId);
      const gameT = chapterGameMoment(chapter);
      const seekTime = angleTimeFromGameTime(gameT, curAngle);
      const sameClip = clipIdx === cur.currentClipIndex;

      if (sameClip) {
        writeImmediatePlaybackCommand("seek", {
          currentTime: seekTime,
          isPlaying: cur.isPlaying,
          playbackRate: pr,
        });
        return;
      }

      const refAngle = cur.angles[0] ?? curAngle;
      const targetClip = cur.clips[clipIdx]!;
      const crossSeek = angleTimeFromGameTime(gameT, refAngle);
      const primaryAngleId = cur.angles[0]?.id ?? cur.currentAngleId;

      lastAppliedKey.current = "";
      hostActionSeqRef.current += 1;
      const commandId = hostActionSeqRef.current;
      const playbackCommand: PlaybackCommand = {
        type: "seek",
        roomId,
        activeVideoId: targetClip.videoId,
        issuedAt: Date.now(),
        anchorVideoTime: crossSeek,
        playbackRate: pr,
        commandId,
      };
      syncLog("host chapter jump (cross-clip)", playbackCommand);
      void update(rr, {
        videoId: targetClip.videoId,
        currentClipIndex: clipIdx,
        currentTime: crossSeek,
        currentAngleId: primaryAngleId,
        isPlaying: cur.isPlaying,
        playbackRate: pr,
        playbackCommand,
        action: "seek",
        actionId: commandId,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* RTDB */
      });
    },
    [isHost, roomId, clearFfIfActive, writeImmediatePlaybackCommand],
  );

  const handleAddChapter = useCallback(() => {
    if (!isHost) return;
    const rr = roomRefForWrite.current;
    if (!rr) return;
    const cur = roomStateRef.current;
    if (!cur) return;

    const rawName = window.prompt("Enter chapter name (optional)");
    const trimmed =
      typeof rawName === "string" ? rawName.trim() : "";

    void (async () => {
      const player = getPlayer();
      const t = await readYoutubeCurrentTime(
        player,
        cur.currentTime ?? 0,
      );
      const n = cur.chapters.length + 1;
      const label = trimmed.length > 0 ? trimmed : `Chapter ${n}`;
      const curAngle = pickAngle(cur.angles, cur.currentAngleId);
      const gameTime = gameTimeFromAngleTime(t, curAngle);
      const refAngle = cur.angles[0] ?? curAngle;
      const refPlaybackTime = angleTimeFromGameTime(gameTime, refAngle);
      const canonicalClipId =
        cur.clips[cur.currentClipIndex]?.videoId ?? cur.videoId;
      const next: ChapterEntry[] = [
        ...cur.chapters,
        {
          time: refPlaybackTime,
          gameTime,
          label,
          videoId: canonicalClipId,
        },
      ];
      void update(rr, {
        chapters: next,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* RTDB */
      });
    })();
  }, [isHost]);

  const handleMarkPlay = useCallback(() => {
    if (!isHost) return;
    const rr = roomRefForWrite.current;
    if (!rr) return;

    void (async () => {
      const player = getPlayer();
      const cur = roomStateRef.current;
      if (!cur) return;
      const t = await readYoutubeCurrentTime(
        player,
        cur.currentTime ?? 0,
      );
      const label = nextMarkPlayLabel(cur.chapters);
      const curAngle = pickAngle(cur.angles, cur.currentAngleId);
      const gameTime = gameTimeFromAngleTime(t, curAngle);
      const refAngle = cur.angles[0] ?? curAngle;
      const refPlaybackTime = angleTimeFromGameTime(gameTime, refAngle);
      const canonicalClipId =
        cur.clips[cur.currentClipIndex]?.videoId ?? cur.videoId;
      const next: ChapterEntry[] = [
        ...cur.chapters,
        {
          time: refPlaybackTime,
          gameTime,
          label,
          videoId: canonicalClipId,
        },
      ];
      try {
        await update(rr, {
          chapters: next,
          updatedAt: serverTimestamp(),
        });
        if (markPlayTimerRef.current !== null) {
          window.clearTimeout(markPlayTimerRef.current);
        }
        setMarkPlayState("marked");
        markPlayTimerRef.current = window.setTimeout(() => {
          setMarkPlayState("idle");
          markPlayTimerRef.current = null;
        }, 1200);
      } catch {
        /* RTDB */
      }
    })();
  }, [isHost]);

  const handleDeleteChapter = useCallback((index: number) => {
    if (!isHost) return;
    const rr = roomRefForWrite.current;
    if (!rr) return;
    const cur = roomStateRef.current;
    if (!cur || index < 0 || index >= cur.chapters.length) return;
    const ch = cur.chapters[index];
    if (!ch) return;
    if (!window.confirm(`Delete chapter "${ch.label}"?`)) return;
    const next = cur.chapters.filter((_, j) => j !== index);
    void update(rr, {
      chapters: next,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      /* RTDB */
    });
  }, [isHost]);

  const handleRenameChapter = useCallback((index: number) => {
    if (!isHost) return;
    const rr = roomRefForWrite.current;
    if (!rr) return;
    const cur = roomStateRef.current;
    if (!cur || index < 0 || index >= cur.chapters.length) return;
    const ch = cur.chapters[index];
    if (!ch) return;
    const raw = window.prompt("Rename chapter", ch.label);
    if (raw === null) return;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed === "" || trimmed === ch.label) return;
    const next = cur.chapters.map((c, j) =>
      j === index ? { ...c, label: trimmed } : c,
    );
    void update(rr, {
      chapters: next,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      /* RTDB */
    });
  }, [isHost]);

  const handleRenameClip = useCallback((index: number) => {
    if (!isHost) return;
    const rr = roomRefForWrite.current;
    if (!rr) return;
    const cur = roomStateRef.current;
    if (!cur || index < 0 || index >= cur.clips.length) return;
    const clip = cur.clips[index];
    if (!clip) return;
    const current = formatClipLabel(clip, index);
    const raw = window.prompt("Rename clip", current);
    if (raw === null) return;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed === "" || trimmed === current) return;
    const next = cur.clips.map((c, j) => {
      if (j !== index) return c;
      return { videoId: c.videoId, label: trimmed };
    });
    void update(rr, {
      clips: next,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      /* RTDB */
    });
  }, [isHost]);

  const handleAddClip = useCallback(() => {
    if (!isHost) return;
    const rr = roomRefForWrite.current;
    if (!rr) return;
    const cur = roomStateRef.current;
    if (cur && cur.angles.length > 1) {
      window.alert(
        "Remove extra camera angles before adding another clip to the queue.",
      );
      return;
    }
    const id = extractYouTubeVideoId(clipUrlDraft);
    if (!id) return;
    setClipUrlDraft("");

    void (async () => {
      let label: string | undefined;
      try {
        const res = await fetch(
          `/api/youtube-title?videoId=${encodeURIComponent(id)}`,
        );
        let data: { title?: string | null } = {};
        try {
          data = (await res.json()) as { title?: string | null };
        } catch {
          console.warn("[CLIP] title fetch failed (could not parse JSON)");
        }
        if (!res.ok) {
          console.warn("[CLIP] title fetch failed", `(HTTP ${res.status})`);
        } else {
          const t =
            typeof data.title === "string" ? data.title.trim() : "";
          if (t) {
            label = t;
            console.log("[CLIP] title fetched:", t);
          } else {
            console.warn("[CLIP] title fetch failed (no usable title)");
          }
        }
      } catch (err) {
        console.warn("[CLIP] title fetch failed", err);
      }

      const latest = roomStateRef.current;
      if (!latest) return;

      const newClip =
        label && label.length > 0
          ? { videoId: id, label }
          : { videoId: id };
      console.log("[CLIP] final clip object:", newClip);
      const next = [...latest.clips, newClip];
      void update(rr, {
        clips: next,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* RTDB */
      });
    })();
  }, [isHost, clipUrlDraft]);

  const handleRemoveClip = useCallback(
    (index: number) => {
      if (!isHost || !roomId) return;
      const rr = roomRefForWrite.current;
      if (!rr) return;
      const cur = roomStateRef.current;
      if (!cur || index < 0 || index >= cur.clips.length) return;
      const removing = cur.clips[index];
      if (!removing) return;
      const label = formatClipLabel(removing, index);
      if (!window.confirm(`Remove "${label}" from the queue?`)) return;

      clearFfIfActive();

      const nextClips = cur.clips.filter((_, j) => j !== index);
      const nextVidSet = new Set(nextClips.map((c) => c.videoId));
      const nextChapters = cur.chapters.filter((ch) => nextVidSet.has(ch.videoId));

      const isActive = index === cur.currentClipIndex;

      if (!isActive) {
        let newIdx = cur.currentClipIndex;
        if (index < cur.currentClipIndex) newIdx--;
        void update(rr, {
          clips: nextClips,
          chapters: nextChapters,
          currentClipIndex: newIdx,
          updatedAt: serverTimestamp(),
        }).catch(() => {
          /* RTDB */
        });
        return;
      }

      // Active clip removed: explicit clip transport when switching to another video.
      if (nextClips.length === 0) {
        const only: ClipEntry = {
          videoId: removing.videoId,
          ...(removing.label?.trim()
            ? { label: removing.label.trim() }
            : {}),
        };
        const single = [only];
        const vidSet = new Set(single.map((c) => c.videoId));
        const chaptersSingle = cur.chapters.filter((ch) => vidSet.has(ch.videoId));
        lastAppliedKey.current = "";
        void remove(ref(db, `rooms/${roomId}/telestrator/strokes`));
        writeHostTransport(
          {
            clips: single,
            chapters: chaptersSingle,
            videoId: only.videoId,
            currentClipIndex: 0,
            currentTime: 0,
            isPlaying: false,
            playbackRate: cur.playbackRate ?? DEFAULT_PLAYBACK_RATE,
          },
          "clip",
          { clearPlaybackCommand: true },
        );
        return;
      }

      const target: ClipEntry =
        index < cur.clips.length - 1
          ? cur.clips[index + 1]!
          : cur.clips[index - 1]!;
      const newIdx = nextClips.findIndex((c) => c.videoId === target.videoId);
      if (newIdx < 0) return;

      lastAppliedKey.current = "";
      void remove(ref(db, `rooms/${roomId}/telestrator/strokes`));
      writeHostTransport(
        {
          clips: nextClips,
          chapters: nextChapters,
          videoId: target.videoId,
          currentClipIndex: newIdx,
          currentTime: 0,
          isPlaying: false,
          playbackRate: cur.playbackRate ?? DEFAULT_PLAYBACK_RATE,
        },
        "clip",
        { clearPlaybackCommand: true },
      );
    },
    [isHost, roomId, clearFfIfActive, writeHostTransport],
  );

  const handleClearClips = useCallback(() => {
    if (!isHost) return;
    const rr = roomRefForWrite.current;
    if (!rr) return;
    const cur = roomStateRef.current;
    if (!cur || cur.clips.length <= 1) return;
    if (
      !window.confirm(
        "Keep only the current clip and remove all others? Chapters on other clips will be removed.",
      )
    ) {
      return;
    }
    clearFfIfActive();
    const active = cur.clips[cur.currentClipIndex];
    if (!active) return;
    const nextClips = [active];
    const nextVidSet = new Set(nextClips.map((c) => c.videoId));
    const nextChapters = cur.chapters.filter((ch) => nextVidSet.has(ch.videoId));
    void update(rr, {
      clips: nextClips,
      currentClipIndex: 0,
      chapters: nextChapters,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      /* RTDB */
    });
  }, [isHost, clearFfIfActive]);

  const handleSelectClip = useCallback(
    (index: number) => {
      if (!isHost || !roomId) return;
      clearFfIfActive();
      const cur = roomStateRef.current;
      if (!cur || index < 0 || index >= cur.clips.length) return;
      if (index === cur.currentClipIndex) return;
      const clip = cur.clips[index];
      if (!clip) return;
      lastAppliedKey.current = "";
      void remove(ref(db, `rooms/${roomId}/telestrator/strokes`));
      const resetAngles =
        cur.angles.length > 1
          ? {
              angles: [
                {
                  id: "a0",
                  name: "Main",
                  videoId: clip.videoId,
                  offsetFromGameTime: 0,
                },
              ],
              currentAngleId: "a0",
            }
          : {};
      writeHostTransport(
        {
          videoId: clip.videoId,
          currentClipIndex: index,
          currentTime: 0,
          isPlaying: false,
          playbackRate: DEFAULT_PLAYBACK_RATE,
          ...resetAngles,
        },
        "clip",
        { clearPlaybackCommand: true },
      );
    },
    [isHost, roomId, clearFfIfActive, writeHostTransport],
  );

  const handleAddAngle = useCallback(() => {
    if (!isHost) return;
    const rr = roomRefForWrite.current;
    if (!rr) return;
    const cur = roomStateRef.current;
    if (!cur) return;
    if (cur.clips.length > 1) {
      window.alert(
        "Use a single clip in the queue before adding alternate camera angles.",
      );
      return;
    }
    const rawUrl = window.prompt("Paste YouTube URL for this angle");
    const id = extractYouTubeVideoId((rawUrl ?? "").trim());
    if (!id) {
      window.alert("Invalid YouTube link");
      return;
    }
    if (cur.angles.some((a) => a.videoId === id)) {
      window.alert("That video is already an angle.");
      return;
    }
    const rawName = window.prompt("Angle name (optional)");
    const name =
      typeof rawName === "string" && rawName.trim() !== ""
        ? rawName.trim()
        : `Angle ${cur.angles.length + 1}`;
    const rawOff = window.prompt(
      "Offset vs game clock in seconds (default 0)",
      "0",
    );
    const off = Number.parseFloat(typeof rawOff === "string" ? rawOff : "0");
    const offsetFromGameTime = Number.isFinite(off) ? off : 0;
    const newId = `a_${Date.now().toString(36)}`;
    const nextAngles: VideoAngle[] = [
      ...cur.angles.map((a) => ({ ...a })),
      {
        id: newId,
        name,
        videoId: id,
        ...(offsetFromGameTime !== 0 ? { offsetFromGameTime } : {}),
      },
    ];
    void update(rr, {
      angles: nextAngles,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      /* RTDB */
    });
  }, [isHost]);

  const handleSelectAngle = useCallback(
    (angleId: string) => {
      if (!isHost || !roomId) return;
      const cur = roomStateRef.current;
      if (!cur || angleId === cur.currentAngleId) return;
      const nextAngle = cur.angles.find((a) => a.id === angleId);
      if (!nextAngle) return;
      void (async () => {
        const player = getPlayer();
        const t = await readYoutubeCurrentTime(
          player,
          cur.currentTime ?? 0,
        );
        const curAngle = pickAngle(cur.angles, cur.currentAngleId);
        const gameT = gameTimeFromAngleTime(t, curAngle);
        const seekTime = angleTimeFromGameTime(gameT, nextAngle);
        const pr = clearFfIfActive();
        lastAppliedKey.current = "";
        writeImmediatePlaybackCommand("seek", {
          currentTime: seekTime,
          isPlaying: cur.isPlaying,
          playbackRate: pr,
          videoId: nextAngle.videoId,
          currentAngleId: nextAngle.id,
        });
      })();
    },
    [isHost, roomId, clearFfIfActive, writeImmediatePlaybackCommand],
  );

  /**
   * Host only: periodic lightweight time ping while playing (`action: sync`, not `playbackCommand`).
   */
  useEffect(() => {
    if (!isHost || !roomState?.isPlaying) {
      lastHostHeartbeatSentRef.current = null;
      return;
    }

    const tick = () => {
      if (!isHostRef.current) return;
      if (!roomStateRef.current?.isPlaying) return;
      if (
        Date.now() - hostLastPlayGestureAtRef.current <
        HOST_PLAY_HEARTBEAT_SUPPRESS_MS
      ) {
        return;
      }
      const player = playerRef.current?.getInternalPlayer() as
        | YouTubePlayer
        | null
        | undefined;
      const fb = roomStateRef.current?.currentTime ?? 0;
      const pr = roomStateRef.current?.playbackRate ?? DEFAULT_PLAYBACK_RATE;
      void readYoutubeCurrentTime(player, fb).then((t) => {
        if (!isHostRef.current || !roomStateRef.current?.isPlaying) return;
        if (
          Date.now() - hostLastPlayGestureAtRef.current <
          HOST_PLAY_HEARTBEAT_SUPPRESS_MS
        ) {
          return;
        }
        const last = lastHostHeartbeatSentRef.current;
        if (
          last !== null &&
          Math.abs(t - last) < 0.08 &&
          Math.abs(pr - (roomStateRef.current.playbackRate ?? DEFAULT_PLAYBACK_RATE)) <
            1e-6
        ) {
          return;
        }
        lastHostHeartbeatSentRef.current = t;
        syncLog("host heartbeat", { currentTime: t, playbackRate: pr });
        writeHostTransport(
          {
            isPlaying: true,
            currentTime: t,
            playbackRate: pr,
          },
          "sync",
        );
      });
    };

    const id = window.setInterval(tick, HOST_PLAYBACK_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [isHost, roomId, roomState?.isPlaying, writeHostTransport]);

  const handlePlay = () => {
    if (!isHost) return;
    hostLastPlayGestureAtRef.current = Date.now();
    syncLog("host pressed Play");
    const pr = clearFfIfActive();
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      syncLog("host Play transport", {
        anchorTime: t,
        playbackRate: pr,
      });
      writeImmediatePlaybackCommand("play", {
        isPlaying: true,
        currentTime: t,
        playbackRate: pr,
      });
    })();
  };

  const handlePause = () => {
    if (!isHost) return;
    const pr = clearFfIfActive();
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      writeImmediatePlaybackCommand("pause", {
        isPlaying: false,
        currentTime: t,
        playbackRate: pr,
      });
    })();
  };

  const handleSeekBack = () => {
    if (!isHost) return;
    const pr = clearFfIfActive();
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const ct = await readYoutubeCurrentTime(player, fb);
      const playing = roomStateRef.current?.isPlaying ?? false;
      const edge = await readLiveEdgeTime(player, fb);
      const target = isLiveStreamRef.current ? edge - 10 : ct - 10;
      const clamped = Math.max(
        0,
        Math.min(target, edge - LIVE_EDGE_CLAMP_PAD_S),
      );
      writeImmediatePlaybackCommand("seek", {
        isPlaying: playing,
        currentTime: clamped,
        playbackRate: pr,
      });
    })();
  };

  const handleSeekLiveBack30 = () => {
    if (!isHost) return;
    const pr = clearFfIfActive();
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const ct = await readYoutubeCurrentTime(player, fb);
      const playing = roomStateRef.current?.isPlaying ?? false;
      const edge = await readLiveEdgeTime(player, fb);
      const target = isLiveStreamRef.current ? edge - 30 : ct - 30;
      const clamped = Math.max(
        0,
        Math.min(target, edge - LIVE_EDGE_CLAMP_PAD_S),
      );
      writeImmediatePlaybackCommand("seek", {
        isPlaying: playing,
        currentTime: clamped,
        playbackRate: pr,
      });
    })();
  };

  const handleJumpLiveEdge = () => {
    if (!isHost || !isLiveStream) return;
    const pr = clearFfIfActive();
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const playing = roomStateRef.current?.isPlaying ?? false;
      const edge = await readLiveEdgeTime(player, fb);
      const clamped = Math.max(0, edge - LIVE_EDGE_CLAMP_PAD_S);
      writeImmediatePlaybackCommand("seek", {
        isPlaying: playing,
        currentTime: clamped,
        playbackRate: pr,
      });
    })();
  };

  /** Authoritative snap: live time, rate, play state — bypasses drift/nudge on viewers. */
  const handleHostResync = () => {
    if (!isHost) return;
    void (async () => {
      clearFfIfActive();
      const cur = roomStateRef.current;
      if (!cur) return;
      const player = getPlayer();
      const fb = cur.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      const pr = await readYoutubePlaybackRate(
        player,
        cur.playbackRate ?? DEFAULT_PLAYBACK_RATE,
      );
      const st = await readYoutubePlayerState(player);
      let isPlaying = cur.isPlaying;
      if (st !== undefined) {
        if (youtubeStateImpliesPlaying(st)) isPlaying = true;
        else if (st === YT_PAUSED) isPlaying = false;
      }
      writeImmediatePlaybackCommand("resync", {
        currentTime: t,
        isPlaying,
        playbackRate: pr,
      });
    })();
  };

  const handlePrevChapter = () => {
    if (!isHost) return;
    pulseChapterNav("prev");
    void (async () => {
      const cur = roomStateRef.current;
      if (!cur || !cur.chapters.length) return;
      const player = getPlayer();
      const t = await readYoutubeCurrentTime(player, cur.currentTime ?? 0);
      const angle = pickAngle(cur.angles, cur.currentAngleId);
      const cursorMoment = gameTimeFromAngleTime(t, angle);
      const target = findPrevChapterInSession(
        cur.clips,
        cur.chapters,
        cur.currentClipIndex,
        cursorMoment,
      );
      if (target) jumpToChapter(target);
    })();
  };

  const handleNextChapter = () => {
    if (!isHost) return;
    pulseChapterNav("next");
    void (async () => {
      const cur = roomStateRef.current;
      if (!cur || !cur.chapters.length) return;
      const player = getPlayer();
      const t = await readYoutubeCurrentTime(player, cur.currentTime ?? 0);
      const angle = pickAngle(cur.angles, cur.currentAngleId);
      const cursorMoment = gameTimeFromAngleTime(t, angle);
      const target = findNextChapterInSession(
        cur.clips,
        cur.chapters,
        cur.currentClipIndex,
        cursorMoment,
      );
      if (target) jumpToChapter(target);
    })();
  };

  const handleSpeed = (rate: (typeof HOST_SPEEDS)[number]) => {
    if (!isHost) return;
    if (ffModeRef.current !== 0) {
      setFfMode(0);
    }
    writeHostTransport({ playbackRate: rate }, "rate");
  };

  const handlePlayerReady = useCallback(() => {
    const s = roomStateRef.current;
    if (!s) return;
    const p = getPlayer();
    if (!isHostRef.current && p && pendingPlaybackCommandRef.current) {
      const cmd = pendingPlaybackCommandRef.current;
      if (
        cmd.activeVideoId === s.videoId &&
        cmd.commandId > lastAppliedCommandIdRef.current
      ) {
        pendingPlaybackCommandRef.current = null;
        syncLog("viewer apply pending on player ready", cmd);
        void (async () => {
          await applyViewerImmediatePlaybackCommand(
            cmd,
            s,
            p,
            lastViewerSyncRateRef,
            viewerPlaybackUnlockedRef,
            playRetryTimerRef,
            pauseRetryTimerRef,
            retryTargetCommandIdRef,
          );
          lastAppliedCommandIdRef.current = cmd.commandId;
          lastAppliedKey.current = "";
          const gen = ++applyRoomGenRef.current;
          void applyRoomStateToPlayerRef.current(
            s,
            applyPrevSnapshotRef.current,
            gen,
          );
        })();
        return;
      }
      pendingPlaybackCommandRef.current = null;
    }
    /* After iframe remount, re-sync. If we already applied this snapshot, skip (avoids seek/play churn). */
    const key = stableKey(s);
    if (key === lastAppliedKey.current) return;
    const gen = ++applyRoomGenRef.current;
    void applyRoomStateToPlayer(s, null, gen);
  }, [applyRoomStateToPlayer]);

  const handleClearDrawings = () => {
    if (!roomId || !isHost) return;
    void remove(ref(db, `rooms/${roomId}/telestrator/strokes`));
  };

  const handleCopyViewerLink = () => {
    const raw = roomState?.videoId ?? videoIdFromUrl;
    if (!roomId || !raw || typeof window === "undefined") return;
    const url = buildViewerRoomUrl(window.location.origin, roomId, raw);
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const saveSessionDefaultName = useCallback(
    () =>
      `Session ${new Date().toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })}`,
    [],
  );

  const openSaveSessionDialog = useCallback(async () => {
    if (!isHost || !roomState) return;
    let u = user;
    if (!u) {
      try {
        const cred = await signInWithGoogle();
        u = cred.user;
      } catch {
        return;
      }
    }
    setSaveSessionName(saveSessionDefaultName());
    setSaveSessionFolder("");
    setSaveSessionOwnerUid(u.uid);
    setSaveSessionOpen(true);
  }, [isHost, roomState, user, saveSessionDefaultName]);

  const closeSaveSessionDialog = useCallback(() => {
    setSaveSessionOpen(false);
    setSaveSessionOwnerUid(null);
    setSaveSessionSaving(false);
  }, []);

  const confirmSaveSession = useCallback(async () => {
    if (!isHost || !roomState) return;
    const uid = saveSessionOwnerUid ?? user?.uid;
    if (!uid) return;
    const fallback = saveSessionDefaultName();
    const name =
      saveSessionName.trim() !== "" ? saveSessionName.trim() : fallback;
    const folderTrim = saveSessionFolder.trim();
    setSaveSessionSaving(true);
    try {
      await saveSessionTemplate(uid, {
        name,
        clips: roomState.clips.map(clipToSavedClip),
        chapters: roomState.chapters.map((ch) => ({
          time: ch.time,
          label: ch.label,
          videoId: ch.videoId,
          ...(typeof ch.gameTime === "number" ? { gameTime: ch.gameTime } : {}),
        })),
        currentClipIndex: roomState.currentClipIndex,
        ...(folderTrim !== "" ? { folder: folderTrim } : {}),
        ...(roomState.angles.length > 1
          ? {
              angles: roomState.angles,
              currentAngleId: roomState.currentAngleId,
            }
          : {}),
      });
      closeSaveSessionDialog();
      alert("Session saved.");
    } catch {
      alert("Could not save session. Check Firestore rules and login.");
    } finally {
      setSaveSessionSaving(false);
    }
  }, [
    isHost,
    roomState,
    saveSessionOwnerUid,
    user?.uid,
    saveSessionName,
    saveSessionFolder,
    saveSessionDefaultName,
    closeSaveSessionDialog,
  ]);

  const chaptersDisplay = useMemo(
    () =>
      roomState?.chapters?.length
        ? buildChaptersDisplayList(roomState.clips, roomState.chapters)
        : [],
    [roomState],
  );

  const tForChapterHighlight = uiPlaybackTime ?? roomState?.currentTime ?? 0;
  const chapterNavMoment =
    roomState !== null
      ? gameTimeFromAngleTime(
          tForChapterHighlight,
          pickAngle(roomState.angles, roomState.currentAngleId),
        )
      : 0;
  const activeClipCanonicalId =
    roomState?.clips[roomState.currentClipIndex]?.videoId ?? "";
  const activeChapterIndex =
    roomState?.chapters?.length && activeClipCanonicalId
      ? findActiveChapterIndexForUi(
          roomState.chapters,
          activeClipCanonicalId,
          tForChapterHighlight,
          pickAngle(roomState.angles, roomState.currentAngleId),
        )
      : null;
  const sessionPrevChapter =
    roomState && roomState.chapters.length > 0
      ? findPrevChapterInSession(
          roomState.clips,
          roomState.chapters,
          roomState.currentClipIndex,
          chapterNavMoment,
        )
      : null;
  const sessionNextChapter =
    roomState && roomState.chapters.length > 0
      ? findNextChapterInSession(
          roomState.clips,
          roomState.chapters,
          roomState.currentClipIndex,
          chapterNavMoment,
        )
      : null;

  const effectiveVideoId = roomState?.videoId ?? videoIdFromUrl;
  const displayRate = roomState?.playbackRate ?? DEFAULT_PLAYBACK_RATE;

  const returnHomeBtnClass =
    "fixed left-4 top-4 z-50 rounded-lg border border-white/[0.08] bg-zinc-950/85 px-2.5 py-1.5 text-xs font-medium text-zinc-200 shadow-sm shadow-black/20 backdrop-blur-sm transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

  if (!videoFromUrl?.trim()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
        <button
          type="button"
          onClick={handleReturnHome}
          className={returnHomeBtnClass}
        >
          ← Home
        </button>
        <div className="max-w-md rounded-2xl border border-white/[0.07] bg-zinc-950/50 px-8 py-10 text-center shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm">
          <p className="mb-6 text-sm leading-relaxed text-zinc-300">
            No video selected. Add a{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-zinc-100">
              ?video=
            </code>{" "}
            query with a YouTube video ID.
          </p>
          <Link
            href="/"
            className="inline-flex rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!effectiveVideoId) {
    const invalidMsg =
      videoFromUrl?.trim() && !videoIdFromUrl
        ? "Invalid YouTube link."
        : "Missing video id.";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
        <button
          type="button"
          onClick={handleReturnHome}
          className={returnHomeBtnClass}
        >
          ← Home
        </button>
        <div className="max-w-md rounded-2xl border border-white/[0.07] bg-zinc-950/50 px-8 py-10 text-center shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm">
          <p className="mb-6 text-sm text-zinc-300">{invalidMsg}</p>
          <Link
            href="/"
            className="inline-flex rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const hostChip =
    "rounded-lg border border-white/[0.10] bg-zinc-950/90 px-3 py-2 text-xs font-medium text-zinc-50 shadow-md shadow-black/40 backdrop-blur-md transition duration-150 hover:border-white/18 hover:bg-zinc-900/95 active:scale-[0.97] active:brightness-90 active:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:text-sm";

  const hostChipSync =
    "rounded-lg border border-blue-500/45 bg-blue-950/60 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-blue-950/50 backdrop-blur-md transition duration-150 hover:border-blue-400/60 hover:bg-blue-900/55 active:scale-[0.97] active:brightness-95 active:border-blue-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:text-sm";

  const hostControlsBar =
    "pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-zinc-950/92 px-3 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-md ring-1 ring-white/[0.06] sm:gap-2.5 sm:px-4";

  const hostChipClean =
    "rounded-md border border-white/[0.10] bg-zinc-950/85 px-2 py-1 text-[10px] font-medium text-zinc-50 shadow-sm shadow-black/35 backdrop-blur-md transition duration-150 hover:border-white/18 hover:bg-zinc-900/90 active:scale-[0.97] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";

  const hostChipSyncClean =
    "rounded-md border border-blue-500/45 bg-blue-950/55 px-2 py-1 text-[10px] font-semibold text-white shadow-sm shadow-blue-950/40 backdrop-blur-md transition duration-150 hover:border-blue-400/60 hover:bg-blue-900/50 active:scale-[0.97] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";

  const hostControlsBarClean =
    "pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-zinc-950/90 px-2 py-1.5 shadow-xl shadow-black/55 backdrop-blur-md ring-1 ring-white/[0.06]";

  const frPanel =
    "mb-3 w-full rounded-xl border border-white/[0.07] bg-zinc-950/40 px-4 py-3 text-sm shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm";

  const frPanelTitle =
    "mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400";

  const secondaryHostBtn =
    "rounded-lg border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-50 transition duration-150 hover:border-white/20 hover:bg-white/[0.10] active:scale-[0.98] active:bg-white/[0.14] active:border-white/28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";

  const saveSessionFieldClass =
    "mt-1 w-full rounded-lg border border-white/12 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

  return (
    <>
    <div
      className={`flex min-h-screen flex-col text-zinc-50 ${
        cleanMode
          ? "fixed inset-0 z-40 h-[100dvh] w-[100dvw] overflow-hidden bg-[#030306] p-0"
          : "px-4 py-6"
      }`}
    >
      {!cleanMode ? (
        <button
          type="button"
          onClick={handleReturnHome}
          className={returnHomeBtnClass}
        >
          ← Home
        </button>
      ) : null}
      <div
        className={`mx-auto flex w-full flex-1 flex-col ${
          cleanMode ? "max-w-none justify-center" : "max-w-3xl"
        }`}
      >
        {!cleanMode ? (
          <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4 text-sm text-zinc-400">
            <p className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Room
              </span>{" "}
              <span className="font-mono text-sm text-zinc-200">{roomId}</span>
              <span className="text-zinc-500"> · </span>
              <span className="text-zinc-200">{isHost ? "Host" : "Viewer"}</span>
              <span className="text-zinc-500"> · </span>
              <span className="text-zinc-500">Speed </span>
              <span className="font-medium text-zinc-100">
                {displayRate === 1 ? "1×" : `${displayRate}×`}
              </span>
            </p>
            {isHost ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openSaveSessionDialog()}
                  className={secondaryHostBtn}
                >
                  Save Session
                </button>
                <button
                  type="button"
                  onClick={handleCopyViewerLink}
                  className={secondaryHostBtn}
                >
                  {copied ? "Copied" : "Copy Viewer Link"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {isHost && roomState && !cleanMode ? (
          <div className={frPanel}>
            <p className={frPanelTitle}>Clip queue</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {roomState.clips.map((c, i) => {
                const active = i === roomState.currentClipIndex;
                const clipTitle = formatClipLabel(c, i);
                return (
                  <div
                    key={`${c.videoId}-${i}`}
                    className="flex flex-wrap items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => void handleSelectClip(i)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 active:scale-[0.98] active:brightness-95 ${
                        active
                          ? "border-blue-500/55 bg-blue-600/25 text-white shadow-md shadow-blue-950/25 ring-1 ring-blue-400/35"
                          : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/18 hover:bg-white/[0.07]"
                      }`}
                    >
                      {active ? "▶ " : ""}
                      {clipTitle}{" "}
                      <span className="font-mono text-[10px] text-zinc-400">
                        {c.videoId.slice(0, 6)}…
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRenameClip(i)}
                      className={miniHostBtn}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveClip(i);
                      }}
                      className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-xs font-medium text-zinc-400 transition duration-150 hover:border-red-500/35 hover:bg-red-950/25 hover:text-zinc-200 active:scale-[0.94] active:bg-red-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                      aria-label={`Remove clip ${clipTitle}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Paste YouTube link"
                value={clipUrlDraft}
                onChange={(e) => setClipUrlDraft(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-zinc-400 focus:border-blue-500/35 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              />
              <button
                type="button"
                onClick={() => void handleAddClip()}
                className={secondaryHostBtn}
              >
                Add clip
              </button>
              <button
                type="button"
                disabled={roomState.clips.length <= 1}
                onClick={() => handleClearClips()}
                className={secondaryHostBtn}
              >
                Clear clips
              </button>
            </div>
          </div>
        ) : null}

        {roomState && roomState.angles.length > 1 && !cleanMode ? (
          <div className={frPanel}>
            <p className={frPanelTitle}>Camera angle</p>
            <div className="flex flex-wrap items-center gap-2">
              {roomState.angles.map((a) => {
                const active = a.id === roomState.currentAngleId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={!isHost}
                    onClick={() => {
                      if (isHost) void handleSelectAngle(a.id);
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 active:scale-[0.98] ${
                      active
                        ? "border-blue-500/55 bg-blue-600/25 text-white ring-1 ring-blue-400/35"
                        : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/18 hover:bg-white/[0.07]"
                    } ${!isHost ? "cursor-default opacity-90" : ""}`}
                  >
                    {a.name}
                  </button>
                );
              })}
              {isHost && roomState.clips.length === 1 ? (
                <button
                  type="button"
                  onClick={() => void handleAddAngle()}
                  className={secondaryHostBtn}
                >
                  Add angle
                </button>
              ) : null}
            </div>
          </div>
        ) : isHost && roomState && roomState.clips.length === 1 && !cleanMode ? (
          <div className={frPanel}>
            <p className={frPanelTitle}>Camera angle</p>
            <p className="mb-2 text-xs text-zinc-500">
              Add alternate YouTube feeds for the same game clock (single clip
              only).
            </p>
            <button
              type="button"
              onClick={() => void handleAddAngle()}
              className={secondaryHostBtn}
            >
              Add angle
            </button>
          </div>
        ) : null}

        {roomState && isHost && !cleanMode ? (
          <div className={frPanel}>
            <p className={frPanelTitle}>Chapters</p>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleAddChapter()}
                className={secondaryHostBtn}
              >
                Add Chapter
              </button>
              <button
                type="button"
                disabled={!sessionPrevChapter}
                onClick={() => void handlePrevChapter()}
                className={`${secondaryHostBtn} ${
                  chapterNavFlash === "prev"
                    ? "ring-2 ring-blue-400/60 border-blue-500/50 bg-blue-600/30 shadow-md shadow-blue-950/25"
                    : ""
                }`}
              >
                Prev
              </button>
              <button
                type="button"
                disabled={!sessionNextChapter}
                onClick={() => void handleNextChapter()}
                className={`${secondaryHostBtn} ${
                  chapterNavFlash === "next"
                    ? "ring-2 ring-blue-400/60 border-blue-500/50 bg-blue-600/30 shadow-md shadow-blue-950/25"
                    : ""
                }`}
              >
                Next
              </button>
            </div>
            {roomState.chapters.length === 0 ? (
              <p className="text-xs text-zinc-400">No chapters yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {chaptersDisplay.map(({ chapter: ch, sourceIndex: i }) => {
                  const onActiveClip =
                    ch.videoId ===
                    roomState.clips[roomState.currentClipIndex]?.videoId;
                  const isCurrentChapter =
                    activeChapterIndex !== null && activeChapterIndex === i;
                  return (
                    <li key={`${ch.videoId}-${ch.time}-${ch.label}-${i}`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void jumpToChapter(ch)}
                          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left text-xs transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-[0.99] active:brightness-95 ${
                            isCurrentChapter && onActiveClip
                              ? "border-blue-500/80 bg-blue-600/40 text-white ring-2 ring-blue-400/45 shadow-lg shadow-blue-950/30"
                              : onActiveClip
                                ? "border-blue-500/25 bg-blue-950/30 text-zinc-100 ring-1 ring-blue-500/15 hover:border-blue-400/35 hover:bg-blue-950/45"
                                : "border-white/8 bg-black/35 text-zinc-200 hover:border-white/15 hover:bg-black/55"
                          }`}
                        >
                          <span className="font-medium text-white">
                            {ch.label}
                          </span>
                          <span
                            className={`ml-2 font-mono ${
                              isCurrentChapter && onActiveClip
                                ? "text-blue-100/90"
                                : "text-zinc-400"
                            }`}
                          >
                            {formatChapterTime(chapterGameMoment(ch))}
                          </span>
                          {!onActiveClip ? (
                            <span className="ml-2 text-[10px] text-amber-400/85">
                              (other clip)
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRenameChapter(i)}
                          className={miniHostBtn}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteChapter(i)}
                          className="shrink-0 rounded-lg border border-white/10 px-2 py-2 text-xs font-medium text-zinc-400 transition duration-150 hover:border-red-500/35 hover:bg-red-950/25 hover:text-zinc-200 active:scale-[0.94] active:bg-red-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                          aria-label={`Delete chapter ${ch.label}`}
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : roomState && !isHost ? (
          <div className="mb-3 flex items-center justify-center rounded-lg border border-white/[0.06] bg-zinc-950/35 px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Watching live
          </div>
        ) : null}

        <div
          className={`relative w-full overflow-hidden bg-black ${
            cleanMode
              ? "h-[100dvh] w-[100dvw] rounded-none ring-0 shadow-none"
              : "rounded-xl ring-1 ring-white/10 shadow-2xl shadow-black/50"
          }`}
        >
          {/*
            Always keep aspect-video: absolutely positioned YouTube/iframe does not
            contribute height — flex-1/min-h-0 without aspect ratio collapsed the
            player (black screen) after unlock on some mobile watch layouts.
          */}
          <div
            className={`relative w-full overflow-hidden ${
              cleanMode ? "h-[100dvh] w-[100dvw]" : "aspect-video min-h-[12rem]"
            }`}
            onClick={handleToggleCleanMode}
          >
            <div className="absolute inset-0 overflow-hidden">
              <YouTube
                key={`${safeDecodeVideoId(effectiveVideoId)}-${isHost ? "host" : "viewer"}`}
                ref={playerRef}
                videoId={safeDecodeVideoId(effectiveVideoId)}
                onReady={handlePlayerReady}
                onStateChange={handleYoutubeStateChange}
                className="absolute left-0 top-0 h-full w-full"
                iframeClassName="absolute left-0 top-0 h-full w-full"
                opts={youtubePlayerOpts}
              />
            </div>
            <TelestratorOverlay
              roomId={roomId}
              isHost={isHost}
              drawEnabled={telDrawOn}
            />
            {!isHost && !viewerPlaybackUnlocked ? (
              <div className="pointer-events-auto absolute inset-0 z-[35] flex items-center justify-center bg-black/65 px-4 backdrop-blur-md">
                <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-zinc-950/90 p-8 text-center shadow-2xl shadow-black/60 ring-1 ring-white/[0.05]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Viewer
                  </p>
                  <p className="mb-6 text-sm leading-relaxed text-zinc-300">
                    Enable playback to follow the host. Audio and video stay in
                    sync after you continue.
                  </p>
                  <button
                    type="button"
                    onClick={handleViewerPlaybackUnlock}
                    className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                  >
                    Tap to enable playback
                  </button>
                </div>
              </div>
            ) : null}
            {isHost ? (
              <div
                className={`pointer-events-none absolute left-1/2 z-30 flex w-[calc(100%-1rem)] -translate-x-1/2 justify-center px-1 ${
                  cleanMode
                    ? "bottom-3 top-auto max-w-none"
                    : "top-2 max-w-2xl sm:top-3"
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  {isLiveStream && liveBehindSec !== null ? (
                    <span className="pointer-events-none rounded-full border border-red-500/40 bg-red-950/55 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-100 shadow-sm shadow-red-950/40">
                      {liveBehindSec < 2.5
                        ? "LIVE"
                        : `-${Math.round(liveBehindSec)}s`}
                    </span>
                  ) : null}
                  <div
                    ref={hostControlsRef}
                    className={cleanMode ? hostControlsBarClean : hostControlsBar}
                  >
                  <button
                    type="button"
                    onClick={() =>
                      roomState?.isPlaying ? handlePause() : handlePlay()
                    }
                    className={cleanMode ? hostChipClean : hostChip}
                  >
                    {roomState?.isPlaying ? "Pause" : "Play"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSeekLiveBack30}
                    className={cleanMode ? hostChipClean : hostChip}
                  >
                    -30s
                  </button>
                  <button
                    type="button"
                    onClick={handleSeekBack}
                    className={cleanMode ? hostChipClean : hostChip}
                  >
                    -10s
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMarkPlay()}
                    className={`${cleanMode ? hostChipClean : hostChip} ${
                      markPlayState === "marked"
                        ? "border-emerald-500/55 bg-emerald-950/50 font-semibold text-emerald-100 ring-2 ring-emerald-400/40 shadow-[0_0_12px_-4px_rgba(16,185,129,0.45)]"
                        : ""
                    }`}
                  >
                    {markPlayState === "marked" ? "Marked" : "Mark Play"}
                  </button>
                  {isLiveStream ? (
                    <button
                      type="button"
                      onClick={handleJumpLiveEdge}
                      className={`${cleanMode ? hostChipClean : hostChip} border-red-500/35 font-semibold text-red-100`}
                    >
                      LIVE
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleHostResync}
                    className={cleanMode ? hostChipSyncClean : hostChipSync}
                  >
                    Sync
                  </button>
                  {!cleanMode ? (
                    <>
                      <button
                        type="button"
                        onClick={cycleFf}
                        className={`${hostChip} ${
                          ffMode !== 0
                            ? "border-blue-500/70 !bg-blue-600 !font-semibold !text-white shadow-[0_0_14px_-3px_rgba(59,130,246,0.55)] ring-2 ring-blue-400/45"
                            : ""
                        }`}
                      >
                        {ffMode === 0
                          ? "FF"
                          : ffMode === 2
                            ? "FF 2×"
                            : ffMode === 4
                              ? "FF 4×"
                              : "FF 8×"}
                      </button>
                      {HOST_SPEEDS.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => handleSpeed(rate)}
                          className={`${hostChip} ${
                            Math.abs(
                              (roomState?.playbackRate ??
                                DEFAULT_PLAYBACK_RATE) -
                                rate,
                            ) < 1e-6
                              ? "border-blue-500/70 !bg-blue-600 !font-semibold !text-white shadow-[0_0_14px_-3px_rgba(59,130,246,0.55)] ring-2 ring-blue-400/45"
                              : ""
                          }`}
                        >
                          {rate === 1 ? "1×" : `${rate}×`}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTelDrawOn((v) => !v)}
                        className={
                          telDrawOn
                            ? `${hostChip} border-blue-400/45 bg-blue-950/50 font-semibold text-white ring-1 ring-blue-500/30`
                            : hostChip
                        }
                      >
                        {telDrawOn ? "Draw Off" : "Draw On"}
                      </button>
                      <button
                        type="button"
                        onClick={handleClearDrawings}
                        className={hostChip}
                      >
                        Clear
                      </button>
                    </>
                  ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
    {saveSessionOpen ? (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeSaveSessionDialog();
        }}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950/95 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/[0.05]"
          role="dialog"
          aria-labelledby="save-session-title"
        >
          <h2
            id="save-session-title"
            className="mb-4 text-sm font-semibold text-white"
          >
            Save session
          </h2>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Name
            <input
              type="text"
              value={saveSessionName}
              onChange={(e) => setSaveSessionName(e.target.value)}
              className={saveSessionFieldClass}
              autoComplete="off"
            />
          </label>
          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Program / folder{" "}
            <span className="font-normal normal-case text-zinc-500">
              (optional)
            </span>
            <input
              type="text"
              value={saveSessionFolder}
              onChange={(e) => setSaveSessionFolder(e.target.value)}
              placeholder="e.g. U12 / Passing"
              className={saveSessionFieldClass}
              autoComplete="off"
            />
          </label>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={closeSaveSessionDialog}
              className={secondaryHostBtn}
              disabled={saveSessionSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmSaveSession()}
              disabled={saveSessionSaving}
              className="rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveSessionSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-zinc-400">
          <p className="text-sm">Loading…</p>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
