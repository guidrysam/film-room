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
import { extractYouTubeVideoId } from "@/lib/youtube-id";

const HOST_SPEEDS = [0.25, 0.5, 1] as const;
const DEFAULT_PLAYBACK_RATE = 1;

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

/** Stable reference — new object each render breaks react-youtube `shouldResetPlayer` / remounts the iframe. */
const YOUTUBE_PLAYER_OPTS = {
  width: "100%",
  height: "100%",
  /**
   * fs: 0 — hide YT iframe fullscreen; fullscreen must use the stage (video + telestrator).
   * rel: 0 — limit related video surface at end (embed policy).
   * modestbranding / playsinline — calmer chrome, mobile-friendly inline playback.
   */
  playerVars: {
    rel: 0,
    fs: 0,
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

type ClipEntry = { videoId: string };

/** Saved jump points; `videoId` ties each marker to a clip in the queue. */
type ChapterEntry = {
  time: number;
  label: string;
  videoId: string;
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
};

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
    out.push({ time: o.time, label, videoId: o.videoId });
    i += 1;
  }
  return out;
}

/** Session chapter order: clip index in queue, then time (supports multi-clip lists). */
const CHAPTER_NAV_EPS = 0.05;

function clipIndexForVideo(clips: ClipEntry[], videoId: string): number {
  const i = clips.findIndex((c) => c.videoId === videoId);
  return i >= 0 ? i : 0;
}

function compareChapterOrder(
  clips: ClipEntry[],
  a: ChapterEntry,
  b: ChapterEntry,
): number {
  const ia = clipIndexForVideo(clips, a.videoId);
  const ib = clipIndexForVideo(clips, b.videoId);
  if (ia !== ib) return ia - ib;
  return a.time - b.time;
}

function sortChaptersForNavigation(
  clips: ClipEntry[],
  chapters: ChapterEntry[],
): ChapterEntry[] {
  return [...chapters].sort((a, b) => compareChapterOrder(clips, a, b));
}

function chapterStrictlyBeforeCursor(
  clips: ClipEntry[],
  ch: ChapterEntry,
  cursorClipIdx: number,
  cursorTime: number,
): boolean {
  const ci = clipIndexForVideo(clips, ch.videoId);
  return (
    ci < cursorClipIdx ||
    (ci === cursorClipIdx && ch.time < cursorTime - CHAPTER_NAV_EPS)
  );
}

function chapterStrictlyAfterCursor(
  clips: ClipEntry[],
  ch: ChapterEntry,
  cursorClipIdx: number,
  cursorTime: number,
): boolean {
  const ci = clipIndexForVideo(clips, ch.videoId);
  return (
    ci > cursorClipIdx ||
    (ci === cursorClipIdx && ch.time > cursorTime + CHAPTER_NAV_EPS)
  );
}

function findPrevChapterInSession(
  clips: ClipEntry[],
  chapters: ChapterEntry[],
  cursorClipIdx: number,
  cursorTime: number,
): ChapterEntry | null {
  if (!chapters.length) return null;
  const sorted = sortChaptersForNavigation(clips, chapters);
  let best: ChapterEntry | null = null;
  for (const ch of sorted) {
    if (chapterStrictlyBeforeCursor(clips, ch, cursorClipIdx, cursorTime)) {
      best = ch;
    }
  }
  return best;
}

function findNextChapterInSession(
  clips: ClipEntry[],
  chapters: ChapterEntry[],
  cursorClipIdx: number,
  cursorTime: number,
): ChapterEntry | null {
  if (!chapters.length) return null;
  const sorted = sortChaptersForNavigation(clips, chapters);
  for (const ch of sorted) {
    if (chapterStrictlyAfterCursor(clips, ch, cursorClipIdx, cursorTime)) {
      return ch;
    }
  }
  return null;
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
      out.push({ videoId: (row as ClipEntry).videoId });
    }
  }
  return out;
}

/** Normalize clip list + index; `videoId` from RTDB is authoritative for the active clip. */
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
  const matchIdx = clips.findIndex((c) => c.videoId === videoIdRaw);
  if (matchIdx >= 0) {
    idx = matchIdx;
  } else if (idx < 0 || idx >= clips.length) {
    idx = 0;
  }

  const activeVideoId = clips[idx]?.videoId ?? videoIdRaw;

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
  };
}

function stableKey(s: RoomState): string {
  const pc = s.playbackCommand?.commandId ?? 0;
  return `${s.videoId}|${s.isPlaying}|${s.currentTime}|${s.playbackRate}|${s.updatedAt}|${s.action}|${s.actionId}|pc:${pc}`;
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
const SEEK_WHILE_PLAYING_LARGE_S = 2.5;
/** Within this drift (seconds), viewer uses exact host playbackRate. */
const RATE_SYNC_DEADBAND_S = 0.5;
/** Nudge magnitude relative to host rate when moderately ahead/behind (applied to host rate). */
const RATE_NUDGE_DELTA = 0.25;
/** First apply / explicit host playhead move: small deadband. */
const SEEK_AFTER_TRANSPORT_JUMP_S = 0.2;
const SEEK_INITIAL_SYNC_S = 0.3;

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

function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.msFullscreenElement ??
    null
  );
}

async function exitFullscreenSafe(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
  };
  if (document.exitFullscreen) await document.exitFullscreen();
  else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
  else if (doc.msExitFullscreen) await doc.msExitFullscreen();
}

async function requestElFullscreen(el: HTMLElement): Promise<void> {
  const e = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };
  if (e.requestFullscreen) await e.requestFullscreen();
  else if (e.webkitRequestFullscreen) await e.webkitRequestFullscreen();
  else if (e.msRequestFullscreen) await e.msRequestFullscreen();
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

/** Occasional host time ping (~12s): large drift + light rate nudge only — no command transport. */
async function viewerApplySyncSnapshot(
  player: YouTubePlayer,
  state: RoomState,
  lastViewerSyncRateRef: { current: number },
  viewerPlaybackUnlockedRef: { current: boolean },
): Promise<void> {
  const localT = await player.getCurrentTime();
  const drift = localT - state.currentTime;
  const hostRate = state.playbackRate;

  if (state.isPlaying) {
    if (drift < -SEEK_WHILE_PLAYING_LARGE_S) {
      await player.seekTo(state.currentTime, true);
    }
    const t2 = await player.getCurrentTime();
    const d = t2 - state.currentTime;
    const target = computeViewerPlaybackRate(hostRate, d);
    if (
      !Number.isFinite(lastViewerSyncRateRef.current) ||
      Math.abs(lastViewerSyncRateRef.current - target) > 1e-4
    ) {
      await safeSetPlaybackRate(player, target);
      lastViewerSyncRateRef.current = target;
    }
    await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef);
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
    await player.seekTo(state.currentTime, true);
    didSeek = true;
    tForDrift = await player.getCurrentTime();
  }
  if (stale()) return;

  const drift = tForDrift - state.currentTime;
  const hostRate = state.playbackRate;
  const targetPlaybackRate = state.isPlaying
    ? computeViewerPlaybackRate(hostRate, drift)
    : hostRate;

  const needRate =
    !prev ||
    Math.abs(prev.playbackRate - hostRate) > 1e-6 ||
    !Number.isFinite(lastViewerSyncRateRef.current) ||
    Math.abs(lastViewerSyncRateRef.current - targetPlaybackRate) > 1e-4;
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
  const loadSavedId = searchParams.get("loadSaved");
  const { user, loading: authLoading } = useAuth();
  const [copied, setCopied] = useState(false);
  const [clipUrlDraft, setClipUrlDraft] = useState("");
  const [telDrawOn, setTelDrawOn] = useState(false);
  const [stageFullscreen, setStageFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const urlHostLegacy = searchParams.get("host") === "true";
  const sessionHost = useRoomHostFromSession(roomId);
  const isHost = urlHostLegacy || sessionHost;

  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const playerRef = useRef<InstanceType<typeof YouTube>>(null);
  const lastAppliedKey = useRef<string>("");
  /** Monotonic generation for viewer/host apply — newer room snapshots invalidate in-flight async work. */
  const applyRoomGenRef = useRef(0);
  /** Last playback rate applied on the viewer (incl. nudge) — avoids spamming setPlaybackRate. */
  const lastViewerSyncRateRef = useRef(Number.NaN);
  /** Viewer-only: set true after explicit tap so autopolicy allows playVideo (see overlay). */
  const viewerPlaybackUnlockedRef = useRef(false);
  const [viewerPlaybackUnlocked, setViewerPlaybackUnlocked] = useState(false);
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
  const applyRoomStateToPlayerRef = useRef<
    (state: RoomState, prev: RoomState | null, gen: number) => Promise<void>
  >(async () => {});
  const prevRoomRef = useRef<RoomState | null>(null);
  /** Last `prev` passed into `applyRoomStateToPlayer` (for unlock resync pair with `roomStateRef`). */
  const applyPrevSnapshotRef = useRef<RoomState | null>(null);
  const roomStateRef = useRef<RoomState | null>(null);

  const isHostRef = useRef(isHost);

  useLayoutEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useLayoutEffect(() => {
    isHostRef.current = isHost;
  });

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
  }, [roomState?.videoId]);

  useEffect(() => {
    viewerPlaybackUnlockedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset draft when room changes
    setClipUrlDraft("");
    setViewerPlaybackUnlocked(false);
  }, [roomId]);

  useEffect(() => {
    const syncStageFs = () => {
      const s = stageRef.current;
      setStageFullscreen(!!s && getFullscreenElement() === s);
    };
    syncStageFs();
    document.addEventListener("fullscreenchange", syncStageFs);
    document.addEventListener("webkitfullscreenchange", syncStageFs);
    return () => {
      document.removeEventListener("fullscreenchange", syncStageFs);
      document.removeEventListener("webkitfullscreenchange", syncStageFs);
    };
  }, []);

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

  const toggleStageFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (getFullscreenElement() === el) {
        await exitFullscreenSafe();
      } else {
        await requestElFullscreen(el);
      }
    } catch {
      /* unsupported or denied */
    }
  }, []);

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
    if (!roomRef || !isHost || !videoFromUrl) return;
    if (loadSavedId && authLoading) return;

    const vid = decodeURIComponent(videoFromUrl);

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
            void set(roomRef, {
              videoId: activeId,
              clips: template.clips.map((c) => ({ videoId: c.videoId })),
              currentClipIndex: idx,
              chapters: template.chapters ?? [],
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
    videoFromUrl,
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
        if (
          shouldSeekToRemoteTime({
            localT,
            remoteT: state.currentTime,
            isPlaying: state.isPlaying,
            prev,
            state,
          })
        ) {
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

  const writeImmediatePlaybackCommand = useCallback(
    (
      transportAction: "play" | "pause" | "seek" | "resync",
      fields: {
        currentTime: number;
        isPlaying: boolean;
        playbackRate: number;
      },
    ) => {
      const rr = roomRefForWrite.current;
      if (!rr || !isHostRef.current || !roomId) return;
      hostActionSeqRef.current += 1;
      const commandId = hostActionSeqRef.current;
      const activeVideoId = roomStateRef.current?.videoId ?? "";
      const playbackCommand: PlaybackCommand = {
        type: transportAction,
        roomId,
        activeVideoId,
        issuedAt: Date.now(),
        anchorVideoTime: fields.currentTime,
        playbackRate: fields.playbackRate,
        commandId,
      };
      syncLog("host immediate command", playbackCommand);
      void update(rr, {
        isPlaying: fields.isPlaying,
        currentTime: fields.currentTime,
        playbackRate: fields.playbackRate,
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
      if (event.data !== YT_ENDED) return;

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
      const cur = roomStateRef.current;
      if (!cur) return;
      const clipIdx = cur.clips.findIndex((c) => c.videoId === chapter.videoId);
      if (clipIdx < 0) return;

      if (chapter.videoId === cur.videoId) {
        writeImmediatePlaybackCommand("seek", {
          currentTime: chapter.time,
          isPlaying: cur.isPlaying,
          playbackRate: cur.playbackRate,
        });
        return;
      }

      lastAppliedKey.current = "";
      hostActionSeqRef.current += 1;
      const commandId = hostActionSeqRef.current;
      const playbackCommand: PlaybackCommand = {
        type: "seek",
        roomId,
        activeVideoId: chapter.videoId,
        issuedAt: Date.now(),
        anchorVideoTime: chapter.time,
        playbackRate: cur.playbackRate,
        commandId,
      };
      syncLog("host chapter jump (cross-clip)", playbackCommand);
      void update(rr, {
        videoId: chapter.videoId,
        currentClipIndex: clipIdx,
        currentTime: chapter.time,
        isPlaying: cur.isPlaying,
        playbackRate: cur.playbackRate,
        playbackCommand,
        action: "seek",
        actionId: commandId,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* RTDB */
      });
    },
    [isHost, roomId, writeImmediatePlaybackCommand],
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
      const next: ChapterEntry[] = [
        ...cur.chapters,
        {
          time: t,
          label,
          videoId: cur.videoId,
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

  const handleAddClip = useCallback(() => {
    if (!isHost) return;
    const rr = roomRefForWrite.current;
    if (!rr) return;
    const id = extractYouTubeVideoId(clipUrlDraft);
    if (!id) return;
    const cur = roomStateRef.current;
    if (!cur) return;
    const next = [...cur.clips, { videoId: id }];
    void update(rr, {
      clips: next,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      /* RTDB */
    });
    setClipUrlDraft("");
  }, [isHost, clipUrlDraft]);

  const handleSelectClip = useCallback(
    (index: number) => {
      if (!isHost || !roomId) return;
      const cur = roomStateRef.current;
      if (!cur || index < 0 || index >= cur.clips.length) return;
      if (index === cur.currentClipIndex) return;
      const clip = cur.clips[index];
      if (!clip) return;
      lastAppliedKey.current = "";
      void remove(ref(db, `rooms/${roomId}/telestrator/strokes`));
      writeHostTransport(
        {
          videoId: clip.videoId,
          currentClipIndex: index,
          currentTime: 0,
          isPlaying: false,
          playbackRate: DEFAULT_PLAYBACK_RATE,
        },
        "clip",
        { clearPlaybackCommand: true },
      );
    },
    [isHost, roomId, writeHostTransport],
  );

  /**
   * Host only: infrequent time ping while playing for late join / drift recovery — not command transport.
   */
  useEffect(() => {
    if (!isHost || !roomState?.isPlaying) return;

    const tick = () => {
      if (!isHostRef.current) return;
      if (!roomStateRef.current?.isPlaying) return;
      const player = playerRef.current?.getInternalPlayer() as
        | YouTubePlayer
        | null
        | undefined;
      const fb = roomStateRef.current?.currentTime ?? 0;
      const pr = roomStateRef.current?.playbackRate ?? DEFAULT_PLAYBACK_RATE;
      void readYoutubeCurrentTime(player, fb).then((t) => {
        if (!isHostRef.current || !roomStateRef.current?.isPlaying) return;
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

    const id = window.setInterval(tick, 12_000);
    return () => window.clearInterval(id);
  }, [isHost, roomId, roomState?.isPlaying, writeHostTransport]);

  const handlePlay = () => {
    if (!isHost) return;
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      const pr =
        roomStateRef.current?.playbackRate ?? DEFAULT_PLAYBACK_RATE;
      writeImmediatePlaybackCommand("play", {
        isPlaying: true,
        currentTime: t,
        playbackRate: pr,
      });
    })();
  };

  const handlePause = () => {
    if (!isHost) return;
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      const pr =
        roomStateRef.current?.playbackRate ?? DEFAULT_PLAYBACK_RATE;
      writeImmediatePlaybackCommand("pause", {
        isPlaying: false,
        currentTime: t,
        playbackRate: pr,
      });
    })();
  };

  const handleSeekBack = () => {
    if (!isHost) return;
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      const pr =
        roomStateRef.current?.playbackRate ?? DEFAULT_PLAYBACK_RATE;
      const playing = roomStateRef.current?.isPlaying ?? false;
      writeImmediatePlaybackCommand("seek", {
        isPlaying: playing,
        currentTime: Math.max(0, t - 10),
        playbackRate: pr,
      });
    })();
  };

  /** Authoritative snap: live time, rate, play state — bypasses drift/nudge on viewers. */
  const handleHostResync = () => {
    if (!isHost) return;
    void (async () => {
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
    void (async () => {
      const cur = roomStateRef.current;
      if (!cur || !cur.chapters.length) return;
      const player = getPlayer();
      const t = await readYoutubeCurrentTime(player, cur.currentTime ?? 0);
      const target = findPrevChapterInSession(
        cur.clips,
        cur.chapters,
        cur.currentClipIndex,
        t,
      );
      if (target) jumpToChapter(target);
    })();
  };

  const handleNextChapter = () => {
    if (!isHost) return;
    void (async () => {
      const cur = roomStateRef.current;
      if (!cur || !cur.chapters.length) return;
      const player = getPlayer();
      const t = await readYoutubeCurrentTime(player, cur.currentTime ?? 0);
      const target = findNextChapterInSession(
        cur.clips,
        cur.chapters,
        cur.currentClipIndex,
        t,
      );
      if (target) jumpToChapter(target);
    })();
  };

  const handleSpeed = (rate: (typeof HOST_SPEEDS)[number]) => {
    if (!isHost) return;
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
    const raw =
      roomState?.videoId ??
      (videoFromUrl ? safeDecodeVideoId(videoFromUrl) : null);
    if (!roomId || !raw || typeof window === "undefined") return;
    const url = buildViewerRoomUrl(window.location.origin, roomId, raw);
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveSession = useCallback(async () => {
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
    const fallback = `Session ${new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
    const raw = window.prompt("Session name", fallback);
    if (raw === null) return;
    const name =
      typeof raw === "string" && raw.trim() !== "" ? raw.trim() : fallback;
    try {
      await saveSessionTemplate(u.uid, {
        name,
        clips: roomState.clips.map((c) => ({ videoId: c.videoId })),
        chapters: roomState.chapters.map((ch) => ({
          time: ch.time,
          label: ch.label,
          videoId: ch.videoId,
        })),
        currentClipIndex: roomState.currentClipIndex,
      });
      alert("Session saved.");
    } catch {
      alert("Could not save session. Check Firestore rules and login.");
    }
  }, [isHost, roomState, user]);

  const effectiveVideoId = roomState?.videoId ?? videoFromUrl;
  const displayRate = roomState?.playbackRate ?? DEFAULT_PLAYBACK_RATE;

  if (!videoFromUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-100">
        <div className="max-w-md rounded-2xl border border-white/[0.07] bg-zinc-950/50 px-8 py-10 text-center shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm">
          <p className="mb-6 text-sm leading-relaxed text-zinc-400">
            No video selected. Add a{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-zinc-200">
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
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-100">
        <div className="max-w-md rounded-2xl border border-white/[0.07] bg-zinc-950/50 px-8 py-10 text-center shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm">
          <p className="mb-6 text-sm text-zinc-400">Missing video id.</p>
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
    "rounded-lg border border-white/[0.10] bg-zinc-950/90 px-3 py-2 text-xs font-medium text-zinc-100 shadow-md shadow-black/40 backdrop-blur-md transition hover:border-white/18 hover:bg-zinc-900/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:text-sm";

  const hostChipSync =
    "rounded-lg border border-blue-500/45 bg-blue-950/60 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-blue-950/50 backdrop-blur-md transition hover:border-blue-400/60 hover:bg-blue-900/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:text-sm";

  const hostControlsBar =
    "pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-zinc-950/92 px-3 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-md ring-1 ring-white/[0.06] sm:gap-2.5 sm:px-4";

  const frPanel =
    "mb-3 w-full rounded-xl border border-white/[0.07] bg-zinc-950/40 px-4 py-3 text-sm shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm";

  const frPanelTitle =
    "mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500";

  const secondaryHostBtn =
    "rounded-lg border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-40";

  const sessionPrevChapter =
    roomState && roomState.chapters.length > 0
      ? findPrevChapterInSession(
          roomState.clips,
          roomState.chapters,
          roomState.currentClipIndex,
          roomState.currentTime,
        )
      : null;
  const sessionNextChapter =
    roomState && roomState.chapters.length > 0
      ? findNextChapterInSession(
          roomState.clips,
          roomState.chapters,
          roomState.currentClipIndex,
          roomState.currentTime,
        )
      : null;

  return (
    <div className="flex min-h-screen flex-col px-4 py-6 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4 text-sm text-zinc-500">
          <p className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
              Room
            </span>{" "}
            <span className="font-mono text-sm text-zinc-300">{roomId}</span>
            <span className="text-zinc-600"> · </span>
            <span className="text-zinc-300">{isHost ? "Host" : "Viewer"}</span>
            <span className="text-zinc-600"> · </span>
            <span className="text-zinc-600">Speed </span>
            <span className="font-medium text-zinc-200">
              {displayRate === 1 ? "1×" : `${displayRate}×`}
            </span>
          </p>
          {isHost ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveSession()}
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

        {isHost && roomState ? (
          <div className={frPanel}>
            <p className={frPanelTitle}>Clip queue</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {roomState.clips.map((c, i) => {
                const active = i === roomState.currentClipIndex;
                return (
                  <button
                    key={`${c.videoId}-${i}`}
                    type="button"
                    onClick={() => void handleSelectClip(i)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                      active
                        ? "border-blue-500/55 bg-blue-600/25 text-white shadow-md shadow-blue-950/25 ring-1 ring-blue-400/35"
                        : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/18 hover:bg-white/[0.07]"
                    }`}
                  >
                    {active ? "▶ " : ""}Clip {i + 1}{" "}
                    <span className="font-mono text-[10px] text-zinc-500">
                      {c.videoId.slice(0, 6)}…
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Paste YouTube link"
                value={clipUrlDraft}
                onChange={(e) => setClipUrlDraft(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-zinc-500 focus:border-blue-500/35 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              />
              <button
                type="button"
                onClick={() => void handleAddClip()}
                className={secondaryHostBtn}
              >
                Add clip
              </button>
            </div>
          </div>
        ) : null}

        {roomState ? (
          <div className={frPanel}>
            <p className={frPanelTitle}>Chapters</p>
            {isHost ? (
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
                  className={secondaryHostBtn}
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!sessionNextChapter}
                  onClick={() => void handleNextChapter()}
                  className={secondaryHostBtn}
                >
                  Next
                </button>
              </div>
            ) : null}
            {roomState.chapters.length === 0 ? (
              <p className="text-xs text-zinc-600">No chapters yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {roomState.chapters.map((ch, i) => {
                  const onActiveClip = ch.videoId === roomState.videoId;
                  return (
                    <li key={`${ch.videoId}-${ch.time}-${i}`}>
                      {isHost ? (
                        <button
                          type="button"
                          onClick={() => void jumpToChapter(ch)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                            onActiveClip
                              ? "border-blue-500/25 bg-blue-950/30 text-zinc-100 ring-1 ring-blue-500/15"
                              : "border-white/8 bg-black/35 text-zinc-300 hover:border-white/15 hover:bg-black/55"
                          }`}
                        >
                          <span className="font-medium text-white">
                            {ch.label}
                          </span>
                          <span className="ml-2 font-mono text-zinc-500">
                            {formatChapterTime(ch.time)}
                          </span>
                          {ch.videoId !== roomState.videoId ? (
                            <span className="ml-2 text-[10px] text-amber-400/85">
                              (other clip)
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <div
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            onActiveClip
                              ? "border-blue-500/20 bg-blue-950/20 text-zinc-300 ring-1 ring-blue-500/10"
                              : "border-white/[0.06] bg-black/30 text-zinc-400"
                          }`}
                        >
                          <span className="text-zinc-100">{ch.label}</span>
                          <span className="ml-2 font-mono text-zinc-600">
                            {formatChapterTime(ch.time)}
                          </span>
                          {ch.videoId !== roomState.videoId ? (
                            <span className="ml-2 text-[10px] text-zinc-600">
                              (other clip)
                            </span>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <div
          ref={stageRef}
          className={`relative w-full overflow-hidden bg-black ${
            stageFullscreen
              ? "flex max-h-none min-h-0 flex-1 flex-col rounded-none ring-0 shadow-none"
              : "rounded-xl ring-1 ring-white/10 shadow-2xl shadow-black/50"
          }`}
        >
          <div className="relative aspect-video w-full">
            <div className="absolute inset-0 overflow-hidden">
              <YouTube
                key={safeDecodeVideoId(effectiveVideoId)}
                ref={playerRef}
                videoId={safeDecodeVideoId(effectiveVideoId)}
                onReady={handlePlayerReady}
                onStateChange={handleYoutubeStateChange}
                className="absolute left-0 top-0 h-full w-full"
                iframeClassName="absolute left-0 top-0 h-full w-full"
                opts={YOUTUBE_PLAYER_OPTS}
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
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Viewer
                  </p>
                  <p className="mb-6 text-sm leading-relaxed text-zinc-400">
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
            {!isHost ? (
              <div className="pointer-events-none absolute bottom-2 right-2 z-30 sm:bottom-3 sm:right-3">
                <button
                  type="button"
                  onClick={() => void toggleStageFullscreen()}
                  className={`pointer-events-auto ${hostChip}`}
                >
                  {stageFullscreen ? "Exit full" : "Fullscreen"}
                </button>
              </div>
            ) : null}
            {isHost ? (
              <div className="pointer-events-none absolute left-1/2 top-2 z-30 flex w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 justify-center px-1 sm:top-3">
                <div className={hostControlsBar}>
                  <button
                    type="button"
                    onClick={handlePlay}
                    className={hostChip}
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    onClick={handlePause}
                    className={hostChip}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={handleSeekBack}
                    className={hostChip}
                  >
                    -10s
                  </button>
                  <button
                    type="button"
                    onClick={handleHostResync}
                    className={hostChipSync}
                  >
                    Sync
                  </button>
                  {HOST_SPEEDS.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => handleSpeed(rate)}
                      className={`${hostChip} ${
                        Math.abs(
                          (roomState?.playbackRate ?? DEFAULT_PLAYBACK_RATE) -
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
                  <button
                    type="button"
                    onClick={() => void toggleStageFullscreen()}
                    className={hostChip}
                  >
                    {stageFullscreen ? "Exit full" : "Fullscreen"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-zinc-500">
          <p className="text-sm">Loading…</p>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
