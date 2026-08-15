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
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  get,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
  serverTimestamp,
} from "firebase/database";
import type { YouTubePlayer } from "react-youtube";
import YouTube from "react-youtube";
import { db } from "@/lib/firebase";
import { isDebugUiEnabled } from "@/lib/debug-ui";
import {
  buildViewerRoomUrl,
  isRoomHost,
  markRoomHost,
  subscribeToRoomHostStore,
} from "@/lib/room-host";
import { useAuth } from "@/components/AuthProvider";
import {
  FILM_ROOM_TELESTRATOR_CLEAR_EVENT,
  type FilmRoomTelestratorClearDetail,
  TelestratorOverlay,
} from "@/components/TelestratorOverlay";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  ensureSessionSharing,
  getSavedSession,
  getSavedSessionByShareId,
  saveSessionTemplate,
  type SavedSessionDoc,
} from "@/lib/saved-sessions";
import {
  buildRoomSeedFromSavedTemplate,
  isFacebookLessonTemplate,
  roomClipToSavedClip,
} from "@/lib/saved-session-clips";
import {
  parseVideoAngles,
  pickAngle,
  playbackTimeForAngleFromActiveAnchor,
  type VideoAngle,
} from "@/lib/video-angle";
import { extractYouTubeVideoId } from "@/lib/youtube-id";
import { consumeFacebookRoomInit } from "@/lib/facebook-room-init";
import { resolveVideoFromPaste } from "@/lib/resolve-video-paste";
import {
  type CoachAlertLatest,
  type RoomGameMark,
  type RoomGameMarkRole,
  parseCoachAlertLatest,
  parseRoomGameMark,
} from "@/lib/room-game-marks";
import { addGameEvent, getDirectorTrack } from "@/lib/games";
import { persistRoomManualSyncPairToGame } from "@/lib/persist-room-game-sync";
import { roomGameMarkToTimelineEvent } from "@/lib/game-events";
import {
  buildReelSteps,
  parseHighlightDraftMeta,
  type HighlightMoment,
  type ReelStep,
} from "@/lib/highlight-draft";
import CutStudio from "@/components/CutStudio";
import FacebookVideoPlayer from "@/components/FacebookVideoPlayer";
import FacebookLandscapeCapture from "@/components/FacebookLandscapeCapture";
import RoomReelBar from "@/components/RoomReelBar";
import { VideoZoomStage } from "@/components/VideoZoomStage";

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

/** Blocks touch from reaching YouTube (host) so native controls never steal taps. */
function YoutubePointerGate({
  drawOn,
  blockOn,
  children,
}: {
  drawOn: boolean;
  blockOn: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative block h-full w-full min-h-0 min-w-0 overflow-hidden ${
        blockOn ? "[&_iframe]:pointer-events-none" : ""
      }`}
    >
      {children}
      <div
        className={`pointer-overlay absolute inset-0 z-[16] bg-transparent ${
          blockOn ? "pointer-events-auto" : "pointer-events-none"
        }`}
        onPointerDown={(e) => {
          if (!blockOn) return;
          e.stopPropagation();
          if (drawOn) e.preventDefault();
        }}
        onTouchStart={(e) => {
          if (!blockOn) return;
          e.stopPropagation();
          if (drawOn) e.preventDefault();
        }}
        aria-hidden
      />
    </div>
  );
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
    enablejsapi: 1,
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

type ClipEntry = {
  videoId: string;
  label?: string;
  provider?: "youtube" | "facebook";
  facebookVideoUrl?: string;
};

/** Saved jump points; `videoId` ties each marker to a clip in the queue. */
type ChapterEntry = {
  time: number;
  label: string;
  videoId: string;
  /** Shared game-clock moment (optional; legacy chapters use `time` as game time on the reference angle). */
  gameTime?: number;
};

type VideoAngleWithAppCreated = VideoAngle & { appCreatedLive?: boolean };

type RoomState = {
  /** Room owner (optional for legacy rooms). */
  ownerId?: string;
  /** Optional display name / title for the session. */
  name?: string;
  sourceRoomId?: string;
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
  /** Earliest shared time where all angles exist (seconds). Host clamps all transport to >= this. */
  syncAnchorTime?: number;
  chapters: ChapterEntry[];
  /** Camera angles; synthesized as a single default angle when absent from RTDB. */
  angles: VideoAngleWithAppCreated[];
  currentAngleId: string;
  /** Which angle is shown on top in stacked (viewer follow-coach). */
  selectedDisplayAngleId?: string;
  /** Stacked viewers: which angle is on top / unmuted; coach can stay in Multi View. */
  playerViewAngleId?: string;
  /** UI flag after manual sync (no automatic background sync in archive mode). */
  manualSyncLocked?: boolean;
  /** Epoch ms when manual sync lock was set (optional UX / debugging). */
  manualSyncAt?: number;
  /** Live stream session intent (Stream Room, API at create, or restored from a saved template). Authoritative for LIVE UI — not inferred from watch URLs after load. */
  sourceType?: "live";
  /** Playback backend; default YouTube when omitted. */
  videoProvider?: "youtube" | "facebook";
  /** Active Facebook embed href (kind: facebook). */
  facebookVideoUrl?: string;
};

type RoomViewMode = "clip" | "sync";

function isSyncLayoutMode(mode: RoomViewMode): boolean {
  return mode === "sync";
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

function formatCountdownMmSs(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
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

/** Game-clock moment when present so multi-angle Review marks sort with the session. */
function chapterSortMoment(ch: ChapterEntry): number {
  return typeof ch.gameTime === "number" && Number.isFinite(ch.gameTime)
    ? ch.gameTime
    : ch.time;
}

/** Queue index for sort/navigation; unknown `videoId` sorts after all clips in the queue. */
function clipSortIndexForOrder(
  clips: ClipEntry[],
  videoId: string,
  angles?: Pick<VideoAngle, "videoId">[],
): number {
  const i = clips.findIndex((c) => c.videoId === videoId);
  if (i >= 0) return i;
  // Review marks are stored on a camera angle, not a queued clip.
  if (angles?.some((a) => a.videoId === videoId)) return 0;
  return clips.length;
}

function compareChapterOrder(
  clips: ClipEntry[],
  a: ChapterEntry,
  b: ChapterEntry,
  angles?: Pick<VideoAngle, "videoId">[],
): number {
  const ia = clipSortIndexForOrder(clips, a.videoId, angles);
  const ib = clipSortIndexForOrder(clips, b.videoId, angles);
  if (ia !== ib) return ia - ib;
  return chapterSortMoment(a) - chapterSortMoment(b);
}

function sortChaptersForNavigation(
  clips: ClipEntry[],
  chapters: ChapterEntry[],
  angles?: Pick<VideoAngle, "videoId">[],
): ChapterEntry[] {
  return [...chapters].sort((a, b) => compareChapterOrder(clips, a, b, angles));
}

/** Display order: clip queue order, then time ascending; carries RTDB index for edits. */
function buildChaptersDisplayList(
  clips: ClipEntry[],
  chapters: ChapterEntry[],
  angles?: Pick<VideoAngle, "videoId">[],
): Array<{ chapter: ChapterEntry; sourceIndex: number }> {
  const rows = chapters.map((chapter, sourceIndex) => ({
    chapter,
    sourceIndex,
  }));
  rows.sort((a, b) => compareChapterOrder(clips, a.chapter, b.chapter, angles));
  return rows;
}

function chapterSeekTimeOnAngle(
  chapter: ChapterEntry,
  angles: VideoAngle[],
  targetAngle: VideoAngle,
): number {
  if (typeof chapter.gameTime === "number" && Number.isFinite(chapter.gameTime)) {
    return Math.max(0, chapter.gameTime + (targetAngle.offsetFromGameTime ?? 0));
  }
  if (chapter.videoId === targetAngle.videoId) {
    return Math.max(0, chapter.time);
  }
  const tagged = angles.find((a) => a.videoId === chapter.videoId);
  if (tagged) {
    const gameTime = chapter.time - (tagged.offsetFromGameTime ?? 0);
    return Math.max(0, gameTime + (targetAngle.offsetFromGameTime ?? 0));
  }
  return Math.max(0, chapter.time);
}

function formatClipLabel(clip: ClipEntry, index: number): string {
  const t = clip.label?.trim();
  if (t) return t;
  return `Clip ${index + 1}`;
}

function clipToSavedClip(c: ClipEntry) {
  return roomClipToSavedClip(c);
}

function chapterStrictlyBeforeCursor(
  clips: ClipEntry[],
  ch: ChapterEntry,
  cursorClipIdx: number,
  cursorMoment: number,
  angles?: Pick<VideoAngle, "videoId">[],
): boolean {
  const ci = clipSortIndexForOrder(clips, ch.videoId, angles);
  const chMoment = chapterSortMoment(ch);
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
  angles?: Pick<VideoAngle, "videoId">[],
): boolean {
  const ci = clipSortIndexForOrder(clips, ch.videoId, angles);
  const chMoment = chapterSortMoment(ch);
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
  angles?: Pick<VideoAngle, "videoId">[],
): ChapterEntry | null {
  if (!chapters.length) return null;
  const sorted = sortChaptersForNavigation(clips, chapters, angles);
  let best: ChapterEntry | null = null;
  for (const ch of sorted) {
    if (
      chapterStrictlyBeforeCursor(
        clips,
        ch,
        cursorClipIdx,
        cursorMoment,
        angles,
      )
    ) {
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
  angles?: Pick<VideoAngle, "videoId">[],
): ChapterEntry | null {
  if (!chapters.length) return null;
  const sorted = sortChaptersForNavigation(clips, chapters, angles);
  for (const ch of sorted) {
    if (
      chapterStrictlyAfterCursor(
        clips,
        ch,
        cursorClipIdx,
        cursorMoment,
        angles,
      )
    ) {
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
  tActive: number,
  activeAngle: VideoAngle,
  refAngle: VideoAngle,
  angles: VideoAngle[] = [],
): number | null {
  let bestIdx: number | null = null;
  let bestTime = -Infinity;
  const cursorGame = tActive - (activeAngle.offsetFromGameTime ?? 0);
  const cursorRef = playbackTimeForAngleFromActiveAnchor(tActive, refAngle);
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const onQueuedClip = ch.videoId === activeClipCanonicalVideoId;
    const onRoomAngle = angles.some((a) => a.videoId === ch.videoId);
    if (!onQueuedClip && !onRoomAngle) continue;
    const chMoment = onRoomAngle ? chapterSortMoment(ch) : ch.time;
    const cursor = onRoomAngle ? cursorGame : cursorRef;
    if (chMoment <= cursor + CHAPTER_ACTIVE_UI_EPS && chMoment >= bestTime) {
      bestTime = chMoment;
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
      const providerRaw = o.provider;
      const provider =
        providerRaw === "facebook" || providerRaw === "youtube"
          ? providerRaw
          : undefined;
      const facebookVideoUrlRaw = o.facebookVideoUrl;
      const facebookVideoUrl =
        typeof facebookVideoUrlRaw === "string" &&
        facebookVideoUrlRaw.trim() !== ""
          ? facebookVideoUrlRaw.trim()
          : undefined;
      out.push({
        videoId: (row as ClipEntry).videoId,
        ...(label ? { label } : {}),
        ...(provider ? { provider } : {}),
        ...(facebookVideoUrl ? { facebookVideoUrl } : {}),
      });
    }
  }
  return out;
}

function activeFacebookHref(state: RoomState | null | undefined): string | null {
  if (!state || state.videoProvider !== "facebook") return null;
  const clip = state.clips[state.currentClipIndex];
  if (clip?.facebookVideoUrl?.trim()) return clip.facebookVideoUrl.trim();
  if (state.facebookVideoUrl?.trim()) return state.facebookVideoUrl.trim();
  return null;
}

function facebookFieldsForClip(clip: ClipEntry): Record<string, unknown> {
  if (clip.provider === "facebook" && clip.facebookVideoUrl?.trim()) {
    return {
      videoProvider: "facebook",
      facebookVideoUrl: clip.facebookVideoUrl.trim(),
    };
  }
  return {};
}

/** Normalize clip list + index; `videoId` from RTDB is authoritative for the active stream. */
function parseRoomFromDb(val: Record<string, unknown> | null): RoomState | null {
  if (!val) return null;
  const ownerIdRaw = val.ownerId;
  const ownerId =
    typeof ownerIdRaw === "string" && ownerIdRaw.trim() !== ""
      ? ownerIdRaw.trim()
      : undefined;
  const nameRaw = val.name;
  const name =
    typeof nameRaw === "string" && nameRaw.trim() !== "" ? nameRaw.trim() : undefined;
  const sourceRoomIdRaw = val.sourceRoomId;
  const sourceRoomId =
    typeof sourceRoomIdRaw === "string" && sourceRoomIdRaw.trim() !== ""
      ? sourceRoomIdRaw.trim()
      : undefined;
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
  const anglesBase = parseVideoAngles(val.angles, canonicalClipId);
  const appCreatedById = new Map<string, true>();
  if (Array.isArray(val.angles)) {
    for (const row of val.angles) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id.trim() : "";
      if (!id) continue;
      if (r.appCreatedLive === true) {
        appCreatedById.set(id, true);
      }
    }
  }
  const angles: VideoAngleWithAppCreated[] = anglesBase.map((a) =>
    appCreatedById.get(a.id) ? { ...a, appCreatedLive: true } : a,
  );

  const rawAngleId = val.currentAngleId;
  let currentAngleId =
    typeof rawAngleId === "string" &&
    rawAngleId.trim() !== "" &&
    angles.some((a) => a.id === rawAngleId.trim())
      ? rawAngleId.trim()
      : angles[0]!.id;

  const rawSelected = val.selectedDisplayAngleId;
  const selectedDisplayAngleId =
    typeof rawSelected === "string" &&
    rawSelected.trim() !== "" &&
    angles.some((a) => a.id === rawSelected.trim())
      ? rawSelected.trim()
      : undefined;

  const rawPlayerView = val.playerViewAngleId;
  const playerViewAngleId =
    typeof rawPlayerView === "string" &&
    rawPlayerView.trim() !== "" &&
    angles.some((a) => a.id === rawPlayerView.trim())
      ? rawPlayerView.trim()
      : undefined;

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

  const manualSyncLocked = val.manualSyncLocked === true;
  const manualSyncAtRaw = val.manualSyncAt;
  const manualSyncAt =
    typeof manualSyncAtRaw === "number" && Number.isFinite(manualSyncAtRaw)
      ? manualSyncAtRaw
      : undefined;
  const syncAnchorTimeRaw = val.syncAnchorTime;
  const syncAnchorTime =
    typeof syncAnchorTimeRaw === "number" && Number.isFinite(syncAnchorTimeRaw)
      ? Math.max(0, syncAnchorTimeRaw)
      : 0;

  const sourceTypeRaw = val.sourceType;
  const sourceType =
    sourceTypeRaw === "live" ? ("live" as const) : undefined;

  const videoProviderRaw = val.videoProvider;
  const videoProvider =
    videoProviderRaw === "facebook" ? ("facebook" as const) : undefined;
  const facebookVideoUrlRaw = val.facebookVideoUrl;
  const facebookVideoUrl =
    typeof facebookVideoUrlRaw === "string" && facebookVideoUrlRaw.trim() !== ""
      ? facebookVideoUrlRaw.trim()
      : undefined;

  return {
    ...(ownerId ? { ownerId } : {}),
    ...(name ? { name } : {}),
    ...(sourceRoomId ? { sourceRoomId } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(videoProvider ? { videoProvider } : {}),
    ...(facebookVideoUrl ? { facebookVideoUrl } : {}),
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
    ...(syncAnchorTime > 0 ? { syncAnchorTime } : {}),
    chapters: parseChapters(val.chapters),
    angles,
    currentAngleId,
    ...(selectedDisplayAngleId ? { selectedDisplayAngleId } : {}),
    ...(playerViewAngleId ? { playerViewAngleId } : {}),
    ...(manualSyncLocked ? { manualSyncLocked: true } : {}),
    ...(manualSyncAt !== undefined ? { manualSyncAt } : {}),
  };
}

/** Sync View (viewer): Player View / active angle = large main (unmuted); other = PiP (muted). */
function resolveViewerStackTopAngleId(state: RoomState): string {
  const ids = state.angles.map((a) => a.id);
  if (
    state.playerViewAngleId &&
    ids.includes(state.playerViewAngleId)
  ) {
    return state.playerViewAngleId;
  }
  if (ids.includes(state.currentAngleId)) return state.currentAngleId;
  return state.angles[0]!.id;
}

/** Stable key for viewer main/PiP mute layout only (ignores playhead / heartbeat fields). */
function viewerStackSelectionMuteKey(
  state: RoomState | null,
  localMainOverride?: string | null,
): string {
  if (!state || state.angles.length < 2) return "";
  const top =
    localMainOverride &&
    state.angles.some((a) => a.id === localMainOverride)
      ? localMainOverride
      : resolveViewerStackTopAngleId(state);
  return [
    top,
    state.currentAngleId,
    state.playerViewAngleId ?? "",
    state.selectedDisplayAngleId ?? "",
    state.angles.map((a) => a.id).join(","),
  ].join("\0");
}

function stableKey(s: RoomState): string {
  const pc = s.playbackCommand?.commandId ?? 0;
  return `${s.videoId}|${s.currentAngleId}|${s.isPlaying}|${s.currentTime}|${s.playbackRate}|${s.updatedAt}|${s.action}|${s.actionId}|pc:${pc}`;
}

function getSafeAnchorTime(requestedTime: unknown, state: RoomState): number {
  const requested =
    typeof requestedTime === "number" && Number.isFinite(requestedTime)
      ? requestedTime
      : state.currentTime ?? 0;
  const syncAnchor = state.syncAnchorTime ?? 0;
  const safe = Math.max(requested, syncAnchor);
  if (safe !== requested && syncAnchor > 0) {
    syncLog("anchor clamped to syncAnchorTime", {
      requested,
      syncAnchorTime: syncAnchor,
      safe,
    });
  }
  return safe;
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
// const VIEWER_RATE_CORRECTION_EPS = 0.028;
/** First apply / explicit host playhead move: small deadband. */
const SEEK_AFTER_TRANSPORT_JUMP_S = 0.2;
const SEEK_INITIAL_SYNC_S = 0.3;
/** Viewer: avoid jitter from repeated seeks on small drift. */
const VIEWER_SEEK_DEADBAND_S = 1.5;

/**
 * Heartbeat / host echo: while playing, explicit time jumps (e.g. heartbeat) only seek
 * when drift exceeds this — avoids micro-seeks on each ping.
 */
const EXPLICIT_SEEK_PLAYING_MIN_DRIFT_S = 0.55;

/** Pad below reported live edge when clamping seeks. */
const LIVE_EDGE_CLAMP_PAD_S = 0.15;
/** Near-live jump / forward scrub cap for YouTube live DVR edge (seconds behind reported edge). */
const LIVE_SAFETY_BUFFER_SECONDS = 5;

const MIXED_LIVE_ARCHIVE_MSG =
  "Live and recorded videos can't be mixed in the same sync room.";

const LIVE_VIA_STREAM_ROOM_MSG =
  "Live streams must be started from Go Live.";

/** Subset of `/api/youtube-video-meta` used for live vs iframe-state reconciliation. */
type YoutubeVideoMetaBrief = {
  isLive?: boolean;
  liveBroadcastContent?: string;
  streamPhase?: string;
  actualStartTime?: string;
  actualEndTime?: string;
};

async function fetchYoutubeVideoMeta(
  videoId: string,
): Promise<
  { ok: true; meta: YoutubeVideoMetaBrief } | { ok: false; reason: string }
> {
  try {
    const res = await fetch(
      `/api/youtube-video-meta?videoId=${encodeURIComponent(videoId)}`,
    );
    let data: {
      ok?: boolean;
      meta?: YoutubeVideoMetaBrief;
      error?: string;
    } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      return { ok: false, reason: "Could not read YouTube metadata." };
    }
    if (
      !res.ok ||
      data.ok !== true ||
      !data.meta ||
      typeof data.meta !== "object"
    ) {
      const err =
        typeof data.error === "string" && data.error.trim() !== ""
          ? data.error
          : !res.ok
            ? `YouTube metadata request failed (${res.status}).`
            : "YouTube metadata unavailable.";
      return { ok: false, reason: err };
    }
    return { ok: true, meta: data.meta };
  } catch {
    return { ok: false, reason: "Network error fetching YouTube metadata." };
  }
}

async function fetchYoutubeIsLive(
  videoId: string,
): Promise<
  { ok: true; isLive: boolean } | { ok: false; reason: string }
> {
  const r = await fetchYoutubeVideoMeta(videoId);
  if (!r.ok) return r;
  return { ok: true, isLive: Boolean(r.meta.isLive) };
}

async function inferRoomLiveFromAngles(
  cur: RoomState,
): Promise<
  { ok: true; isLive: boolean } | { ok: false; reason: string }
> {
  /* Saved / Stream Room live sessions: `sourceType` wins over per-angle YouTube `isLive` (ended VOD URLs allowed). */
  if (cur.sourceType === "live") return { ok: true, isLive: true };
  const ids = [...new Set(cur.angles.map((a) => a.videoId))];
  let sawLive = false;
  let sawArchive = false;
  for (const vid of ids) {
    const r = await fetchYoutubeIsLive(vid);
    if (!r.ok) return r;
    if (r.isLive) sawLive = true;
    else sawArchive = true;
  }
  if (sawLive && sawArchive) {
    return { ok: false, reason: MIXED_LIVE_ARCHIVE_MSG };
  }
  /* Non-live rooms never infer `sourceType: live` from YouTube API — Add Angle cannot upgrade the room. */
  return { ok: true, isLive: false };
}

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

/** True live for UI: Data API says broadcast is live, not merely "live context" (e.g. upcoming). */
function metaStrictBroadcastLive(
  meta: YoutubeVideoMetaBrief | undefined,
): boolean {
  if (!meta) return false;
  return (
    meta.streamPhase === "active" ||
    meta.liveBroadcastContent === "live"
  );
}

function metaUpcomingBroadcast(
  meta: YoutubeVideoMetaBrief | undefined,
): boolean {
  if (!meta) return false;
  return (
    meta.streamPhase === "upcoming" ||
    meta.liveBroadcastContent === "upcoming"
  );
}

function youtubePlayerStateLabelForDebug(
  st: number | undefined,
  meta: YoutubeVideoMetaBrief | undefined,
  opts?: { relaxApiMismatchForLiveSession?: boolean },
): string {
  const raw = typeof st === "number" ? youtubeStateLabel(st) : "?";
  if (st === YT_UNSTARTED && metaStrictBroadcastLive(meta)) {
    return `LIVE (Data API) · iframe ${raw}`;
  }
  if (
    st === YT_UNSTARTED &&
    !metaStrictBroadcastLive(meta) &&
    metaUpcomingBroadcast(meta)
  ) {
    return `WAITING / UPCOMING · iframe ${raw}`;
  }
  if (
    opts?.relaxApiMismatchForLiveSession &&
    st === YT_UNSTARTED &&
    !metaStrictBroadcastLive(meta) &&
    !metaUpcomingBroadcast(meta)
  ) {
    return `Waiting for live signal from YouTube · iframe ${raw}`;
  }
  return raw;
}

function formatYtApiDebugLine(meta: YoutubeVideoMetaBrief | undefined): string {
  if (!meta) return "api: (no meta yet)";
  const lbc = meta.liveBroadcastContent ?? "—";
  const ph = meta.streamPhase ?? "—";
  const ast = meta.actualStartTime ?? "—";
  const aet = meta.actualEndTime ?? "—";
  const broadIsLive =
    meta.isLive === undefined ? "—" : meta.isLive ? "true" : "false";
  return `api lbc=${lbc} phase=${ph} start=${ast} end=${aet} broadIsLive=${broadIsLive}`;
}

// (Archive hard-lock) No background playback heartbeats.

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

type ForceYouTubePlayOpts = {
  /** When false, skip delayed `unMute` (stacked PiP / secondaries stay muted until layout unmutes). */
  delayedUnmute?: boolean;
};

/**
 * Mute + staggered `playVideo` + delayed optional `unMute` — improves autoplay policy on live/sync.
 */
function forceYouTubePlay(
  player: YouTubePlayer | null | undefined,
  reason: string,
  activeAngleId?: string,
  opts?: ForceYouTubePlayOpts,
): void {
  if (!player) return;
  const delayedUnmute = opts?.delayedUnmute !== false;
  try {
    try {
      player.mute?.();
    } catch {
      /* YouTube API */
    }
    player.playVideo?.();
    window.setTimeout(() => {
      try {
        player.playVideo?.();
      } catch {
        /* YouTube API */
      }
    }, 250);
    window.setTimeout(() => {
      try {
        player.playVideo?.();
      } catch {
        /* YouTube API */
      }
    }, 750);
    window.setTimeout(() => {
      try {
        player.playVideo?.();
      } catch {
        /* YouTube API */
      }
    }, 1500);
    if (delayedUnmute) {
      window.setTimeout(() => {
        try {
          player.unMute?.();
        } catch {
          /* YouTube API */
        }
      }, 1200);
    }
    syncLog("force youtube play requested", { reason, activeAngleId });
  } catch (error) {
    syncLog("force youtube play failed", {
      reason,
      activeAngleId,
      error: String(error),
    });
  }
}

async function forceLiveBootstrapPlay(
  player: YouTubePlayer,
  reason: string,
): Promise<void> {
  try {
    console.log("LIVE_BOOTSTRAP_READY", { reason });

    player.mute?.();

    const attempts = [0, 250, 750, 1500, 3000];
    let loggedPlaying = false;

    for (const delay of attempts) {
      window.setTimeout(() => {
        try {
          const state = player.getPlayerState?.();

          console.log("LIVE_BOOTSTRAP_ATTEMPT", {
            reason,
            delay,
            state,
          });

          if (state === YT_PLAYING || state === YT_BUFFERING) {
            if (!loggedPlaying) {
              loggedPlaying = true;
              console.log("LIVE_BOOTSTRAP_PLAYING", { reason, delay, state });
            }
            return;
          }

          player.playVideo?.();

          try {
            player.seekTo?.(player.getCurrentTime?.() || 0, true);
          } catch {
            /* ignore */
          }
        } catch (err) {
          console.warn("LIVE_BOOTSTRAP_FAIL", err);
        }
      }, delay);
    }
  } catch (err) {
    console.warn("LIVE_BOOTSTRAP_FATAL", err);
  }
}

/** After seek on live, kick playback with muted autoplay pattern (stack unmutes top angle). */
async function livePlayRequestedWithRetry(
  player: YouTubePlayer,
  angleId: string,
  context: string,
): Promise<void> {
  let stBefore: number | undefined;
  try {
    stBefore = await readYoutubePlayerState(player);
  } catch {
    stBefore = undefined;
  }
  syncLog("live play requested", {
    angleId,
    context,
    stateBefore:
      stBefore === undefined ? undefined : youtubeStateLabel(stBefore),
  });
  forceYouTubePlay(player, `livePlayRequestedWithRetry:${context}`, angleId, {
    delayedUnmute: false,
  });
  void forceLiveBootstrapPlay(
    player,
    `livePlayRequestedWithRetry:${context}:${angleId}`,
  );

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 400);
  });

  let stAfter: number | undefined;
  try {
    stAfter = await readYoutubePlayerState(player);
  } catch {
    stAfter = undefined;
  }

  syncLog("live play retry", {
    angleId,
    context,
    stateBefore:
      stBefore === undefined ? undefined : youtubeStateLabel(stBefore),
    stateAfter:
      stAfter === undefined ? undefined : youtubeStateLabel(stAfter),
  });
}

/**
 * Only toggles play/pause when the iframe state disagrees — avoids stop-start from repeated calls.
 * Caller should invoke only on play/pause intent change or after seek (not on every heartbeat).
 */
async function applyPlaybackIfNeeded(
  player: YouTubePlayer,
  shouldPlay: boolean,
  opts?: { liveHostKick?: boolean },
): Promise<void> {
  const st = await readYoutubePlayerState(player);
  if (st === undefined) {
    if (shouldPlay) {
      if (opts?.liveHostKick) {
        forceYouTubePlay(player, "applyPlaybackIfNeeded:live-host", undefined, {
          delayedUnmute: true,
        });
        void forceLiveBootstrapPlay(
          player,
          "applyPlaybackIfNeeded:live-host",
        );
      } else {
        player.playVideo();
      }
    } else {
      player.pauseVideo();
    }
    return;
  }
  if (shouldPlay) {
    if (st === YT_PLAYING || st === YT_BUFFERING) return;
    if (opts?.liveHostKick) {
      forceYouTubePlay(player, "applyPlaybackIfNeeded:live-host", undefined, {
        delayedUnmute: true,
      });
      void forceLiveBootstrapPlay(
        player,
        "applyPlaybackIfNeeded:live-host",
      );
      return;
    }
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
  opts?: { liveViewerKick?: boolean },
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
    if (opts?.liveViewerKick) {
      forceYouTubePlay(player, "ensureViewerPlaybackIntent:live", undefined, {
        delayedUnmute: false,
      });
      void forceLiveBootstrapPlay(
        player,
        "ensureViewerPlaybackIntent:live",
      );
    } else {
      player.playVideo();
    }
    return;
  }
  if (st === YT_PLAYING) {
    return;
  }
  if (opts?.liveViewerKick) {
    forceYouTubePlay(player, "ensureViewerPlaybackIntent:live", undefined, {
      delayedUnmute: false,
    });
    void forceLiveBootstrapPlay(
      player,
      "ensureViewerPlaybackIntent:live",
    );
    return;
  }
  player.playVideo();
}

function safeDecodeVideoId(id: string | null | undefined): string {
  if (id == null) return "";
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

/** Best-effort live edge: duration when available, else current time (YouTube live / DVR). */
async function getLiveEdgeSeconds(
  player: YouTubePlayer | null | undefined,
): Promise<number> {
  const ct = await readYoutubeCurrentTime(player, 0);
  const dur = await readYoutubeDuration(player);
  if (dur > 0) return Math.max(dur, ct);
  return ct;
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

/** Host -10 / -30: always step back from current playhead; clamp upper only when a live edge exists. */
async function clampHostSeekBackwardSeconds(
  player: YouTubePlayer | null | undefined,
  fallbackFb: number,
  deltaSec: number,
): Promise<number> {
  const ct = await readYoutubeCurrentTime(player, fallbackFb);
  let target = ct - deltaSec;
  target = Math.max(0, target);
  const edge = await readLiveEdgeTime(player, fallbackFb);
  if (Number.isFinite(edge) && edge > LIVE_EDGE_CLAMP_PAD_S + 0.05) {
    target = Math.min(target, edge - LIVE_EDGE_CLAMP_PAD_S);
  }
  return target;
}

// `readYoutubePlaybackRate` removed: deterministic sync uses explicit room playbackRate only.

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
    state.sourceType === "live" ? { liveViewerKick: true } : undefined,
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

  const anchorTime = getSafeAnchorTime(cmd.anchorVideoTime, roomSnapshot);
  const localT = await readYoutubeCurrentTime(player, anchorTime);
  if (Math.abs(localT - anchorTime) >= VIEWER_SEEK_DEADBAND_S) {
    await player.seekTo(anchorTime, true);
  }
  await safeSetPlaybackRate(player, cmd.playbackRate);
  lastViewerSyncRateRef.current = cmd.playbackRate;

  const viewerLiveKick = roomSnapshot.sourceType === "live";

  if (cmd.type === "play") {
    await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef, {
      liveViewerKick: viewerLiveKick,
    });
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
          await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef, {
            liveViewerKick: viewerLiveKick,
          });
        } catch {
          /* ignore */
        }
        const st2 = await readYoutubePlayerState(player);
        const ct = await readYoutubeCurrentTime(player, anchorTime);
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
        const ct = await readYoutubeCurrentTime(player, anchorTime);
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
      await ensureViewerPlaybackIntent(player, true, viewerPlaybackUnlockedRef, {
        liveViewerKick: viewerLiveKick,
      });
    } else {
      await applyPlaybackIfNeeded(player, false);
    }
  } else {
    await ensureViewerPlaybackIntent(
      player,
      roomSnapshot.isPlaying,
      viewerPlaybackUnlockedRef,
      viewerLiveKick ? { liveViewerKick: true } : undefined,
    );
  }

  const stFinal = await readYoutubePlayerState(player);
  const ctFinal = await readYoutubeCurrentTime(player, anchorTime);
  syncLog("viewer post-apply (immediate command)", {
    type: cmd.type,
    commandId: cmd.commandId,
    ytState: stFinal,
    currentTime: ctFinal,
    isPlayingIntent: roomSnapshot.isPlaying,
  });
}

/** Temporary Sync View debug: name, video id, ready + YT iframe state (poll) + Data API meta. */
function SyncAngleDebugStrip({
  angleId,
  angleName,
  videoId,
  syncPlayerRefs,
  ytMeta,
  relaxApiMismatchForLiveSession,
}: {
  angleId: string;
  angleName: string;
  videoId: string;
  syncPlayerRefs: React.MutableRefObject<Record<string, YouTubePlayer | null>>;
  ytMeta: YoutubeVideoMetaBrief | undefined;
  /** Stream Room live: do not imply “not live” when Data API lags behind a persistent /live feed. */
  relaxApiMismatchForLiveSession?: boolean;
}) {
  const [line, setLine] = useState("ready: … · state: —");
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = syncPlayerRefs.current[angleId];
      if (!p) {
        setLine("ready: no · state: —");
        return;
      }
      void readYoutubePlayerState(p)
        .then((st) => {
          setLine(
            `ready: yes · state: ${youtubePlayerStateLabelForDebug(st, ytMeta, {
              relaxApiMismatchForLiveSession,
            })}`,
          );
        })
        .catch(() => {
          setLine("ready: yes · state: ?");
        });
    }, 1000);
    return () => window.clearInterval(id);
  }, [angleId, videoId, syncPlayerRefs, ytMeta, relaxApiMismatchForLiveSession]);
  return (
    <div className="pointer-events-none absolute left-1 bottom-1 right-1 z-[40] max-h-[42%] overflow-hidden rounded border border-amber-500/40 bg-black/88 px-1.5 py-1 text-[8px] leading-snug text-amber-100/95">
      <div className="truncate font-semibold text-white">{angleName}</div>
      <div className="truncate font-mono text-zinc-300">{videoId || "—"}</div>
      <div className="text-zinc-200">{line}</div>
      <div className="truncate text-zinc-400">{formatYtApiDebugLine(ytMeta)}</div>
    </div>
  );
}

const gameMarkQuickBtnClass =
  "rounded-md border border-white/12 bg-zinc-900/85 px-2 py-1 text-[11px] font-medium text-zinc-100 shadow-sm transition hover:border-white/20 hover:bg-zinc-800/90 disabled:cursor-not-allowed disabled:opacity-40";

const gameMarkBandBtnClass =
  "shrink-0 rounded-md border border-white/10 bg-zinc-950/70 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:border-white/18 hover:bg-zinc-900/80 disabled:cursor-not-allowed disabled:opacity-40";

const GAME_MARK_QUICK_LABELS = [
  "Mark",
  "Goal",
  "Defensive error",
  "Transition",
  "Set piece",
] as const;

function GameMarksToolbar({
  busy,
  onQuickMark,
  onCustomMark,
  variant = "panel",
}: {
  busy: boolean;
  onQuickMark: (label: string) => void;
  onCustomMark: () => void;
  variant?: "panel" | "band";
}) {
  const btnClass =
    variant === "band" ? gameMarkBandBtnClass : gameMarkQuickBtnClass;

  if (variant === "band") {
    return (
      <div
        className="pointer-events-auto flex w-full items-center gap-1.5 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/45 px-2 py-1.5 backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="toolbar"
        aria-label="Coach marks"
      >
        <span className="shrink-0 pr-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
          Marks
        </span>
        {GAME_MARK_QUICK_LABELS.map((label) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            className={btnClass}
            onClick={() => onQuickMark(label)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          className={btnClass}
          onClick={onCustomMark}
        >
          Custom
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Marks
      </span>
      {GAME_MARK_QUICK_LABELS.map((label) => (
        <button
          key={label}
          type="button"
          disabled={busy}
          className={btnClass}
          onClick={() => onQuickMark(label)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        disabled={busy}
        className={btnClass}
        onClick={onCustomMark}
      >
        Custom
      </button>
    </div>
  );
}

function CoachAlertToastOverlay({
  alert,
  onJump,
  onDismiss,
}: {
  alert: CoachAlertLatest;
  onJump: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="pointer-events-auto fixed bottom-4 right-4 z-[10050] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-emerald-500/35 bg-zinc-950/95 p-4 shadow-2xl shadow-black/60 ring-1 ring-white/[0.06] backdrop-blur-md"
      role="status"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/90">
        Coach alert
      </div>
      <p className="mt-2 text-sm font-medium text-zinc-100">
        New mark: {alert.label}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onJump}
          className="rounded-lg border border-blue-500/45 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
        >
          Jump to replay
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.10]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function seedRoomFromLessonTemplate(
  template: SavedSessionDoc,
  roomRef: ReturnType<typeof ref>,
  opts: { ownerId?: string },
): string {
  const seed = buildRoomSeedFromSavedTemplate(template, opts);
  void set(roomRef, {
    ...seed,
    playbackRate: DEFAULT_PLAYBACK_RATE,
    updatedAt: serverTimestamp(),
  });
  return String(seed.videoId ?? "");
}

function roomQueryForLessonTemplate(
  template: SavedSessionDoc,
  activeVideoId: string,
): URLSearchParams {
  const loadQs = new URLSearchParams();
  loadQs.set("video", activeVideoId);
  if (isFacebookLessonTemplate(template)) {
    loadQs.set("provider", "facebook");
  }
  if (template.sourceType === "live") loadQs.set("view", "sync");
  return loadQs;
}

function RoomContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = typeof params.id === "string" ? params.id : "";
  const videoFromUrl = searchParams.get("video");
  const providerFromUrl = searchParams.get("provider");
  /** Phase 0 bridge: when present, Coach Marks also write a durable Game event. */
  const gameIdFromUrl = searchParams.get("gameId");
  /** Watch together: marks come from Review; room is view-only for marking. */
  const teamRoomMode = searchParams.get("teamRoom") === "1";
  const debugUiEnabled = isDebugUiEnabled(searchParams.get("debug"));
  /** Normalized 11-char id from `?video=` (URLs like /live/…, watch?v=…, youtu.be/…, or raw id). */
  const videoIdFromUrl = useMemo(() => {
    if (providerFromUrl === "facebook") return null;
    const raw = videoFromUrl?.trim();
    if (!raw) return null;
    return extractYouTubeVideoId(safeDecodeVideoId(raw));
  }, [videoFromUrl, providerFromUrl]);
  /** Facebook numeric key from `?provider=facebook&video=`. */
  const facebookVideoKeyFromUrl = useMemo(() => {
    if (providerFromUrl !== "facebook") return null;
    const raw = videoFromUrl?.trim();
    return raw || null;
  }, [videoFromUrl, providerFromUrl]);
  const loadSavedId = searchParams.get("loadSaved");
  /** Public shared lesson template (`/shared/{shareId}` → open in room). */
  const loadSharedId = searchParams.get("loadShared");
  const viewParam = searchParams.get("view");
  /** When present with `?gameId`, loads a saved highlight reel for shared room playback. */
  const reelIdFromUrl = searchParams.get("reel");
  const { user, loading: authLoading } = useAuth();
  const [copied, setCopied] = useState(false);
  const [syncViewerLinkCopied, setSyncViewerLinkCopied] = useState(false);
  const [clipUrlDraft, setClipUrlDraft] = useState("");
  const [fbLandscapeCaptureOpen, setFbLandscapeCaptureOpen] = useState(false);
  const [telDrawOn, setTelDrawOn] = useState(false);
  const lastViewerStrokeCountRef = useRef<number | null>(null);
  /** Host: app-controlled fullscreen for one angle (not browser / iframe fullscreen). */
  const [fullscreenAngleId, setFullscreenAngleId] = useState<string | null>(null);
  /** Host-only: minimal mobile layout with video dominant. */
  const [isCleanMode, setIsCleanMode] = useState(false);
  const hostControlsRef = useRef<HTMLDivElement | null>(null);
  /** Live-ish playhead for chapter highlight (player when available, else room time). */
  const [uiPlaybackTime, setUiPlaybackTime] = useState<number | null>(null);
  const [uiDuration, setUiDuration] = useState<number | null>(null);
  const [hostScrubDraft, setHostScrubDraft] = useState<number | null>(null);
  const hostScrubActiveRef = useRef(false);
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
  /** Watch together: allow tapping the YouTube iframe (native controls enabled). */
  const blockHostYoutubePointer = isHost && !teamRoomMode;

  const handleReturnHome = useCallback(() => {
    if (
      isHost &&
      !window.confirm("Leave session? Your session will continue for others.")
    ) {
      return;
    }
    router.push(user ? "/app" : "/");
  }, [isHost, router, user]);

  const goHome = useCallback(() => {
    router.push(user ? "/app" : "/");
  }, [router, user]);

  const [roomState, setRoomState] = useState<RoomState | null>(null);
  /** First RTDB snapshot received for this `roomRef` (distinguish loading vs missing room). */
  const [roomHydrated, setRoomHydrated] = useState(false);
  /** Room is a live session (`sourceType` from Stream Room, API at create, saved template, or RTDB) — not inferred from URLs after load. */
  const isLiveRoom = roomState?.sourceType === "live";

  /**
   * Surfaced when the YouTube IFrame reports a fatal embed error (e.g. 101/150
   * "embedding disabled", 2 "bad id", 100/153). Without this the player just
   * renders black while the same video still plays on youtube.com.
   */
  const [embedError, setEmbedError] = useState<{
    code: number;
    videoId: string;
  } | null>(null);

  /**
   * Host: minimal native chrome + no iframe fullscreen (app controls drawing / layout).
   * Viewer: keep defaults so playback unlock and scrubbing stay familiar.
   * Live sessions: suggest muted autoplay-friendly embed params (host still unmutes after play).
   */
  const youtubePlayerOpts = useMemo(
    () => ({
      width: YOUTUBE_PLAYER_OPTS_BASE.width,
      height: YOUTUBE_PLAYER_OPTS_BASE.height,
      playerVars: {
        ...YOUTUBE_PLAYER_OPTS_BASE.playerVars,
        ...(typeof window !== "undefined"
          ? { origin: window.location.origin }
          : {}),
        ...(isLiveRoom
          ? {
              autoplay: 1,
              mute: 1,
            }
          : {}),
        fs: isHost ? 0 : 1,
        ...(isHost
          ? teamRoomMode
            ? {
                controls: 1,
                disablekb: 0,
              }
            : {
                controls: 0,
                disablekb: 1,
              }
          : {}),
      },
    }),
    [isHost, isLiveRoom, teamRoomMode],
  );

  const activeYouTubeVideoId = useMemo(() => {
    const fromState = roomState?.videoId?.trim();
    if (fromState) return fromState;
    const fromUrl = (videoIdFromUrl ?? "").trim();
    if (fromUrl) return fromUrl;
    const fromAngle = roomState?.angles?.find((a) => a.videoId?.trim())?.videoId;
    return (fromAngle ?? "").trim();
  }, [roomState, videoIdFromUrl]);
  const playerRef = useRef<InstanceType<typeof YouTube>>(null);
  /** Facebook embed shim exposed as YouTube-shaped player for transport code. */
  const facebookPlayerRef = useRef<YouTubePlayer | null>(null);
  /** Sync View: internal YouTube API player per angle.id (host + viewer). */
  const syncPlayerRefs = useRef<Record<string, YouTubePlayer | null>>({});
  /** Data API fields for reconciling iframe UNSTARTED vs true live (key = 11-char video id). */
  const [ytDebugMetaByVideoId, setYtDebugMetaByVideoId] = useState<
    Record<string, YoutubeVideoMetaBrief>
  >({});
  const angleVideoMetaSig = useMemo(() => {
    const ang = roomState?.angles;
    if (!ang?.length) return "";
    return ang
      .map((a) => `${a.id}:${safeDecodeVideoId(a.videoId)}`)
      .sort()
      .join("|");
  }, [roomState?.angles]);

  useEffect(() => {
    if (!angleVideoMetaSig) return;
    let cancelled = false;
    const vids = new Set<string>();
    for (const seg of angleVideoMetaSig.split("|")) {
      const i = seg.lastIndexOf(":");
      if (i < 0) continue;
      const vid = seg.slice(i + 1).trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(vid)) vids.add(vid);
    }
    void (async () => {
      await Promise.all(
        [...vids].map(async (vid) => {
          const r = await fetchYoutubeVideoMeta(vid);
          if (cancelled || !r.ok) return;
          setYtDebugMetaByVideoId((prev) => ({ ...prev, [vid]: r.meta }));
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [angleVideoMetaSig]);

  const lastAppliedKey = useRef<string>("");
  /** Monotonic generation for viewer/host apply — newer room snapshots invalidate in-flight async work. */
  const applyRoomGenRef = useRef(0);
  /** Last playback rate applied on the viewer (incl. nudge) — avoids spamming setPlaybackRate. */
  const lastViewerSyncRateRef = useRef(Number.NaN);
  /** Viewer-only: set true after explicit tap so autopolicy allows playVideo (see overlay). */
  const viewerPlaybackUnlockedRef = useRef(false);
  const [viewerPlaybackUnlocked, setViewerPlaybackUnlocked] = useState(false);
  /** Viewer-only: local main/PiP swap (does not change room Player View). */
  const [viewerLocalMainAngleId, setViewerLocalMainAngleId] = useState<
    string | null
  >(null);
  const viewerLocalMainAngleIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    viewerLocalMainAngleIdRef.current = viewerLocalMainAngleId;
  }, [viewerLocalMainAngleId]);
  /** Save session dialog (name + optional folder). */
  const [saveSessionOpen, setSaveSessionOpen] = useState(false);
  const [saveSessionName, setSaveSessionName] = useState("");
  const [saveSessionFolder, setSaveSessionFolder] = useState("");
  const [saveSessionOwnerUid, setSaveSessionOwnerUid] = useState<string | null>(
    null,
  );
  const [saveSessionSaving, setSaveSessionSaving] = useState(false);
  const [sessionSavedToast, setSessionSavedToast] = useState(false);
  const [sharingLessonPlan, setSharingLessonPlan] = useState(false);
  const [lessonPlanShareCopied, setLessonPlanShareCopied] = useState(false);
  const [sessionDirty, setSessionDirty] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveConfirmError, setLeaveConfirmError] = useState<string | null>(null);
  const goHomeAfterSaveRef = useRef(false);
  const lastSavedRoomUpdatedAtRef = useRef<number>(0);
  const dirtyInitRef = useRef(false);
  const lastDirtyChapterSigRef = useRef("");
  const lastDirtyAngleOffsetSigRef = useRef("");
  const lastDirtyPlayerViewAngleIdRef = useRef<string>("");
  const lastDirtyStrokeSigRef = useRef("");
  const dirtyStrokeInitRef = useRef(false);
  const [isCopyingShared, setIsCopyingShared] = useState(false);
  const [copySharedError, setCopySharedError] = useState<string | null>(null);
  const [copySharedToast, setCopySharedToast] = useState(false);
  const [coachViewMode, setCoachViewMode] = useState<"single" | "multi">("single");
  const coachViewModeRef = useRef(coachViewMode);
  useLayoutEffect(() => {
    coachViewModeRef.current = coachViewMode;
  }, [coachViewMode]);
  // layoutMode removed: Sync View is controlled by coachViewMode only.
  const [roomViewMode, setRoomViewMode] = useState<RoomViewMode>("clip");
  const roomViewModeRef = useRef(roomViewMode);
  useLayoutEffect(() => {
    roomViewModeRef.current = roomViewMode;
  }, [roomViewMode]);

  const navigateRoomView = useCallback(
    (mode: RoomViewMode) => {
      setRoomViewMode(mode);
      if (!roomId) return;
      const sp = new URLSearchParams(searchParams.toString());
      if (mode === "clip") {
        sp.delete("view");
      } else {
        sp.set("view", mode);
      }
      const q = sp.toString();
      router.replace(`/room/${roomId}${q ? `?${q}` : ""}`, { scroll: false });
    },
    [roomId, router, searchParams],
  );
  /** Host-only (Focus layout): which angle is currently "active" for controls + audio without reloading iframes. */
  const [hostFocusAngleId, setHostFocusAngleId] = useState<string | null>(null);
  const hostFocusAngleIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    hostFocusAngleIdRef.current = hostFocusAngleId;
  }, [hostFocusAngleId]);
  /** Host: brief "Marked" feedback after one-tap Mark Play. */
  const [markPlayState, setMarkPlayState] = useState<"idle" | "marked">("idle");
  const markPlayTimerRef = useRef<number | null>(null);
  const [gameMarks, setGameMarks] = useState<RoomGameMark[]>([]);
  const [gameMarksBusy, setGameMarksBusy] = useState(false);
  const [coachAlertToast, setCoachAlertToast] = useState<CoachAlertLatest | null>(
    null,
  );
  const coachAlertBaselineHydratedRef = useRef(false);
  const lastSeenCoachAlertIdRef = useRef<string | null>(null);
  /** Host: transient notice (angle pre-start, blocked chapter jump, etc.). */
  const [hostNotice, setHostNotice] = useState<string | null>(null);
  const hostNoticeTimerRef = useRef<number | null>(null);
  /** Host Multi View: secondary tile overlay while that angle is not yet available at current game time. */
  const [multiViewSecondaryHold, setMultiViewSecondaryHold] = useState<{
    angleId: string;
    countdownSec: number;
  } | null>(null);
  /** Host: manual sync (user aligns both players, then taps Sync). */
  const [isManualSyncMode, setIsManualSyncMode] = useState(false);
  const isManualSyncModeRef = useRef(false);
  useLayoutEffect(() => {
    isManualSyncModeRef.current = isManualSyncMode;
  }, [isManualSyncMode]);

  useEffect(() => {
    setRoomHydrated(false);
    setRoomState(null);
    lastAppliedViewerSelectionKeyRef.current = "";
    setSessionDirty(false);
    dirtyInitRef.current = false;
    dirtyStrokeInitRef.current = false;
    lastDirtyChapterSigRef.current = "";
    lastDirtyAngleOffsetSigRef.current = "";
    lastDirtyPlayerViewAngleIdRef.current = "";
    lastDirtyStrokeSigRef.current = "";
    coachAlertBaselineHydratedRef.current = false;
    lastSeenCoachAlertIdRef.current = null;
    setCoachAlertToast(null);
    setGameMarks([]);
  }, [roomId]);

  useEffect(() => {
    if (!roomState) return;
    const vp = viewParam;
    if (vp === "clip") {
      setRoomViewMode("clip");
      return;
    }
    if (vp === "sync") {
      setRoomViewMode("sync");
      return;
    }
    if (vp === "live") {
      if (roomState.sourceType === "live") {
        setRoomViewMode("sync");
        const sp = new URLSearchParams(searchParams.toString());
        sp.set("view", "sync");
        const q = sp.toString();
        router.replace(`/room/${roomId}${q ? `?${q}` : ""}`, { scroll: false });
      } else {
        setRoomViewMode("clip");
      }
      return;
    }
    if (roomState.sourceType === "live") {
      setRoomViewMode("sync");
      return;
    }
    const synced =
      (roomState.syncAnchorTime ?? 0) > 0 || roomState.manualSyncLocked === true;
    if (synced) {
      setRoomViewMode("sync");
    }
  }, [roomState, viewParam, roomId, router, searchParams]);

  useEffect(() => {
    if (!isHost) return;
    if (!roomState) return;

    const chapterSig = (roomState.chapters ?? [])
      .map((ch) =>
        [
          ch.videoId ?? "",
          String(ch.time ?? 0),
          ch.label ?? "",
          typeof ch.gameTime === "number" ? String(ch.gameTime) : "",
        ].join("|"),
      )
      .join("~");

    const angleOffsetSig = (roomState.angles ?? [])
      .map((a) =>
        [
          a.id ?? "",
          a.videoId ?? "",
          typeof (a as { offsetFromGameTime?: number }).offsetFromGameTime ===
          "number"
            ? String((a as { offsetFromGameTime?: number }).offsetFromGameTime)
            : "0",
        ].join("|"),
      )
      .join("~");

    const playerViewId = roomState.playerViewAngleId ?? "";

    if (!dirtyInitRef.current) {
      dirtyInitRef.current = true;
      lastDirtyChapterSigRef.current = chapterSig;
      lastDirtyAngleOffsetSigRef.current = angleOffsetSig;
      lastDirtyPlayerViewAngleIdRef.current = playerViewId;
      return;
    }

    if (chapterSig !== lastDirtyChapterSigRef.current) {
      setSessionDirty(true);
      lastDirtyChapterSigRef.current = chapterSig;
    }
    if (angleOffsetSig !== lastDirtyAngleOffsetSigRef.current) {
      setSessionDirty(true);
      lastDirtyAngleOffsetSigRef.current = angleOffsetSig;
    }
    if (playerViewId !== lastDirtyPlayerViewAngleIdRef.current) {
      setSessionDirty(true);
      lastDirtyPlayerViewAngleIdRef.current = playerViewId;
    }
  }, [isHost, roomState]);

  useEffect(() => {
    if (!isHost) return;
    if (!roomId) return;

    const strokesRef = ref(db, `rooms/${roomId}/telestrator/strokes`);
    return onValue(strokesRef, (snap) => {
      const v = snap.val() as unknown;
      let sig = "";
      if (!v || typeof v !== "object") {
        sig = "";
      } else {
        const obj = v as Record<string, unknown>;
        const ids = Object.keys(obj).sort();
        const parts: string[] = [];
        for (const id of ids) {
          const raw = obj[id] as unknown;
          if (!raw || typeof raw !== "object") {
            parts.push(id);
            continue;
          }
          const s = raw as Record<string, unknown>;
          const angleId = typeof s.angleId === "string" ? s.angleId : "";
          const pts = Array.isArray(s.points) ? s.points.length : 0;
          parts.push([id, angleId, String(pts)].join("|"));
        }
        sig = parts.join("~");
      }

      if (!dirtyStrokeInitRef.current) {
        // Initialize on first read without marking dirty.
        dirtyStrokeInitRef.current = true;
        lastDirtyStrokeSigRef.current = sig;
        return;
      }
      if (sig !== lastDirtyStrokeSigRef.current) {
        setSessionDirty(true);
        lastDirtyStrokeSigRef.current = sig;
      }
    });
  }, [isHost, roomId]);

  useEffect(() => {
    if (!isHost) return;
    if (!isSyncLayoutMode(roomViewMode)) return;
    if (!roomState) return;
    const synced =
      (roomState.syncAnchorTime ?? 0) > 0 || roomState.manualSyncLocked === true;
    if (synced) {
      setIsManualSyncMode(false);
    } else if (roomState.angles.length > 1) {
      setIsManualSyncMode(true);
    }
  }, [isHost, roomState, roomViewMode]);

  useEffect(() => {
    if (!teamRoomMode || !roomState) return;
    if (!isSyncLayoutMode(roomViewMode)) {
      navigateRoomView("sync");
    }
  }, [teamRoomMode, roomState, roomViewMode, navigateRoomView]);
  const [syncSetupUi, setSyncSetupUi] = useState<{
    primaryTime: number;
    primaryDur: number;
    secondaryTime: number;
    secondaryDur: number;
    primaryPlaying: boolean;
    secondaryPlaying: boolean;
  } | null>(null);
  /** Viewer: last applied `playbackCommand.commandId` (immediate path). */
  const lastAppliedCommandIdRef = useRef(0);
  /** Viewer stacked sync: last applied mute layout (selection-only; not transport). */
  const lastAppliedViewerSelectionKeyRef = useRef("");
  const pendingPlaybackCommandRef = useRef<PlaybackCommand | null>(null);
  const viewerInitialAppliedRef = useRef(false);
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
  /** Skip redundant host heartbeat RTDB writes when playhead barely moved. */
  const lastHostHeartbeatSentRef = useRef<number | null>(null);
  /** Host multi-view: last `actionId` / `playbackCommand.commandId` used for secondary `alignSeq` dedupe. */
  const lastHostSecondaryAlignSeqRef = useRef<number | null>(null);
  /** Last host Play tap — used to avoid heartbeat / drift-seek races on Android. */
  const hostLastPlayGestureAtRef = useRef(0);
  /** Last logged YouTube `event.data` for host (avoids duplicate BUFFERING spam). */
  const hostLastYtStateCodeRef = useRef<number | null>(null);
  /** Debounced recovery when a secondary angle stalls while host transport is playing. */
  const hostSecondaryRecoveryTimerRef = useRef<Record<string, number>>({});
  /** Distinguish tap vs horizontal swipe on sync angle carousel. */
  const syncStackGestureRef = useRef({
    startX: 0,
    startY: 0,
    swiped: false,
  });

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
      if (hostNoticeTimerRef.current !== null) {
        window.clearTimeout(hostNoticeTimerRef.current);
        hostNoticeTimerRef.current = null;
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

  /** Sync multi-angle viewer: nudge every mounted angle to play (no seek; respects unlock + room isPlaying). */
  const ensureSelectedViewerStackPlayerPlaying = useCallback(async () => {
    if (isHostRef.current) return;
    if (!isSyncLayoutMode(roomViewModeRef.current)) return;
    const rs = roomStateRef.current;
    if (!rs || rs.angles.length < 2) return;
    if (!rs.isPlaying) return;
    if (!viewerPlaybackUnlockedRef.current) return;
    const topOverride = viewerLocalMainAngleIdRef.current;
    const topId =
      topOverride && rs.angles.some((a) => a.id === topOverride)
        ? topOverride
        : resolveViewerStackTopAngleId(rs);
    const activeId = rs.currentAngleId;
    const primary = syncPlayerRefs.current[activeId];
    const fb = rs.currentTime ?? 0;
    let anchor = fb;
    if (primary) {
      try {
        anchor = await readYoutubeCurrentTime(primary, fb);
      } catch {
        anchor = fb;
      }
    }
    anchor = Math.max(anchor, rs.syncAnchorTime ?? 0);

    for (const a of rs.angles) {
      const p = syncPlayerRefs.current[a.id];
      if (!p) continue;
      const expected =
        a.id === activeId
          ? anchor
          : Math.max(0, playbackTimeForAngleFromActiveAnchor(anchor, a));
      let st: number | undefined;
      let ct = expected;
      try {
        st = await readYoutubePlayerState(p);
        ct = await readYoutubeCurrentTime(p, expected);
      } catch {
        continue;
      }
      syncLog("viewer ensure playing", a.id, st);
      const needsPlay = st !== YT_PLAYING && st !== YT_BUFFERING;
      const needsSeek =
        expected >= 0 && Math.abs(ct - expected) >= 2.5;
      if (needsSeek && expected >= 0) {
        try {
          await p.seekTo?.(expected, true);
        } catch {
          /* YouTube API */
        }
      }
      if (needsPlay || needsSeek) {
        if (rs.sourceType === "live") {
          forceYouTubePlay(p, "ensureSelectedViewerStackPlayerPlaying", a.id, {
            delayedUnmute: a.id === topId,
          });
          void forceLiveBootstrapPlay(
            p,
            `ensureSelectedViewerStackPlayerPlaying:${a.id}`,
          );
        } else {
          try {
            p.playVideo?.();
          } catch {
            /* YouTube API */
          }
        }
      }
      try {
        if (a.id === topId) p.unMute?.();
        else p.mute?.();
      } catch {
        /* YouTube API */
      }
    }
  }, []);

  /**
   * Host sync watchdog: mobile Safari often pauses muted PiP/secondary iframes.
   * Re-seek and nudge play when drift or unexpected pause is detected.
   */
  const ensureHostSyncAnglesPlaying = useCallback(async () => {
    if (!isHostRef.current) return;
    if (!isSyncLayoutMode(roomViewModeRef.current)) return;
    const s = roomStateRef.current;
    if (!s?.isPlaying || s.angles.length < 2) return;
    if (isManualSyncModeRef.current) return;

    const activeAngle = pickAngle(s.angles, s.currentAngleId);
    const primary = syncPlayerRefs.current[activeAngle.id];
    if (!primary) return;

    const fb = s.currentTime ?? 0;
    let anchor: number;
    try {
      anchor = await readYoutubeCurrentTime(primary, fb);
    } catch {
      return;
    }
    anchor = Math.max(anchor, s.syncAnchorTime ?? 0);

    for (const a of s.angles) {
      const p = syncPlayerRefs.current[a.id];
      if (!p) continue;

      const expected =
        a.id === activeAngle.id
          ? anchor
          : Math.max(0, playbackTimeForAngleFromActiveAnchor(anchor, a));
      if (expected < 0) continue;

      let st: number | undefined;
      let ct = expected;
      try {
        st = await readYoutubePlayerState(p);
        ct = await readYoutubeCurrentTime(p, expected);
      } catch {
        continue;
      }

      const needsPlay =
        st === YT_PAUSED || st === YT_CUED || st === YT_UNSTARTED;
      const needsSeek = Math.abs(ct - expected) >= 2.5;
      if (!needsPlay && !needsSeek) continue;

      syncLog("host sync watchdog recover", {
        angleId: a.id,
        state: st === undefined ? "?" : youtubeStateLabel(st),
        ct,
        expected,
        needsPlay,
        needsSeek,
      });

      if (needsSeek) {
        try {
          p.seekTo?.(expected, true);
        } catch {
          /* YouTube API */
        }
      }

      if (needsPlay || needsSeek) {
        if (s.sourceType === "live") {
          forceYouTubePlay(p, "host-sync-watchdog", a.id, {
            delayedUnmute: a.id === activeAngle.id,
          });
        } else {
          try {
            p.playVideo?.();
          } catch {
            /* YouTube API */
          }
        }
      }

      if (a.id !== activeAngle.id) {
        try {
          p.mute?.();
        } catch {
          /* YouTube API */
        }
      }
    }

    try {
      primary.unMute?.();
    } catch {
      /* YouTube API */
    }
  }, []);

  useLayoutEffect(() => {
    ffModeRef.current = ffMode;
  }, [ffMode]);

  useEffect(() => {
    lastViewerSyncRateRef.current = Number.NaN;
    lastHostSecondaryAlignSeqRef.current = null;
    for (const t of Object.values(hostSecondaryRecoveryTimerRef.current)) {
      window.clearTimeout(t);
    }
    hostSecondaryRecoveryTimerRef.current = {};
  }, [roomId]);

  useEffect(() => {
    lastAppliedCommandIdRef.current = 0;
    lastAppliedViewerSelectionKeyRef.current = "";
    pendingPlaybackCommandRef.current = null;
    if (playRetryTimerRef.current) clearTimeout(playRetryTimerRef.current);
    if (pauseRetryTimerRef.current) clearTimeout(pauseRetryTimerRef.current);
    playRetryTimerRef.current = null;
    pauseRetryTimerRef.current = null;
  }, [roomState?.videoId]);

  useEffect(() => {
    youtubeEndedGuardRef.current = null;
    lastHostHeartbeatSentRef.current = null;
    hostLastYtStateCodeRef.current = null;
  }, [activeYouTubeVideoId]);

  useEffect(() => {
    viewerPlaybackUnlockedRef.current = false;
    setClipUrlDraft("");
    setViewerPlaybackUnlocked(false);
    setViewerLocalMainAngleId(null);
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
        setUiDuration(null);
        return;
      }
      const p = getPlayer();
      if (isHostRef.current || viewerPlaybackUnlockedRef.current) {
        void readYoutubeCurrentTime(p, cur.currentTime ?? 0).then((t) => {
          setUiPlaybackTime(t);
          if (cur.sourceType === "live") {
            // Live: scrub max from player duration only — not live-edge polling.
            if (p) {
              void readYoutubeDuration(p).then((d) => {
                if (typeof d === "number" && Number.isFinite(d) && d > 0.25) {
                  setUiDuration(d);
                }
              });
            }
            return;
          }
          void readLiveEdgeTime(p, t).then((edge) => {
            if (typeof edge === "number" && Number.isFinite(edge) && edge > 0.25) {
              setUiDuration(edge);
            }
          });
        });
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
      const s = roomStateRef.current;
      if (!s) return;

      if (isHostRef.current) {
        if (
          isSyncLayoutMode(roomViewModeRef.current) &&
          s.angles.length > 1 &&
          s.isPlaying
        ) {
          syncLog("host visibility/focus → reconcile sync angles");
          void ensureHostSyncAnglesPlaying();
        }
        return;
      }

      const p = getPlayer();
      if (!p) return;
      syncLog("viewer visibility/focus → reconcile");
      const cmd = s.playbackCommand;
      void (async () => {
        try {
          if (
            isSyncLayoutMode(roomViewModeRef.current) &&
            s.angles.length > 1 &&
            viewerPlaybackUnlockedRef.current
          ) {
            await ensureSelectedViewerStackPlayerPlaying();
            return;
          }

          if (
            cmd &&
            (cmd.type === "play" ||
              cmd.type === "pause" ||
              cmd.type === "seek" ||
              cmd.type === "resync") &&
            cmd.activeVideoId === s.videoId
          ) {
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
            return;
          }
          // Fallback: single apply to current snapshot (no continuous syncing).
          await viewerApplyInitialJoin(
            p,
            s,
            lastViewerSyncRateRef,
            viewerPlaybackUnlockedRef,
          );
        } catch {
          /* ignore */
        }
      })();
    };
    document.addEventListener("visibilitychange", onVisibleOrFocus);
    window.addEventListener("focus", onVisibleOrFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibleOrFocus);
      window.removeEventListener("focus", onVisibleOrFocus);
    };
  }, [roomId, ensureHostSyncAnglesPlaying, ensureSelectedViewerStackPlayerPlaying]);

  /** While playing in sync multi-angle, periodically recover stalled PiP/secondary players (common on mobile). */
  useEffect(() => {
    const s = roomStateRef.current;
    if (!s?.isPlaying || !isSyncLayoutMode(roomViewMode)) return;
    if (s.angles.length < 2) return;
    if (isManualSyncMode) return;

    const tick = () => {
      if (!roomStateRef.current?.isPlaying) return;
      if (isHostRef.current) {
        void ensureHostSyncAnglesPlaying();
      } else if (viewerPlaybackUnlockedRef.current) {
        void ensureSelectedViewerStackPlayerPlaying();
      }
    };

    tick();
    const intervalMs =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches
        ? 2000
        : 3500;
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [
    roomViewMode,
    isManualSyncMode,
    roomState?.isPlaying,
    roomState?.angles?.length,
    ensureHostSyncAnglesPlaying,
    ensureSelectedViewerStackPlayerPlaying,
  ]);

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
  /**
   * Host-only: when switching camera angles (videoId swap), remember whether the
   * host was actively playing so we can re-issue `playVideo()` shortly after the
   * new iframe is ready (avoids "stuck paused" after remount).
   */
  const pendingAngleAutoplayRef = useRef<{
    videoId: string;
    commandId: number;
    seekTime: number;
  } | null>(null);

  const showHostNotice = useCallback((message: string, ms = 5200) => {
    setHostNotice(message);
    if (hostNoticeTimerRef.current !== null) {
      window.clearTimeout(hostNoticeTimerRef.current);
    }
    hostNoticeTimerRef.current = window.setTimeout(() => {
      setHostNotice(null);
      hostNoticeTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    if (isHost && roomState && typeof roomState.actionId === "number") {
      hostActionSeqRef.current = Math.max(
        hostActionSeqRef.current,
        roomState.actionId,
      );
    }
  }, [isHost, roomState]);

  useEffect(() => {
    if (!roomRef || !isHost) return;
    if (!videoIdFromUrl && !facebookVideoKeyFromUrl && !loadSharedId) return;
    if (loadSavedId && authLoading) return;

    const vid = videoIdFromUrl ?? facebookVideoKeyFromUrl ?? "";
    const isFacebookInit = providerFromUrl === "facebook";

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

      if (loadSharedId?.trim()) {
        try {
          const result = await getSavedSessionByShareId(loadSharedId.trim());
          if (
            result.ok &&
            Array.isArray(result.data.clips) &&
            result.data.clips.length > 0
          ) {
            const activeId = seedRoomFromLessonTemplate(result.data, roomRef, {
              ...(isHost && user?.uid ? { ownerId: user.uid } : {}),
            });
            router.replace(
              `/room/${roomId}?${roomQueryForLessonTemplate(result.data, activeId).toString()}`,
            );
            return;
          }
        } catch {
          /* fall through */
        }
      }

      if (loadSavedId && user) {
        try {
          const template = await getSavedSession(user.uid, loadSavedId);
          if (
            template &&
            Array.isArray(template.clips) &&
            template.clips.length > 0
          ) {
            const activeId = seedRoomFromLessonTemplate(template, roomRef, {
              ...(isHost && user?.uid ? { ownerId: user.uid } : {}),
            });
            router.replace(
              `/room/${roomId}?${roomQueryForLessonTemplate(template, activeId).toString()}`,
            );
            return;
          }
        } catch {
          /* fall through to default room */
        }
      }

      if (!vid) return;

      let sourceType: "live" | undefined;
      if (!isFacebookInit) {
        const declaredLive = await fetchYoutubeIsLive(vid);
        if (declaredLive.ok && declaredLive.isLive) {
          sourceType = "live";
        }
      }

      const fbInit = isFacebookInit ? consumeFacebookRoomInit(roomId) : null;
      const facebookHref =
        fbInit?.href ??
        (isFacebookInit
          ? `https://www.facebook.com/watch?v=${encodeURIComponent(vid)}`
          : undefined);

      void set(roomRef, {
        ...(isHost && user?.uid ? { ownerId: user.uid } : {}),
        videoId: vid,
        clips: [
          isFacebookInit
            ? {
                videoId: vid,
                provider: "facebook",
                ...(facebookHref ? { facebookVideoUrl: facebookHref } : {}),
              }
            : { videoId: vid },
        ],
        currentClipIndex: 0,
        isPlaying: false,
        currentTime: 0,
        playbackRate: DEFAULT_PLAYBACK_RATE,
        playbackCommand: null,
        chapters: [],
        ...(isFacebookInit
          ? {
              videoProvider: "facebook" as const,
              ...(facebookHref ? { facebookVideoUrl: facebookHref } : {}),
            }
          : {}),
        ...(sourceType ? { sourceType } : {}),
        updatedAt: serverTimestamp(),
        action: "init",
        actionId: 1,
      });
    });
  }, [
    roomRef,
    isHost,
    videoIdFromUrl,
    facebookVideoKeyFromUrl,
    providerFromUrl,
    loadSavedId,
    loadSharedId,
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
      setRoomHydrated(true);
      setRoomState(parsed);
    });
    return () => unsub();
  }, [roomRef]);

  useEffect(() => {
    if (!roomId) return;
    const marksRef = ref(db, `rooms/${roomId}/marks`);
    return onValue(marksRef, (snap) => {
      const raw = snap.val() as Record<string, unknown> | null;
      if (!raw || typeof raw !== "object") {
        setGameMarks([]);
        return;
      }
      const list: RoomGameMark[] = [];
      for (const key of Object.keys(raw)) {
        const m = parseRoomGameMark(key, raw[key]);
        if (m) list.push(m);
      }
      list.sort((a, b) => b.createdAt - a.createdAt);
      setGameMarks(list);
    });
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const alertRef = ref(db, `rooms/${roomId}/coachAlerts/latest`);
    return onValue(alertRef, (snap) => {
      const parsed = parseCoachAlertLatest(snap.val());
      if (!parsed) return;

      if (!coachAlertBaselineHydratedRef.current) {
        coachAlertBaselineHydratedRef.current = true;
        lastSeenCoachAlertIdRef.current = parsed.id;
        return;
      }

      if (parsed.id === lastSeenCoachAlertIdRef.current) {
        return;
      }

      lastSeenCoachAlertIdRef.current = parsed.id;
      setCoachAlertToast(parsed);
      syncLog("coach alert received", {
        id: parsed.id,
        markId: parsed.markId,
        label: parsed.label,
        timestamp: parsed.timestamp,
        angleId: parsed.angleId ?? null,
      });
    });
  }, [roomId]);

  const applyRoomStateToPlayer = useCallback(
    async (state: RoomState, prev: RoomState | null, gen: number) => {
      const stale = () => gen !== applyRoomGenRef.current;
      if (stale()) return;

      const player =
        (roomStateRef.current?.videoProvider === "facebook"
          ? facebookPlayerRef.current
          : null) ||
        (isSyncLayoutMode(roomViewModeRef.current) &&
          state.angles.length > 1 &&
          syncPlayerRefs.current[state.currentAngleId]) ||
        (playerRef.current?.getInternalPlayer() as
          | YouTubePlayer
          | null
          | undefined);
      if (!isHost) return;

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
          await applyPlaybackIfNeeded(
            player,
            state.isPlaying,
            state.sourceType === "live" ? { liveHostKick: true } : undefined,
          );
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
    if (isHost) {
      void applyRoomStateToPlayer(roomState, prev, gen);
    }
  }, [roomState, applyRoomStateToPlayer, isHost]);

  const stackedAngleIdsKey = roomState?.angles?.map((a) => a.id).join(",") ?? "";

  useEffect(() => {
    const ids = new Set((roomState?.angles ?? []).map((a) => a.id));
    for (const k of Object.keys(syncPlayerRefs.current)) {
      if (!ids.has(k)) syncPlayerRefs.current[k] = null;
    }
  }, [stackedAngleIdsKey, roomState?.angles]);

  useEffect(() => {
    setViewerLocalMainAngleId(null);
  }, [roomState?.playerViewAngleId]);

  /* Intentionally not depending on full roomState — avoids recompute on playhead/heartbeat. */
  const viewerStackMuteLayoutKey = useMemo(
    () => viewerStackSelectionMuteKey(roomState, viewerLocalMainAngleId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selection primitives only
    [
      roomState?.playerViewAngleId,
      roomState?.selectedDisplayAngleId,
      roomState?.currentAngleId,
      roomState?.angles?.length,
      stackedAngleIdsKey,
      viewerLocalMainAngleId,
    ],
  );

  useEffect(() => {
    if (isHost) return;
    if (!isSyncLayoutMode(roomViewMode)) return;
    const layoutKey = viewerStackMuteLayoutKey;
    if (!layoutKey) return;
    const s = roomStateRef.current;
    if (!s || s.angles.length < 2) return;
    if (layoutKey === lastAppliedViewerSelectionKeyRef.current) return;
    lastAppliedViewerSelectionKeyRef.current = layoutKey;
    const top =
      viewerLocalMainAngleId &&
      s.angles.some((a) => a.id === viewerLocalMainAngleId)
        ? viewerLocalMainAngleId
        : resolveViewerStackTopAngleId(s);
    for (const a of s.angles) {
      const p = syncPlayerRefs.current[a.id];
      if (!p) continue;
      try {
        if (a.id === top) p.unMute?.();
        else p.mute?.();
      } catch {
        /* YouTube API */
      }
    }
    void ensureSelectedViewerStackPlayerPlaying();
  }, [
    isHost,
    roomViewMode,
    viewerStackMuteLayoutKey,
    viewerLocalMainAngleId,
    ensureSelectedViewerStackPlayerPlaying,
  ]);

  useEffect(() => {
    if (isHost) return;
    if (isManualSyncModeRef.current) return;
    const roomState = roomStateRef.current;
    if (!roomState) return;

    // Sync View stacked multi-angle viewer: apply command to ALL mounted angles.
    if (isSyncLayoutMode(roomViewModeRef.current) && roomState.angles.length > 1) {
      const cmd = roomState.playbackCommand;
      const cmdApply =
        !!cmd &&
        (cmd.type === "play" ||
          cmd.type === "pause" ||
          cmd.type === "seek" ||
          cmd.type === "resync") &&
        cmd.activeVideoId === roomState.videoId &&
        cmd.commandId !== lastAppliedCommandIdRef.current;

      if (!cmdApply) return;

      void (async () => {
        const anchorTime = getSafeAnchorTime(cmd.anchorVideoTime, roomState);
        const activeId = roomState.currentAngleId;

        for (const a of roomState.angles) {
          const p = syncPlayerRefs.current[a.id];
          if (!p) continue;
          try {
            await safeSetPlaybackRate(p, cmd.playbackRate);
          } catch {
            /* ignore */
          }
          const target =
            a.id === activeId
              ? Math.max(0, anchorTime)
              : Math.max(0, anchorTime + (a.offsetFromGameTime ?? 0));
          try {
            const ct = await readYoutubeCurrentTime(p, target);
            if (Math.abs(ct - target) >= VIEWER_SEEK_DEADBAND_S) {
              if (roomState.sourceType === "live") {
                syncLog("LIVE SEEK", {
                  reason: "viewer-playback-command",
                  angleId: a.id,
                  target,
                  commandId: cmd.commandId,
                });
              }
              await p.seekTo(target, true);
            }
          } catch {
            /* ignore */
          }

          try {
            const topNow = resolveViewerStackTopAngleId(
              roomStateRef.current ?? roomState,
            );
            if (a.id === topNow) p.unMute?.();
            else p.mute?.();
          } catch {
            /* ignore */
          }
        }

        // Apply play/pause intent once (no background correction).
        for (const a of roomState.angles) {
          const p = syncPlayerRefs.current[a.id];
          if (!p) continue;
          if (roomState.isPlaying) {
            await ensureViewerPlaybackIntent(p, true, viewerPlaybackUnlockedRef, {
              liveViewerKick: roomState.sourceType === "live",
            });
          } else {
            await applyPlaybackIfNeeded(p, false);
          }
        }

        await ensureSelectedViewerStackPlayerPlaying();

        lastAppliedCommandIdRef.current = cmd.commandId;
        viewerInitialAppliedRef.current = true;
      })();

      return;
    }

    const player =
      roomState.videoProvider === "facebook"
        ? facebookPlayerRef.current
        : (playerRef.current?.getInternalPlayer() as
            | YouTubePlayer
            | null
            | undefined);

    const cmd = roomState.playbackCommand;
    const cmdApply =
      !!cmd &&
      (cmd.type === "play" ||
        cmd.type === "pause" ||
        cmd.type === "seek" ||
        cmd.type === "resync") &&
      cmd.activeVideoId === roomState.videoId &&
      cmd.commandId !== lastAppliedCommandIdRef.current;

    void (async () => {
      if (cmdApply && !player) {
        pendingPlaybackCommandRef.current = cmd;
        return;
      }
      if (!player) return;

      if (cmdApply) {
        await applyViewerImmediatePlaybackCommand(
          cmd,
          roomState,
          player,
          lastViewerSyncRateRef,
          viewerPlaybackUnlockedRef,
          playRetryTimerRef,
          pauseRetryTimerRef,
          retryTargetCommandIdRef,
        );

        lastAppliedCommandIdRef.current = cmd.commandId;
        viewerInitialAppliedRef.current = true;
        return;
      }

      if (!viewerInitialAppliedRef.current) {
        await viewerApplyInitialJoin(
          player,
          roomState,
          lastViewerSyncRateRef,
          viewerPlaybackUnlockedRef,
        );
        viewerInitialAppliedRef.current = true;
      }
    })();
  }, [
    isHost,
    roomState?.playbackCommand?.commandId,
    roomViewMode,
    isManualSyncMode,
    roomId,
    ensureSelectedViewerStackPlayerPlaying,
  ]);

  // No viewer drift correction: viewers apply playback only on host playbackCommand changes.

  const getPlayer = () => {
    const s = roomStateRef.current;
    if (s?.videoProvider === "facebook") {
      return facebookPlayerRef.current ?? undefined;
    }
    if (s && isSyncLayoutMode(roomViewModeRef.current) && s.angles.length > 0) {
      const id = s.currentAngleId || s.angles[0]?.id;
      if (id) {
        const hit = syncPlayerRefs.current[id];
        if (hit) return hit;
      }
    }
    return playerRef.current?.getInternalPlayer() as
      | YouTubePlayer
      | null
      | undefined;
  };

  const handleDismissCoachAlert = useCallback(() => {
    setCoachAlertToast(null);
  }, []);

  useEffect(() => {
    if (roomState?.videoProvider !== "facebook") return;
    if (roomViewMode !== "clip") {
      setRoomViewMode("clip");
    }
  }, [roomState?.videoProvider, roomViewMode]);

  const handleJumpToMarkReplay = useCallback(
    async (mark: { timestamp: number; angleId?: string }) => {
      const seekTo = Math.max(0, mark.timestamp - 15);
      const s = roomStateRef.current;
      let player: YouTubePlayer | null | undefined;

      const aid = mark.angleId;
      if (aid && s?.angles.some((a) => a.id === aid)) {
        const hit = syncPlayerRefs.current[aid];
        if (hit) player = hit;
      }
      if (!player) {
        if (isHostRef.current) {
          player = getPlayer() ?? null;
        } else if (
          s &&
          isSyncLayoutMode(roomViewModeRef.current) &&
          s.angles.length > 1
        ) {
          const top = resolveViewerStackTopAngleId(s);
          player = syncPlayerRefs.current[top] ?? null;
        } else {
          player = playerRef.current?.getInternalPlayer() as
            | YouTubePlayer
            | null
            | undefined;
        }
      }
      if (!player) return;

      syncLog("coach jumped to mark", {
        seekTo,
        angleId: mark.angleId ?? null,
        isHost: isHostRef.current,
      });

      try {
        await player.seekTo?.(seekTo, true);
      } catch {
        try {
          player.seekTo?.(seekTo, true);
        } catch {
          /* YouTube API */
        }
      }

      if (!isHostRef.current) {
        viewerPlaybackUnlockedRef.current = true;
        setViewerPlaybackUnlocked(true);
      }

      try {
        if (isHostRef.current) {
          if (s?.sourceType === "live") {
            const angleForLog = s?.angles.find(
              (a) => syncPlayerRefs.current[a.id] === player,
            )?.id;
            forceYouTubePlay(
              player,
              "mark-jump-replay",
              angleForLog ?? undefined,
              { delayedUnmute: true },
            );
            void forceLiveBootstrapPlay(player, "mark-jump-replay");
          } else {
            player.playVideo?.();
          }
        } else {
          await ensureViewerPlaybackIntent(
            player,
            true,
            viewerPlaybackUnlockedRef,
            { liveViewerKick: s?.sourceType === "live" },
          );
        }
      } catch {
        /* YouTube API */
      }
    },
    [setViewerPlaybackUnlocked],
  );

  const handleCreateGameMark = useCallback(
    async (label: string) => {
      if (teamRoomMode) return;
      const trimmed = label.trim();
      if (!trimmed || !roomId) return;
      const s = roomStateRef.current;
      if (!s) return;
      setGameMarksBusy(true);
      try {
        let player: YouTubePlayer | null | undefined;
        if (isHostRef.current) {
          player = getPlayer() ?? null;
        } else if (
          isSyncLayoutMode(roomViewModeRef.current) &&
          s.angles.length > 1
        ) {
          const top = resolveViewerStackTopAngleId(s);
          player = syncPlayerRefs.current[top] ?? null;
        } else {
          player = playerRef.current?.getInternalPlayer() as
            | YouTubePlayer
            | null
            | undefined;
        }
        const fb = s.currentTime ?? 0;
        const syncAnchorTime = s.syncAnchorTime ?? 0;
        const fallbackClock = Math.max(fb, syncAnchorTime);
        const rawT = await readYoutubeCurrentTime(player ?? null, fallbackClock);
        const timestamp =
          s.sourceType === "live" ? rawT : Math.max(rawT, fallbackClock);

        let angleId: string | undefined;
        if (s.angles.length > 0) {
          if (isSyncLayoutMode(roomViewModeRef.current) && s.angles.length > 1) {
            angleId = isHostRef.current
              ? s.currentAngleId
              : resolveViewerStackTopAngleId(s);
          } else {
            angleId = pickAngle(s.angles, s.currentAngleId).id;
          }
        }

        const createdByRole: RoomGameMarkRole = isHostRef.current
          ? "host"
          : "viewer";
        const createdByName =
          typeof user?.displayName === "string" && user.displayName.trim() !== ""
            ? user.displayName.trim()
            : undefined;

        const createdAt = Date.now();
        const marksRoot = ref(db, `rooms/${roomId}/marks`);
        const newMarkRef = push(marksRoot);
        const markId = newMarkRef.key;
        if (!markId) return;

        const markPayload: RoomGameMark = {
          id: markId,
          label: trimmed,
          timestamp,
          createdAt,
          createdByRole,
          ...(angleId ? { angleId } : {}),
          ...(createdByName ? { createdByName } : {}),
        };

        const alertId = `alert_${markId}_${createdAt}`;
        const alertPayload: CoachAlertLatest = {
          id: alertId,
          markId,
          label: trimmed,
          timestamp,
          createdAt,
          ...(angleId ? { angleId } : {}),
          ...(createdByName ? { createdByName } : {}),
        };

        const linkedGameId = gameIdFromUrl?.trim() ?? "";
        if (linkedGameId && user?.uid) {
          const gameEvent = roomGameMarkToTimelineEvent(markPayload, {
            sourceId: angleId,
          });
          await addGameEvent(linkedGameId, {
            ...gameEvent,
            createdBy: user.uid,
          });
        }

        await set(newMarkRef, markPayload);
        await set(ref(db, `rooms/${roomId}/coachAlerts/latest`), alertPayload);

        syncLog("mark created", {
          markId,
          label: trimmed,
          timestamp,
          angleId: angleId ?? null,
          createdByRole,
          gameId: linkedGameId || null,
        });
      } catch (e) {
        window.alert(
          e instanceof Error ? e.message : "Could not save mark. Try again.",
        );
      } finally {
        setGameMarksBusy(false);
      }
    },
    [roomId, user?.displayName, user?.uid, gameIdFromUrl, teamRoomMode],
  );

  const handleGameMarkCustomPrompt = useCallback(() => {
    const raw = window.prompt("Custom mark label");
    if (raw == null) return;
    const t = raw.trim();
    if (!t) return;
    void handleCreateGameMark(t);
  }, [handleCreateGameMark]);

  /** Push room transport state to one mounted Sync View player (seek/rate/play + mute). */
  const applySyncStateToAnglePlayer = useCallback(
    (angleId: string, reason: string) => {
      const rs = roomStateRef.current;
      if (!rs || rs.angles.length === 0) return;
      if (!isSyncLayoutMode(roomViewModeRef.current)) return;

      const angle = rs.angles.find((a) => a.id === angleId);
      if (!angle) return;
      const player = syncPlayerRefs.current[angleId];
      if (!player) return;

      const isPlaying = rs.isPlaying;
      void reason;

      void (async () => {
        let anchor = Math.max(0, rs.currentTime ?? 0, rs.syncAnchorTime ?? 0);
        if (isHostRef.current && !isManualSyncModeRef.current) {
          const primary = syncPlayerRefs.current[rs.currentAngleId];
          if (primary) {
            try {
              const live = await readYoutubeCurrentTime(primary, anchor);
              anchor = Math.max(live, rs.syncAnchorTime ?? 0);
            } catch {
              /* YouTube API */
            }
          }
        }
        const target =
          angleId === rs.currentAngleId
            ? anchor
            : Math.max(0, anchor + (angle.offsetFromGameTime ?? 0));
        syncLog("sync angle ready apply", { angleId, target, isPlaying });

        const rate = rs.playbackRate ?? DEFAULT_PLAYBACK_RATE;
        try {
          await safeSetPlaybackRate(player, rate);
        } catch {
          /* YouTube API */
        }
        try {
          const ct = await readYoutubeCurrentTime(player, target);
          if (Math.abs(ct - target) < VIEWER_SEEK_DEADBAND_S) {
            syncLog("sync angle seek skip (deadband)", {
              reason,
              angleId,
              target,
              ct,
              commandId: rs.playbackCommand?.commandId ?? null,
            });
          } else {
            syncLog("sync angle seek", {
              reason,
              angleId,
              target,
              ct,
              commandId: rs.playbackCommand?.commandId ?? null,
            });
            player.seekTo?.(target, true);
          }
        } catch {
          syncLog("sync angle seek", {
            reason,
            angleId,
            target,
            commandId: rs.playbackCommand?.commandId ?? null,
          });
          try {
            player.seekTo?.(target, true);
          } catch {
            /* YouTube API */
          }
        }
        const audibleId = resolveViewerStackTopAngleId(rs);
        try {
          if (angleId === audibleId) player.unMute?.();
          else player.mute?.();
        } catch {
          /* YouTube API */
        }
        if (isHostRef.current) {
          if (isPlaying) {
            if (rs.sourceType === "live") {
              forceYouTubePlay(
                player,
                `applySyncStateToAnglePlayer:${reason}`,
                angleId,
                { delayedUnmute: angleId === audibleId },
              );
              void forceLiveBootstrapPlay(
                player,
                `applySyncStateToAnglePlayer:${reason}:${angleId}`,
              );
            } else {
              try {
                player.playVideo?.();
              } catch {
                /* YouTube API */
              }
            }
          } else {
            try {
              player.pauseVideo?.();
            } catch {
              /* YouTube API */
            }
          }
        } else {
          await ensureViewerPlaybackIntent(
            player,
            isPlaying,
            viewerPlaybackUnlockedRef,
            rs.sourceType === "live" ? { liveViewerKick: true } : undefined,
          );
        }
      })();
    },
    [],
  );

  useEffect(() => {
    if (!isHost || !roomState || roomState.angles.length < 2) {
      if (coachViewMode !== "single") setCoachViewMode("single");
    }
  }, [isHost, roomState, coachViewMode]);

  const syncSecondaryPlayersOnce = useCallback((reason: string) => {
    if (!isSyncLayoutMode(roomViewModeRef.current)) return;
    if (isManualSyncModeRef.current) return;
    if (!isHostRef.current) return;
    const s0 = roomStateRef.current;
    if (!s0?.angles?.length || s0.angles.length < 2) return;

    void (async () => {
      const s = roomStateRef.current;
      if (!s?.angles?.length || s.angles.length < 2) return;
      const activeAngle = pickAngle(s.angles, s.currentAngleId);
      const primary = syncPlayerRefs.current[activeAngle.id];
      if (!primary) return;

      const fb = s.currentTime ?? 0;
      let anchor: number;
      try {
        anchor = await readYoutubeCurrentTime(primary, fb);
      } catch {
        return;
      }
      anchor = Math.max(anchor, s.syncAnchorTime ?? 0);

      let hold: { angleId: string; countdownSec: number } | null = null;
      for (const a of s.angles) {
        if (a.id === activeAngle.id) continue;
        const raw = playbackTimeForAngleFromActiveAnchor(anchor, a);
        if (raw < 0 && !hold) hold = { angleId: a.id, countdownSec: -raw };
      }
      if (hold) {
        setMultiViewSecondaryHold((prev) => {
          if (
            prev &&
            prev.angleId === hold!.angleId &&
            Math.abs(prev.countdownSec - hold!.countdownSec) < 0.35
          ) {
            return prev;
          }
          return hold;
        });
      } else {
        setMultiViewSecondaryHold(null);
      }

      for (const a of s.angles) {
        if (a.id === activeAngle.id) continue;
        const secondary = syncPlayerRefs.current[a.id];
        if (!secondary) continue;
        const rawSecondary = playbackTimeForAngleFromActiveAnchor(anchor, a);

        let stPre: number | undefined;
        try {
          stPre = await readYoutubePlayerState(secondary);
        } catch {
          continue;
        }
        if (stPre === YT_BUFFERING || stPre === YT_UNSTARTED) {
          syncLog("multi view secondary skip (not ready)", {
            reason,
            angleId: a.id,
            state:
              stPre === undefined ? "unknown" : youtubeStateLabel(stPre),
          });
          window.setTimeout(() => syncSecondaryPlayersOnce(`${reason}-retry`), 500);
          continue;
        }

        const expected = Math.max(0, rawSecondary);
        const cmdId = s.playbackCommand?.commandId ?? null;
        if (s0.sourceType === "live") {
          try {
            const ct = await readYoutubeCurrentTime(secondary, expected);
            if (Math.abs(ct - expected) < VIEWER_SEEK_DEADBAND_S) {
              syncLog("LIVE SEEK skip (deadband)", {
                reason,
                angleId: a.id,
                target: expected,
                ct,
                commandId: cmdId,
              });
            } else {
              syncLog("LIVE SEEK", {
                reason,
                angleId: a.id,
                target: expected,
                commandId: cmdId,
              });
              secondary.seekTo?.(expected, true);
            }
          } catch {
            syncLog("LIVE SEEK", {
              reason,
              angleId: a.id,
              target: expected,
              commandId: cmdId,
            });
            try {
              secondary.seekTo?.(expected, true);
            } catch {
              /* YouTube API */
            }
          }
        } else {
          try {
            secondary.seekTo?.(expected, true);
          } catch {
            /* YouTube API */
          }
        }
        try {
          secondary.mute?.();
        } catch {
          /* YouTube API */
        }
      }

      try {
        primary.unMute?.();
      } catch {
        /* YouTube API */
      }

      for (const a of s.angles) {
        if (a.id === activeAngle.id) continue;
        const secondary = syncPlayerRefs.current[a.id];
        if (!secondary) continue;
        const rawSecondary = playbackTimeForAngleFromActiveAnchor(anchor, a);
        const stSecondary = await readYoutubePlayerState(secondary);
        if (stSecondary === YT_BUFFERING || stSecondary === YT_UNSTARTED) {
          continue;
        }
        if (rawSecondary < 0) {
          try {
            secondary.pauseVideo?.();
          } catch {
            /* YouTube API */
          }
          continue;
        }
        if (s.isPlaying) {
          if (s.sourceType === "live") {
            forceYouTubePlay(
              secondary,
              "syncSecondaryPlayersOnce:secondary",
              a.id,
              { delayedUnmute: false },
            );
          } else {
            try {
              secondary.playVideo?.();
            } catch {
              /* YouTube API */
            }
          }
        } else {
          try {
            secondary.pauseVideo?.();
          } catch {
            /* YouTube API */
          }
        }
      }
    })();
  }, []);

  /**
   * Host Multi View: after a transport write, align non-active angles to anchor + offsets.
   */
  const applyHostMultiViewSecondaryDirect = useCallback(
    (opts: {
      primaryAnchorTime: number;
      playbackRate: number;
      isPlaying: boolean;
      reason: string;
      allowWhileManualSync?: boolean;
      /** Same value as latest RTDB `actionId` / `playbackCommand.commandId` after a transport write — dedupes duplicate align calls. */
      alignSeq?: number;
    }) => {
      if (!isSyncLayoutMode(roomViewModeRef.current)) return;
      if (!opts.allowWhileManualSync && isManualSyncModeRef.current) return;
      if (!isHostRef.current) return;
      const s = roomStateRef.current;
      if (!s?.angles?.length || s.angles.length < 2) return;

      if (typeof opts.alignSeq === "number" && Number.isFinite(opts.alignSeq)) {
        if (lastHostSecondaryAlignSeqRef.current === opts.alignSeq) {
          syncLog("host secondary direct skip (duplicate alignSeq)", {
            alignSeq: opts.alignSeq,
            reason: opts.reason,
          });
          return;
        }
        lastHostSecondaryAlignSeqRef.current = opts.alignSeq;
      }

      void (async () => {
        const s2 = roomStateRef.current;
        if (!s2?.angles?.length || s2.angles.length < 2) return;
        const activeAngle = pickAngle(s2.angles, s2.currentAngleId);
        const activePl = syncPlayerRefs.current[activeAngle.id];
        if (!activePl) return;

        const anchor = Math.max(opts.primaryAnchorTime, s2.syncAnchorTime ?? 0);

        let hold: { angleId: string; countdownSec: number } | null = null;
        for (const a of s2.angles) {
          if (a.id === activeAngle.id) continue;
          const raw = playbackTimeForAngleFromActiveAnchor(anchor, a);
          if (raw < 0 && !hold) hold = { angleId: a.id, countdownSec: -raw };
        }
        if (hold) {
          setMultiViewSecondaryHold((prev) => {
            if (
              prev &&
              prev.angleId === hold!.angleId &&
              Math.abs(prev.countdownSec - hold!.countdownSec) < 0.35
            ) {
              return prev;
            }
            return hold;
          });
        } else {
          setMultiViewSecondaryHold(null);
        }

        for (const a of s2.angles) {
          if (a.id === activeAngle.id) continue;
          const player = syncPlayerRefs.current[a.id];
          if (!player) continue;
          const rawSecondary = playbackTimeForAngleFromActiveAnchor(anchor, a);

          let stPre: number | undefined;
          try {
            stPre = await readYoutubePlayerState(player);
          } catch {
            continue;
          }
          if (stPre === YT_BUFFERING || stPre === YT_UNSTARTED) {
            syncLog("multi view secondary direct skip (not ready)", {
              reason: opts.reason,
              angleId: a.id,
              state:
                stPre === undefined ? "unknown" : youtubeStateLabel(stPre),
            });
            window.setTimeout(() => {
              const sNow = roomStateRef.current;
              if (!sNow?.isPlaying && opts.isPlaying) return;
              if (isManualSyncModeRef.current) return;
              void applyHostMultiViewSecondaryDirect({
                ...opts,
                reason: `${opts.reason}-retry`,
              });
            }, 500);
            continue;
          }

          try {
            await safeSetPlaybackRate(player, opts.playbackRate);
          } catch {
            /* YouTube API */
          }

          if (rawSecondary < 0) {
            if (s2.sourceType === "live") {
              syncLog("LIVE SEEK", {
                reason: opts.reason,
                angleId: a.id,
                target: 0,
                commandId:
                  s2.playbackCommand?.commandId ??
                  (typeof opts.alignSeq === "number" ? opts.alignSeq : null),
              });
            }
            try {
              player.seekTo?.(0, true);
            } catch {
              /* YouTube API */
            }
            try {
              player.pauseVideo?.();
            } catch {
              /* YouTube API */
            }
          } else {
            const expected = Math.max(0, rawSecondary);
            const cmdId =
              s2.playbackCommand?.commandId ??
              (typeof opts.alignSeq === "number" ? opts.alignSeq : null);
            if (s2.sourceType === "live") {
              try {
                const ct = await readYoutubeCurrentTime(player, expected);
                if (Math.abs(ct - expected) < VIEWER_SEEK_DEADBAND_S) {
                  syncLog("LIVE SEEK skip (deadband)", {
                    reason: opts.reason,
                    angleId: a.id,
                    target: expected,
                    ct,
                    commandId: cmdId,
                  });
                } else {
                  syncLog("LIVE SEEK", {
                    reason: opts.reason,
                    angleId: a.id,
                    target: expected,
                    commandId: cmdId,
                  });
                  player.seekTo?.(expected, true);
                }
              } catch {
                syncLog("LIVE SEEK", {
                  reason: opts.reason,
                  angleId: a.id,
                  target: expected,
                  commandId: cmdId,
                });
                try {
                  player.seekTo?.(expected, true);
                } catch {
                  /* YouTube API */
                }
              }
            } else {
              try {
                player.seekTo?.(expected, true);
              } catch {
                /* YouTube API */
              }
            }
            const stMid = await readYoutubePlayerState(player);
            if (stMid === YT_BUFFERING || stMid === YT_UNSTARTED) continue;
            if (opts.isPlaying) {
              if (!youtubeStateImpliesPlaying(stMid)) {
                if (s2.sourceType === "live") {
                  forceYouTubePlay(
                    player,
                    `applyHostMultiViewSecondaryDirect:${opts.reason}`,
                    a.id,
                    { delayedUnmute: false },
                  );
                } else {
                  try {
                    player.playVideo?.();
                  } catch {
                    /* YouTube API */
                  }
                }
              }
            } else if (stMid !== YT_PAUSED) {
              try {
                player.pauseVideo?.();
              } catch {
                /* YouTube API */
              }
            }
          }

          try {
            player.mute?.();
          } catch {
            /* YouTube API */
          }
        }

        try {
          activePl.unMute?.();
        } catch {
          /* YouTube API */
        }

        syncLog("multi view secondary direct applied", {
          reason: opts.reason,
          primaryAnchorTime: opts.primaryAnchorTime,
          isPlaying: opts.isPlaying,
        });
      })();
    },
    [],
  );

  useEffect(() => {
    if (coachViewMode !== "multi") {
      setMultiViewSecondaryHold(null);
      setHostFocusAngleId(null);
    }
  }, [coachViewMode]);

  useEffect(() => {
    if (fullscreenAngleId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenAngleId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenAngleId]);

  const handleManualSyncCancel = useCallback(() => {
    setIsManualSyncMode(false);
  }, []);

  const handleManualSyncTheseAngles = useCallback(() => {
    if (!isHost || !isManualSyncMode) return;
    void (async () => {
      const rr = roomRefForWrite.current;
      const cur = roomStateRef.current;
      if (!rr || !cur || cur.angles.length < 2) return;
      if (coachViewModeRef.current !== "multi") {
        showHostNotice("Switch to Multi View to sync angles.");
        return;
      }

      const activeAngle = pickAngle(cur.angles, cur.currentAngleId);
      const secondaryAngle =
        cur.angles.find((a) => a.id !== activeAngle.id) ?? null;
      if (!secondaryAngle) return;
      if (secondaryAngle.id === activeAngle.id) return;

      const primary = syncPlayerRefs.current[activeAngle.id];
      const secondary = syncPlayerRefs.current[secondaryAngle.id];
      if (!primary || !secondary) return;

      const fb = cur.currentTime ?? 0;
      const activeAngleTime = await readYoutubeCurrentTime(primary, fb);
      const secondaryAngleTime = await readYoutubeCurrentTime(secondary, fb);
      if (!Number.isFinite(activeAngleTime) || !Number.isFinite(secondaryAngleTime)) return;

      const offsetFromGameTime = secondaryAngleTime - activeAngleTime;
      if (!Number.isFinite(offsetFromGameTime)) return;

      const nextAngles: VideoAngle[] = cur.angles.map((a) => {
        if (a.id === secondaryAngle.id) {
          return {
            ...a,
            offsetFromGameTime,
            autoOffsetSource: "manual" as const,
          };
        }
        return { ...a };
      });

      // Manual sync anchor is exactly where the user aligned the active angle.
      const syncAnchorTime = Math.max(0, activeAngleTime);

      // Write a paused seek at the chosen anchor (no computed start floor).
      hostActionSeqRef.current += 1;
      const commandId = hostActionSeqRef.current;
      const playbackCommand: PlaybackCommand = {
        type: "seek",
        roomId,
        activeVideoId: cur.videoId,
        issuedAt: Date.now(),
        anchorVideoTime: syncAnchorTime,
        playbackRate: cur.playbackRate ?? DEFAULT_PLAYBACK_RATE,
        commandId,
      };

      try {
        await update(rr, {
          angles: nextAngles,
          syncAnchorTime,
          currentTime: syncAnchorTime,
          isPlaying: false,
          manualSyncLocked: true,
          manualSyncAt: Date.now(),
          playbackCommand,
          action: "seek",
          actionId: commandId,
          updatedAt: serverTimestamp(),
        });
      } catch {
        showHostNotice("Manual sync failed to save. Try again.");
        return;
      }

      const linkedGameId = gameIdFromUrl?.trim() ?? "";
      if (linkedGameId) {
        try {
          await persistRoomManualSyncPairToGame(
            linkedGameId,
            activeAngle.id,
            secondaryAngle.id,
            offsetFromGameTime,
            { markReferenceSynced: true },
          );
        } catch {
          showHostNotice(
            "Angles synced in the room, but could not save to Game Review. Try again from review.",
          );
        }
      }

      // Seek once to the aligned positions and pause (should be no-ops if user already positioned).
      const primaryTarget = syncAnchorTime;
      const secondaryTarget = Math.max(0, syncAnchorTime + offsetFromGameTime);
      try {
        primary.seekTo?.(primaryTarget, true);
        primary.pauseVideo?.();
      } catch {
        /* YouTube API */
      }
      try {
        secondary.seekTo?.(secondaryTarget, true);
        secondary.pauseVideo?.();
      } catch {
        /* YouTube API */
      }

      showHostNotice(
        linkedGameId
          ? `Angles synced (offset ${offsetFromGameTime.toFixed(1)}s) — saved for review.`
          : `Angles synced (offset ${offsetFromGameTime.toFixed(1)}s).`,
      );
      setIsManualSyncMode(false);
      window.setTimeout(() => {
        const snap = roomStateRef.current;
        if (!snap) return;
        for (const a of snap.angles) {
          applySyncStateToAnglePlayer(a.id, "manual-sync-complete");
        }
      }, 280);
    })();
  }, [
    isHost,
    isManualSyncMode,
    showHostNotice,
    roomId,
    gameIdFromUrl,
    applySyncStateToAnglePlayer,
  ]);

  // Manual sync setup: expose independent per-angle controls + keep local times fresh.
  useEffect(() => {
    if (!isHost || coachViewMode !== "multi" || !isManualSyncMode) {
      setSyncSetupUi(null);
      return;
    }
    const tick = () => {
      const cur0 = roomStateRef.current;
      if (!cur0 || cur0.angles.length < 2) return;
      const activeA = pickAngle(cur0.angles, cur0.currentAngleId);
      const otherA = cur0.angles.find((x) => x.id !== activeA.id) ?? null;
      if (!otherA) return;
      const primary = syncPlayerRefs.current[activeA.id];
      const secondary = syncPlayerRefs.current[otherA.id];
      if (!primary || !secondary) return;
      const fb = roomStateRef.current?.currentTime ?? 0;
      void (async () => {
        const t0 = await readYoutubeCurrentTime(primary, fb);
        const t1 = await readYoutubeCurrentTime(secondary, fb);
        const d0 = await readYoutubeDuration(primary);
        const d1 = await readYoutubeDuration(secondary);
        const st0 = await readYoutubePlayerState(primary);
        const st1 = await readYoutubePlayerState(secondary);
        const p0 = youtubeStateImpliesPlaying(st0);
        const p1 = youtubeStateImpliesPlaying(st1);
        if (!Number.isFinite(t0) || !Number.isFinite(t1)) return;
        setSyncSetupUi({
          primaryTime: t0,
          primaryDur: Number.isFinite(d0) ? d0 : 0,
          secondaryTime: t1,
          secondaryDur: Number.isFinite(d1) ? d1 : 0,
          primaryPlaying: p0,
          secondaryPlaying: p1,
        });
      })();
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [isHost, coachViewMode, isManualSyncMode]);

  // No host drift correction: playback moves only on explicit user controls.

  const renderSyncSetupControls = useCallback(
    (opts: {
      label: string;
      which: "primary" | "secondary";
      angleId: string;
      get: () => YouTubePlayer | null | undefined;
    }) => {
      if (!isHost || !isManualSyncMode || coachViewMode !== "multi") return null;
      const ui = syncSetupUi;
      if (!ui) return null;
      const t = opts.which === "primary" ? ui.primaryTime : ui.secondaryTime;
      const d = opts.which === "primary" ? ui.primaryDur : ui.secondaryDur;
      const playing = opts.which === "primary" ? ui.primaryPlaying : ui.secondaryPlaying;
      const safeD = Number.isFinite(d) && d > 0 ? d : Math.max(0, t + 1);
      return (
        <div className="w-full border-t border-white/10 bg-black/70 px-3 py-2.5">
          <div className="mb-2 text-[11px] font-medium text-blue-200/90">
            {opts.label} Controls (independent)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-[11px] font-semibold text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.10] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              onClick={() => {
                const p = opts.get();
                if (!p) return;
                try {
                  if (playing) p.pauseVideo?.();
                  else p.playVideo?.();
                } catch {
                  /* YouTube API */
                }
              }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <span className="rounded-md border border-white/10 bg-black/60 px-2 py-1 font-mono text-[11px] tabular-nums text-zinc-200">
              {formatChapterTime(t)}
            </span>
            <input
              type="range"
              min={0}
              max={safeD}
              step={0.05}
              value={Math.max(0, Math.min(safeD, t))}
              onChange={(e) => {
                const v = Number.parseFloat(e.target.value);
                if (!Number.isFinite(v)) return;
                const p = opts.get();
                if (!p) return;
                try {
                  p.seekTo?.(Math.max(0, v), true);
                } catch {
                  /* YouTube API */
                }
              }}
              className="min-w-0 flex-1 accent-blue-500"
            />
            <span className="w-12 text-right font-mono text-[11px] tabular-nums text-zinc-400">
              {formatChapterTime(safeD)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="rounded-md border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              onClick={() => {
                const p = opts.get();
                if (!p) return;
                try {
                  p.seekTo?.(Math.max(0, t - 10), true);
                } catch {
                  /* YouTube API */
                }
              }}
              title="-10s (this angle only)"
            >
              -10s
            </button>
            <button
              type="button"
              className="rounded-md border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              onClick={() => {
                const p = opts.get();
                if (!p) return;
                try {
                  p.seekTo?.(Math.max(0, t + 10), true);
                } catch {
                  /* YouTube API */
                }
              }}
              title="+10s (this angle only)"
            >
              +10s
            </button>
            {roomState?.sourceType === "live" ? (
              <button
                type="button"
                className="rounded-md border border-rose-500/35 bg-rose-500/15 px-3 py-1.5 text-[11px] font-semibold text-rose-100 transition hover:border-rose-400/45 hover:bg-rose-500/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
                onClick={() => {
                  const p = opts.get();
                  if (!p) return;
                  void (async () => {
                    const ct = await readYoutubeCurrentTime(p, t);
                    const edge = await readLiveEdgeTime(p, ct);
                    const target = Math.max(0, edge - LIVE_SAFETY_BUFFER_SECONDS);
                    try {
                      p.seekTo?.(target, true);
                    } catch {
                      /* YouTube API */
                    }
                    await livePlayRequestedWithRetry(
                      p,
                      opts.angleId,
                      "manual-sync-tile-live",
                    );
                  })();
                }}
                title="Seek this angle to near live edge (local only)"
              >
                Live
              </button>
            ) : null}
          </div>
        </div>
      );
    },
    [coachViewMode, isHost, isManualSyncMode, roomState?.sourceType, syncSetupUi],
  );

  const handleViewerPlaybackUnlock = useCallback(() => {
    const s = roomStateRef.current;
    syncLog("viewer unlock tapped", {
      roomId,
      view: roomViewModeRef.current,
      sourceType: s?.sourceType,
      isPlaying: s?.isPlaying,
    });
    viewerPlaybackUnlockedRef.current = true;
    setViewerPlaybackUnlocked(true);

    const p = getPlayer();
    if (p) {
      try {
        p.mute?.();
      } catch {
        /* YouTube API */
      }
      const attemptPlay = (label: string) => {
        try {
          p.playVideo?.();
        } catch {
          /* autoplay / API */
        }
        syncLog("viewer sync playback started", { label });
      };
      attemptPlay("unlock:immediate");
      window.setTimeout(() => attemptPlay("unlock:250ms"), 250);
      window.setTimeout(() => attemptPlay("unlock:750ms"), 750);
      window.setTimeout(() => attemptPlay("unlock:1500ms"), 1500);
    }

    void ensureSelectedViewerStackPlayerPlaying();
    if (s) {
      lastAppliedKey.current = "";
      const gen = ++applyRoomGenRef.current;
      void applyRoomStateToPlayerRef.current(
        s,
        applyPrevSnapshotRef.current,
        gen,
      );
    }
  }, [ensureSelectedViewerStackPlayerPlaying, roomId]);

  const broadcastTelestratorStroke = useCallback(
    (row: { points: Array<{ x: number; y: number }>; angleId?: string }) => {
      if (!isHostRef.current) return;
      if (!roomId) return;
      const pts = Array.isArray(row.points) ? row.points : [];
      syncLog("draw stroke broadcast", {
        roomId,
        angleId: row.angleId ?? null,
        points: pts.length,
      });
      void push(ref(db, `rooms/${roomId}/telestrator/strokes`), {
        ...row,
        createdAt: serverTimestamp(),
      });
    },
    [roomId],
  );

  useEffect(() => {
    if (!roomId) return;
    if (isHost) return;
    const strokesRef = ref(db, `rooms/${roomId}/telestrator/strokes`);
    return onValue(strokesRef, (snap) => {
      const v = snap.val() as unknown;
      const count =
        v && typeof v === "object" ? Object.keys(v as Record<string, unknown>).length : 0;
      if (lastViewerStrokeCountRef.current === count) return;
      lastViewerStrokeCountRef.current = count;
      syncLog("draw stroke received", { roomId, count });
    });
  }, [isHost, roomId]);

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
      const restored = playbackRateBeforeFfRef.current;
      writeHostTransport({ playbackRate: restored }, "rate");
      const alignSeq = hostActionSeqRef.current;
      setFfMode(0);
      void (async () => {
        const cur = roomStateRef.current;
        if (!cur || cur.angles.length < 2) return;
        const p = getPlayer();
        const t = await readYoutubeCurrentTime(p, cur.currentTime ?? 0);
        applyHostMultiViewSecondaryDirect({
          primaryAnchorTime: t,
          isPlaying: cur.isPlaying,
          playbackRate: restored,
          reason: "ff-off",
          alignSeq,
        });
      })();
      return;
    }
    writeHostTransport({ playbackRate: FF_NATIVE_CAP }, "rate");
    const alignSeq = hostActionSeqRef.current;
    setFfMode(next);
    void (async () => {
      const cur = roomStateRef.current;
      if (!cur || cur.angles.length < 2) return;
      const p = getPlayer();
      const t = await readYoutubeCurrentTime(p, cur.currentTime ?? 0);
      applyHostMultiViewSecondaryDirect({
        primaryAnchorTime: t,
        isPlaying: cur.isPlaying,
        playbackRate: FF_NATIVE_CAP,
        reason: "ff-tier",
        alignSeq,
      });
    })();
  }, [isHost, writeHostTransport, applyHostMultiViewSecondaryDirect]);

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
        if (cur.sourceType === "live") {
          const edge = await readLiveEdgeTime(player, t);
          newT = Math.min(
            newT,
            Math.max(0, edge - LIVE_EDGE_CLAMP_PAD_S),
          );
        }
        if (cur.sourceType === "live") {
          syncLog("LIVE SEEK", {
            reason: "ff-sim-primary",
            angleId: cur.currentAngleId,
            target: newT,
            commandId: null,
          });
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
        const alignSeq = hostActionSeqRef.current;
        applyHostMultiViewSecondaryDirect({
          primaryAnchorTime: newT,
          isPlaying: true,
          playbackRate: FF_NATIVE_CAP,
          reason: "ff-sim-tick",
          alignSeq,
        });
      })();
    }, FF_SIM_MS);
    return () => window.clearInterval(id);
  }, [
    isHost,
    ffMode,
    roomState?.isPlaying,
    writeHostTransport,
    applyHostMultiViewSecondaryDirect,
  ]);

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
      const s = roomStateRef.current;
      const safeAnchorTime =
        s !== null && isSyncLayoutMode(roomViewModeRef.current)
          ? getSafeAnchorTime(fields.currentTime, s)
          : fields.currentTime;
      hostActionSeqRef.current += 1;
      const commandId = hostActionSeqRef.current;
      const activeVideoId =
        fields.videoId ?? roomStateRef.current?.videoId ?? "";
      const playbackCommand: PlaybackCommand = {
        type: transportAction,
        roomId,
        activeVideoId,
        issuedAt: Date.now(),
        anchorVideoTime: safeAnchorTime,
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
        currentTime: safeAnchorTime,
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
  /** Fatal embed errors from the YouTube IFrame API (codes per YT.PlayerError). */
  const handlePlayerError = useCallback(
    (event: { data?: number }) => {
      const code = typeof event?.data === "number" ? event.data : -1;
      const videoId = (
        roomStateRef.current?.videoId ??
        activeYouTubeVideoId ??
        ""
      ).trim();
      console.warn("YT_EMBED_ERROR", { code, videoId });
      // 2 = bad id, 5 = HTML5 error, 100 = removed/private,
      // 101 & 150 = embedding disabled by owner, 153 = no referer.
      if ([2, 5, 100, 101, 150, 153].includes(code)) {
        setEmbedError({ code, videoId });
      }
    },
    [activeYouTubeVideoId],
  );

  const handleYoutubeStateChange = useCallback(
    (event: { data: number; target: YouTubePlayer }) => {
      // Any successful playback clears a previously surfaced embed error.
      if (event.data === YT_PLAYING || event.data === YT_BUFFERING) {
        setEmbedError((prev) => (prev ? null : prev));
      }
      if (isHostRef.current && event.data !== hostLastYtStateCodeRef.current) {
        hostLastYtStateCodeRef.current = event.data;
        syncLog("host yt player state", {
          state: youtubeStateLabel(event.data),
          code: event.data,
        });
      }
      if (event.data !== YT_ENDED) return;
      if (roomStateRef.current?.sourceType === "live") {
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

  const handleHostSyncAngleStateChange = useCallback(
    (angleId: string, event: { data: number; target: YouTubePlayer }) => {
      const s = roomStateRef.current;
      if (angleId === s?.currentAngleId) {
        handleYoutubeStateChange(event);
        return;
      }
      if (!isHostRef.current || !s?.isPlaying) return;
      if (!isSyncLayoutMode(roomViewModeRef.current) || s.angles.length < 2) {
        return;
      }
      if (isManualSyncModeRef.current) return;
      if (
        event.data !== YT_PAUSED &&
        event.data !== YT_CUED &&
        event.data !== YT_UNSTARTED
      ) {
        return;
      }
      syncLog("host secondary stalled", {
        angleId,
        state: youtubeStateLabel(event.data),
      });
      const prev = hostSecondaryRecoveryTimerRef.current[angleId];
      if (prev) window.clearTimeout(prev);
      hostSecondaryRecoveryTimerRef.current[angleId] = window.setTimeout(
        () => {
          delete hostSecondaryRecoveryTimerRef.current[angleId];
          void ensureHostSyncAnglesPlaying();
        },
        350,
      );
    },
    [handleYoutubeStateChange, ensureHostSyncAnglesPlaying],
  );

  /** Seek on current clip, or switch clip + seek (chapter jump) using the same seek / playbackCommand path. */
  const jumpToChapter = useCallback(
    (chapter: ChapterEntry) => {
      if (!isHost) return;
      if (isManualSyncModeRef.current) return;
      const rr = roomRefForWrite.current;
      if (!rr || !roomId) return;
      const cur = roomStateRef.current;
      if (!cur) return;
      const taggedAngle =
        cur.angles.find((a) => a.videoId === chapter.videoId) ?? null;
      let clipIdx = cur.clips.findIndex((c) => c.videoId === chapter.videoId);
      if (clipIdx < 0 && taggedAngle) {
        clipIdx = cur.currentClipIndex;
      }
      if (clipIdx < 0) return;

      const transportAngle = pickAngle(cur.angles, cur.currentAngleId);
      const seekTime = chapterSeekTimeOnAngle(
        chapter,
        cur.angles,
        transportAngle,
      );
      if (seekTime < 0) {
        showHostNotice(
          `This angle had not started yet for this marker (${transportAngle.name}).`,
        );
        return;
      }
      const pr = clearFfIfActive();
      const sameClip = clipIdx === cur.currentClipIndex;

      if (sameClip) {
        writeImmediatePlaybackCommand("seek", {
          currentTime: seekTime,
          isPlaying: cur.isPlaying,
          playbackRate: pr,
        });
        applyHostMultiViewSecondaryDirect({
          primaryAnchorTime: seekTime,
          isPlaying: cur.isPlaying,
          playbackRate: pr,
          reason: "chapter-jump",
          alignSeq: hostActionSeqRef.current,
        });
        return;
      }

      const targetClip = cur.clips[clipIdx]!;
      const crossSeek = chapterSeekTimeOnAngle(
        chapter,
        cur.angles,
        pickAngle(cur.angles, cur.currentAngleId),
      );
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
        ...facebookFieldsForClip(targetClip),
      })
        .then(() => {
          window.setTimeout(() => syncSecondaryPlayersOnce("chapter-jump"), 140);
        })
        .catch(() => {
          /* RTDB */
        });
    },
    [
      isHost,
      roomId,
      clearFfIfActive,
      writeImmediatePlaybackCommand,
      showHostNotice,
      syncSecondaryPlayersOnce,
      applyHostMultiViewSecondaryDirect,
    ],
  );

  const handleAddChapter = useCallback(() => {
    if (teamRoomMode) return;
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
      const canonicalClipId =
        cur.clips[cur.currentClipIndex]?.videoId ?? cur.videoId;
      const next: ChapterEntry[] = [
        ...cur.chapters,
        {
          time: t,
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
  }, [isHost, teamRoomMode]);

  const handleMarkPlay = useCallback(() => {
    if (teamRoomMode) return;
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
      const canonicalClipId =
        cur.clips[cur.currentClipIndex]?.videoId ?? cur.videoId;
      const next: ChapterEntry[] = [
        ...cur.chapters,
        {
          time: t,
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
  }, [isHost, teamRoomMode]);

  const handleDeleteChapter = useCallback((index: number) => {
    if (teamRoomMode) return;
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
  }, [isHost, teamRoomMode]);

  const handleRenameChapter = useCallback((index: number) => {
    if (teamRoomMode) return;
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
  }, [isHost, teamRoomMode]);

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
    if (cur && cur.sourceType === "live") {
      window.alert(
        "Live sync rooms use camera angles only. Add angles instead of clips.",
      );
      return;
    }
    if (cur && cur.angles.length > 1) {
      window.alert(
        "Remove extra camera angles before adding another clip to the queue.",
      );
      return;
    }
    const draft = clipUrlDraft.trim();
    if (!draft) return;
    setClipUrlDraft("");

    void (async () => {
      const resolved = await resolveVideoFromPaste(draft);
      if (!resolved.ok) {
        window.alert(resolved.error);
        return;
      }

      const latest = roomStateRef.current;
      if (!latest) return;
      if (latest.sourceType === "live") return;

      if (
        latest.videoProvider === "facebook" &&
        resolved.provider !== "facebook"
      ) {
        window.alert(
          "This room uses Facebook videos. Paste another Facebook link, or start a new YouTube room for YouTube clips.",
        );
        return;
      }
      if (
        latest.videoProvider !== "facebook" &&
        resolved.provider === "facebook"
      ) {
        window.alert(
          "Facebook clips can only be added in a Facebook teaching room. Start a new room from the home page with a Facebook link.",
        );
        return;
      }

      let label: string | undefined;
      if (resolved.provider === "youtube") {
        const id = resolved.videoId;
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
          if (res.ok) {
            const t =
              typeof data.title === "string" ? data.title.trim() : "";
            if (t) label = t;
          }
        } catch {
          /* title optional */
        }

        const firstVid = latest.clips[0]?.videoId ?? latest.videoId;
        const base = await fetchYoutubeIsLive(firstVid);
        if (!base.ok) {
          window.alert(base.reason);
          return;
        }
        const incoming = await fetchYoutubeIsLive(id);
        if (!incoming.ok) {
          window.alert(incoming.reason);
          return;
        }
        if (latest.sourceType !== "live" && incoming.isLive) {
          window.alert(LIVE_VIA_STREAM_ROOM_MSG);
          return;
        }
        if (base.isLive !== incoming.isLive) {
          window.alert(MIXED_LIVE_ARCHIVE_MSG);
          return;
        }

        const newClip =
          label && label.length > 0 ? { videoId: id, label } : { videoId: id };
        const next = [...latest.clips, newClip];
        void update(rr, {
          clips: next,
          updatedAt: serverTimestamp(),
        }).catch(() => {
          /* RTDB */
        });
        return;
      }

      const fb = resolved.ref;
      const newClip = {
        videoId: fb.videoKey,
        provider: "facebook" as const,
        facebookVideoUrl: fb.href,
      };
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
        syncLog("draw clear broadcast", { scope: "all", reason: "clip-removed" });
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
      syncLog("draw clear broadcast", { scope: "all", reason: "clip-switched" });
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
          ...facebookFieldsForClip(clip),
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
      "Offset vs active playback in seconds (default 0)",
      "0",
    );
    const off = Number.parseFloat(typeof rawOff === "string" ? rawOff : "0");
    const offsetFromGameTime = Number.isFinite(off) ? off : 0;
    const newId = `a_${Date.now().toString(36)}`;
    void (async () => {
      const incoming = await fetchYoutubeIsLive(id);
      if (!incoming.ok) {
        window.alert(incoming.reason);
        return;
      }
      if (cur.sourceType !== "live" && incoming.isLive) {
        window.alert(LIVE_VIA_STREAM_ROOM_MSG);
        return;
      }
      const existing = await inferRoomLiveFromAngles(cur);
      if (!existing.ok) {
        window.alert(existing.reason);
        return;
      }
      if (cur.sourceType !== "live") {
        if (existing.isLive && !incoming.isLive) {
          window.alert(MIXED_LIVE_ARCHIVE_MSG);
          return;
        }
        if (existing.isLive !== incoming.isLive) {
          window.alert(MIXED_LIVE_ARCHIVE_MSG);
          return;
        }
      }
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
    })();
  }, [isHost]);

  const handleSetPlayerViewAngleId = useCallback(
    (angleId: string) => {
      if (!isHost || !roomId) return;
      const rr = roomRefForWrite.current;
      const cur = roomStateRef.current;
      if (!rr || !cur || cur.angles.length < 2) return;
      if (!cur.angles.some((a) => a.id === angleId)) return;
      void update(rr, {
        playerViewAngleId: angleId,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* RTDB */
      });
    },
    [isHost, roomId],
  );

  /** Single-view stack: one full-screen angle; others hidden but still mounted for sync. */
  const applySyncStackMainAngle = useCallback(
    (angleId: string) => {
      const cur = roomStateRef.current;
      if (!cur || !cur.angles.some((a) => a.id === angleId)) return;

      if (isHostRef.current) {
        if (coachViewModeRef.current !== "single") return;
        handleSetPlayerViewAngleId(angleId);
        return;
      }

      if (!viewerPlaybackUnlockedRef.current) return;
      setViewerLocalMainAngleId(angleId);
      for (const a of cur.angles) {
        const p = syncPlayerRefs.current[a.id];
        if (!p) continue;
        try {
          if (a.id === angleId) p.unMute?.();
          else p.mute?.();
        } catch {
          /* YouTube API */
        }
      }
      void ensureSelectedViewerStackPlayerPlaying();
    },
    [handleSetPlayerViewAngleId, ensureSelectedViewerStackPlayerPlaying],
  );

  const handleSyncStackAngleCycle = useCallback(
    (delta: 1 | -1, currentMainId: string) => {
      const cur = roomStateRef.current;
      if (!cur || cur.angles.length < 2) return;
      if (isManualSyncModeRef.current) return;
      if (telDrawOn) return;
      const idx = Math.max(0, cur.angles.findIndex((a) => a.id === currentMainId));
      const nextIdx = (idx + delta + cur.angles.length) % cur.angles.length;
      applySyncStackMainAngle(cur.angles[nextIdx]!.id);
    },
    [applySyncStackMainAngle, telDrawOn],
  );

  const handleSyncStackTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0];
      if (!t) return;
      syncStackGestureRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        swiped: false,
      };
    },
    [],
  );

  const handleSyncStackTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>, currentMainId: string) => {
      if (telDrawOn) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - syncStackGestureRef.current.startX;
      const dy = t.clientY - syncStackGestureRef.current.startY;
      if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        syncStackGestureRef.current.swiped = true;
        handleSyncStackAngleCycle(dx < 0 ? 1 : -1, currentMainId);
      }
    },
    [handleSyncStackAngleCycle, telDrawOn],
  );

  const handleSyncStackTapCycle = useCallback(
    (currentMainId: string) => {
      if (syncStackGestureRef.current.swiped) {
        syncStackGestureRef.current.swiped = false;
        return;
      }
      handleSyncStackAngleCycle(1, currentMainId);
    },
    [handleSyncStackAngleCycle],
  );

  const handleSelectAngle = useCallback(
    (angleId: string) => {
      if (!isHost || !roomId) return;
      if (isManualSyncModeRef.current) return;
      const cur = roomStateRef.current;
      if (!cur || angleId === cur.currentAngleId) return;
      const nextAngle = cur.angles.find((a) => a.id === angleId);
      if (!nextAngle) return;

      // Sync View (stacked multi-angle): do not reload iframes or swap video ids.
      if (isSyncLayoutMode(roomViewModeRef.current) && cur.angles.length > 1) {
        const rr = roomRefForWrite.current;
        if (!rr) return;
        void update(rr, {
          currentAngleId: angleId,
          selectedDisplayAngleId: angleId,
          updatedAt: serverTimestamp(),
        }).catch(() => {
          /* RTDB */
        });
        return;
      }

      void (async () => {
        const scheduleMultiViewSecondary = () =>
          window.setTimeout(() => syncSecondaryPlayersOnce("angle-switch"), 420);
        const player = getPlayer();
        const st = await readYoutubePlayerState(player);
        const wasPlaying = youtubeStateImpliesPlaying(st);
        const pr = clearFfIfActive();
        const syncAnchorTime = cur.syncAnchorTime ?? 0;
        const anchorTime = Math.max(cur.currentTime ?? 0, syncAnchorTime);
        const rawNext = playbackTimeForAngleFromActiveAnchor(anchorTime, nextAngle);
        const lp = player as YouTubePlayer & {
          loadVideoById?: (args: { videoId: string; startSeconds?: number }) => void;
          cueVideoById?: (args: { videoId: string; startSeconds?: number }) => void;
        };

        if (rawNext < 0) {
          pendingAngleAutoplayRef.current = null;
          lastAppliedKey.current = "";
          showHostNotice(
            `${nextAngle.name} has not started yet. Starts in ${formatCountdownMmSs(-rawNext)} on the active feed.`,
          );
          syncLog("angle switch pre-start", {
            nextAngleId: nextAngle.id,
            nextVideoId: nextAngle.videoId,
            rawNext,
            wasPlaying,
          });
          writeImmediatePlaybackCommand("resync", {
            currentTime: 0,
            isPlaying: false,
            playbackRate: pr,
            videoId: nextAngle.videoId,
            currentAngleId: nextAngle.id,
          });

          if (typeof lp?.loadVideoById === "function") {
            try {
              lp.loadVideoById({
                videoId: nextAngle.videoId,
                startSeconds: 0,
              });
            } catch {
              syncLog("angle switch pre-start loadVideoById failed", {
                videoId: nextAngle.videoId,
              });
            }
            if (roomStateRef.current?.sourceType === "live") {
              void forceLiveBootstrapPlay(
                lp,
                `angle-switch:prestart:loadVideoById:${nextAngle.id}`,
              );
            }
            window.setTimeout(() => {
              const p2 = getPlayer();
              if (!p2) return;
              try {
                p2.pauseVideo?.();
              } catch {
                /* YouTube API */
              }
              scheduleMultiViewSecondary();
            }, 160);
            return;
          }

          if (typeof lp?.cueVideoById === "function") {
            try {
              lp.cueVideoById({
                videoId: nextAngle.videoId,
                startSeconds: 0,
              });
            } catch {
              syncLog("angle switch pre-start cueVideoById failed", {
                videoId: nextAngle.videoId,
              });
            }
            if (roomStateRef.current?.sourceType === "live") {
              void forceLiveBootstrapPlay(
                lp,
                `angle-switch:prestart:cueVideoById:${nextAngle.id}`,
              );
            }
            scheduleMultiViewSecondary();
            return;
          }

          syncLog("angle switch pre-start fallback used", {
            reason: "load/cue video methods unavailable",
          });
          scheduleMultiViewSecondary();
          return;
        }

        const seekTime = Math.max(0, rawNext);
        lastAppliedKey.current = "";
        const nextCommandId = hostActionSeqRef.current + 1;
        pendingAngleAutoplayRef.current = wasPlaying
          ? {
              videoId: nextAngle.videoId,
              commandId: nextCommandId,
              seekTime,
            }
          : null;
        syncLog("angle switch command", {
          nextAngleId: nextAngle.id,
          nextVideoId: nextAngle.videoId,
          seekTime,
          wasPlaying,
        });
        writeImmediatePlaybackCommand("resync", {
          currentTime: seekTime,
          isPlaying: wasPlaying,
          playbackRate: pr,
          videoId: nextAngle.videoId,
          currentAngleId: nextAngle.id,
        });

        if (wasPlaying && typeof lp?.loadVideoById === "function") {
          syncLog("angle switch loadVideoById used", {
            videoId: nextAngle.videoId,
            startSeconds: seekTime,
          });
          try {
            lp.loadVideoById({
              videoId: nextAngle.videoId,
              startSeconds: seekTime,
            });
          } catch {
            syncLog("angle switch loadVideoById failed → fallback", {
              videoId: nextAngle.videoId,
            });
          }
          if (roomStateRef.current?.sourceType === "live") {
            void forceLiveBootstrapPlay(
              lp,
              `angle-switch:loadVideoById:${nextAngle.id}`,
            );
          }

          window.setTimeout(() => {
            const p2 = getPlayer();
            if (!p2) return;
            const angleSwitchLive =
              roomStateRef.current?.sourceType === "live";
            void (async () => {
              if (angleSwitchLive) {
                forceYouTubePlay(p2, "angle-switch-post-load", nextAngle.id, {
                  delayedUnmute: true,
                });
              } else {
                try {
                  p2.playVideo();
                } catch {
                  /* YouTube API */
                }
              }
              window.setTimeout(() => {
                const p3 = getPlayer();
                if (!p3) return;
                void (async () => {
                  const st3 = await readYoutubePlayerState(p3);
                  syncLog("angle switch play retry state", { state: st3 });
                  if (youtubeStateImpliesPlaying(st3)) return;
                  if (angleSwitchLive) {
                    forceYouTubePlay(p3, "angle-switch-play-retry", nextAngle.id, {
                      delayedUnmute: true,
                    });
                  } else {
                    try {
                      p3.playVideo();
                    } catch {
                      /* YouTube API */
                    }
                  }
                })();
              }, 300);
            })();
          }, 120);
          scheduleMultiViewSecondary();
          return;
        }

        if (!wasPlaying && typeof lp?.cueVideoById === "function") {
          syncLog("angle switch cueVideoById used (paused)", {
            videoId: nextAngle.videoId,
            startSeconds: seekTime,
          });
          try {
            lp.cueVideoById({
              videoId: nextAngle.videoId,
              startSeconds: seekTime,
            });
          } catch {
            syncLog("angle switch cueVideoById failed → fallback", {
              videoId: nextAngle.videoId,
            });
          }
          if (roomStateRef.current?.sourceType === "live") {
            void forceLiveBootstrapPlay(
              lp,
              `angle-switch:cueVideoById:${nextAngle.id}`,
            );
          }
          scheduleMultiViewSecondary();
          return;
        }

        if (typeof lp?.loadVideoById !== "function") {
          syncLog("angle switch fallback used", {
            reason: "load/cue video methods unavailable",
          });
        }
        scheduleMultiViewSecondary();
      })();
    },
    [
      isHost,
      roomId,
      clearFfIfActive,
      writeImmediatePlaybackCommand,
      showHostNotice,
      syncSecondaryPlayersOnce,
    ],
  );

  // ---- Director Track / User Cut glue (Phase 3A) -------------------------
  // Reads current playback time using the same player-resolution as marks.
  const getCutGameTime = useCallback(async () => {
    const s = roomStateRef.current;
    if (!s) return 0;
    let player: YouTubePlayer | null | undefined;
    if (isHostRef.current) {
      player = getPlayer() ?? null;
    } else if (isSyncLayoutMode(roomViewModeRef.current) && s.angles.length > 1) {
      const top = resolveViewerStackTopAngleId(s);
      player = syncPlayerRefs.current[top] ?? null;
    } else {
      player = playerRef.current?.getInternalPlayer() as
        | YouTubePlayer
        | null
        | undefined;
    }
    const fallbackClock = Math.max(s.currentTime ?? 0, s.syncAnchorTime ?? 0);
    const rawT = await readYoutubeCurrentTime(player ?? null, fallbackClock);
    return s.sourceType === "live" ? rawT : Math.max(rawT, fallbackClock);
  }, []);

  // ---- Shared highlight-reel playback (host-driven) ----------------------
  const [reelMoments, setReelMoments] = useState<HighlightMoment[]>([]);
  const [reelName, setReelName] = useState<string | null>(null);

  useEffect(() => {
    const gid = gameIdFromUrl?.trim();
    const rid = reelIdFromUrl?.trim();
    if (!gid || !rid) {
      setReelMoments([]);
      setReelName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const track = await getDirectorTrack(gid, rid);
        if (cancelled || !track) return;
        const meta = parseHighlightDraftMeta(track);
        setReelMoments(meta?.moments ?? []);
        setReelName(track.name ?? null);
      } catch {
        /* reel not found / permission — leave empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameIdFromUrl, reelIdFromUrl]);

  const reelSteps = useMemo<ReelStep[]>(() => {
    if (reelMoments.length === 0) return [];
    const offsets: Record<string, number> = {};
    for (const a of roomState?.angles ?? []) {
      offsets[a.id] = a.offsetFromGameTime ?? 0;
    }
    return buildReelSteps(reelMoments, offsets);
  }, [reelMoments, roomState?.angles]);

  const reelLabelForSource = useCallback(
    (sourceId: string) =>
      roomStateRef.current?.angles.find((a) => a.id === sourceId)?.name,
    [],
  );

  /** Switch shown angle + seek + set rate + play for one reel step (host). */
  const applyReelStep = useCallback(
    (step: ReelStep) => {
      if (!isHostRef.current || isManualSyncModeRef.current) return;
      const cur = roomStateRef.current;
      if (!cur) return;
      const target = Math.max(0, step.sourceStartTime);
      const angleExists = cur.angles.some((a) => a.id === step.sourceId);
      const angleChanged = angleExists && cur.currentAngleId !== step.sourceId;

      const seekNow = () => {
        clearFfIfActive();
        writeImmediatePlaybackCommand("seek", {
          currentTime: target,
          isPlaying: true,
          playbackRate: step.speed,
        });
        applyHostMultiViewSecondaryDirect({
          primaryAnchorTime: target,
          isPlaying: true,
          playbackRate: step.speed,
          reason: "reel-step",
          alignSeq: hostActionSeqRef.current,
        });
      };

      if (angleChanged) {
        handleSelectAngle(step.sourceId);
        // Let the angle write propagate before seeking the (new) active angle.
        window.setTimeout(seekNow, 140);
      } else {
        seekNow();
      }
    },
    [
      writeImmediatePlaybackCommand,
      applyHostMultiViewSecondaryDirect,
      handleSelectAngle,
      clearFfIfActive,
    ],
  );

  const stopReelPlayback = useCallback(() => {
    if (!isHostRef.current) return;
    void (async () => {
      const t = await getCutGameTime();
      writeImmediatePlaybackCommand("pause", {
        currentTime: Math.max(0, t),
        isPlaying: false,
        playbackRate: 1,
      });
    })();
  }, [writeImmediatePlaybackCommand, getCutGameTime]);

  // Snapshot of the current viewing state for the cut recorder.
  const getCutSnapshot = useCallback(async () => {
    const s = roomStateRef.current;
    const t = await getCutGameTime();
    return {
      t,
      layout: coachViewModeRef.current,
      ...(s?.currentAngleId ? { activeSource: s.currentAngleId } : {}),
      ...(s?.playerViewAngleId ? { playerView: s.playerViewAngleId } : {}),
    };
  }, [getCutGameTime]);

  // Apply callbacks for cut playback. These reuse existing setters and
  // self-guard (host-only angle writes are no-ops for viewers).
  const cutApplyLayout = useCallback((layout: string) => {
    setCoachViewMode(layout === "multi" ? "multi" : "single");
  }, []);
  const cutApplyActiveSource = useCallback(
    (sourceId: string) => {
      void handleSelectAngle(sourceId);
    },
    [handleSelectAngle],
  );
  const cutApplyPlayerView = useCallback(
    (sourceId: string) => {
      handleSetPlayerViewAngleId(sourceId);
    },
    [handleSetPlayerViewAngleId],
  );

  const hostLoadVideoAndPlay = useCallback(
    (
      videoId: string,
      startSeconds: number,
      logPrefix: string,
      opts?: { liveHostKick?: boolean },
    ) => {
      const lp = getPlayer() as YouTubePlayer & {
        loadVideoById?: (args: { videoId: string; startSeconds?: number }) => void;
      };
      if (typeof lp?.loadVideoById === "function") {
        syncLog(`${logPrefix} loadVideoById used`, {
          videoId,
          startSeconds,
        });
        try {
          lp.loadVideoById({ videoId, startSeconds });
        } catch {
          syncLog(`${logPrefix} loadVideoById failed → fallback`, { videoId });
        }
        if (opts?.liveHostKick) {
          void forceLiveBootstrapPlay(
            lp,
            `${logPrefix}:loadVideoById`,
          );
        }
      } else {
        syncLog(`${logPrefix} fallback used`, {
          reason: "loadVideoById unavailable",
        });
      }

      window.setTimeout(() => {
        const p2 = getPlayer();
        if (!p2) return;
        if (opts?.liveHostKick) {
          forceYouTubePlay(p2, `${logPrefix} post-load`, undefined, {
            delayedUnmute: true,
          });
          return;
        }
        void (async () => {
          try {
            p2.playVideo();
          } catch {
            /* YouTube API */
          }
          window.setTimeout(() => {
            const p3 = getPlayer();
            if (!p3) return;
            void (async () => {
              const st3 = await readYoutubePlayerState(p3);
              syncLog(`${logPrefix} play retry state`, { state: st3 });
              if (youtubeStateImpliesPlaying(st3)) return;
              try {
                p3.playVideo();
              } catch {
                /* YouTube API */
              }
            })();
          }, 300);
        })();
      }, 120);
    },
    [],
  );

  const handleGoLive = useCallback(() => {
    if (!isHost || !roomId) return;
    const cur = roomStateRef.current;
    if (!cur || cur.sourceType !== "live") return;
    if (roomViewModeRef.current !== "sync") return;
    void (async () => {
      const pr = clearFfIfActive();
      const ids = cur.angles.map((a) => a.id);
      const primaryId =
        (cur.playerViewAngleId && ids.includes(cur.playerViewAngleId)
          ? cur.playerViewAngleId
          : null) ??
        (ids.includes(cur.currentAngleId) ? cur.currentAngleId : null) ??
        cur.angles[0]!.id;
      const primaryPl = syncPlayerRefs.current[primaryId];
      const manualSynced =
        cur.manualSyncLocked === true || (cur.syncAnchorTime ?? 0) > 0;

      syncLog("go live clicked", {
        manualSynced,
        playerViewAngleId: cur.playerViewAngleId ?? "",
        primaryId,
      });

      if (!manualSynced) {
        /* Unsynced live: each angle jumps to its own near-live edge only — no offsets, no RTDB. */
        for (const a of cur.angles) {
          const pl = syncPlayerRefs.current[a.id];
          if (!pl) continue;
          const edge = await getLiveEdgeSeconds(pl);
          const t = Math.max(0, edge - LIVE_SAFETY_BUFFER_SECONDS);
          syncLog("go live seek angle (per-edge)", {
            angleId: a.id,
            target: t,
            liveEdge: edge,
          });
          syncLog("LIVE SEEK", {
            reason: "go-live-unsynced",
            angleId: a.id,
            target: t,
            commandId: null,
          });
          try {
            pl.seekTo?.(t, true);
          } catch {
            /* YouTube API */
          }
        }
        for (const a of cur.angles) {
          const pl = syncPlayerRefs.current[a.id];
          if (!pl) continue;
          await livePlayRequestedWithRetry(pl, a.id, "go-live-unsynced");
        }
        return;
      }

      /* Manually synced live: one shared anchor from the game-clock angle + offsets, one RTDB play command. */
      if (!primaryPl) return;
      const primaryLiveEdge = await getLiveEdgeSeconds(primaryPl);
      const targetPrimary = Math.max(
        0,
        primaryLiveEdge - LIVE_SAFETY_BUFFER_SECONDS,
      );

      for (const a of cur.angles) {
        const pl = syncPlayerRefs.current[a.id];
        const edge = await getLiveEdgeSeconds(pl);
        const cap = Math.max(0, edge - LIVE_SAFETY_BUFFER_SECONDS);
        const raw = playbackTimeForAngleFromActiveAnchor(targetPrimary, a);
        const t = Math.max(0, Math.min(raw, cap));
        syncLog("go live seek angle (manual-sync offsets)", {
          angleId: a.id,
          target: t,
          liveEdge: edge,
          offsetFromGameTime: a.offsetFromGameTime ?? 0,
        });
        if (!pl) continue;
        syncLog("LIVE SEEK", {
          reason: "go-live-manual-sync",
          angleId: a.id,
          target: t,
          commandId: null,
        });
        try {
          pl.seekTo?.(t, true);
        } catch {
          /* YouTube API */
        }
      }

      for (const a of cur.angles) {
        const pl = syncPlayerRefs.current[a.id];
        if (!pl) continue;
        await livePlayRequestedWithRetry(pl, a.id, "go-live-manual-sync");
      }

      lastAppliedKey.current = "";
      writeImmediatePlaybackCommand("play", {
        isPlaying: true,
        currentTime: targetPrimary,
        playbackRate: pr,
      });
    })();
  }, [isHost, roomId, clearFfIfActive, writeImmediatePlaybackCommand]);

  const handleReconnectLive = useCallback(() => {
    if (!isHost || !roomId) return;
    const cur0 = roomStateRef.current;
    if (cur0?.sourceType === "live") {
      void (async () => {
        const cur = roomStateRef.current;
        if (!cur) return;
        for (const a of cur.angles) {
          const p = syncPlayerRefs.current[a.id];
          if (!p) continue;
          const edge = await getLiveEdgeSeconds(p);
          const cap = Math.max(0, edge - LIVE_SAFETY_BUFFER_SECONDS);
          const ct = await readYoutubeCurrentTime(p, cur.currentTime ?? 0);
          let st: number | undefined;
          try {
            st = await readYoutubePlayerState(p);
          } catch {
            st = undefined;
          }
          const needNearLive =
            ct <= 0.05 ||
            st === YT_UNSTARTED ||
            st === YT_CUED;
          const seekT = needNearLive ? cap : Math.min(ct, cap);
          syncLog("reconnect live player", {
            angleId: a.id,
            seekT,
            edge,
            ct,
            needNearLive,
            state:
              st === undefined ? undefined : youtubeStateLabel(st),
          });
          syncLog("LIVE SEEK", {
            reason: "reconnect-live",
            angleId: a.id,
            target: seekT,
            commandId: null,
          });
          try {
            p.seekTo?.(seekT, true);
          } catch {
            /* YouTube API */
          }
          await livePlayRequestedWithRetry(p, a.id, "reconnect-live");
        }
      })();
      return;
    }

    const rr = roomRefForWrite.current;
    if (!rr) return;
    const raw = window.prompt("Paste new YouTube live URL");
    if (raw === null) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const newVideoId = extractYouTubeVideoId(trimmed);
    if (!newVideoId) {
      window.alert("Invalid YouTube link or could not find a video id.");
      return;
    }
    void (async () => {
      const cur = roomStateRef.current;
      if (!cur) return;
      const idx = cur.currentClipIndex;
      const oldVideoId = cur.clips[idx]?.videoId ?? cur.videoId;
      if (newVideoId === oldVideoId) return;

      const player = getPlayer();
      const t = await readYoutubeCurrentTime(player, cur.currentTime ?? 0);

      const nextAngles: VideoAngle[] = cur.angles.map((a) =>
        a.id === cur.currentAngleId ? { ...a, videoId: newVideoId } : a,
      );
      const nextClips: ClipEntry[] = cur.clips.map((c, i) =>
        i === idx ? { ...c, videoId: newVideoId } : c,
      );
      const nextChapters: ChapterEntry[] = cur.chapters.map((ch) =>
        ch.videoId === oldVideoId ? { ...ch, videoId: newVideoId } : ch,
      );
      const startSeconds = Math.max(0, t);
      const pr = clearFfIfActive();
      lastAppliedKey.current = "";

      hostActionSeqRef.current += 1;
      const commandId = hostActionSeqRef.current;
      const playbackCommand: PlaybackCommand = {
        type: "resync",
        roomId,
        activeVideoId: newVideoId,
        issuedAt: Date.now(),
        anchorVideoTime: startSeconds,
        playbackRate: pr,
        commandId,
      };

      syncLog("reconnect live stream", {
        oldVideoId,
        newVideoId,
        startSeconds,
        currentAngleId: cur.currentAngleId,
      });

      void update(rr, {
        videoId: newVideoId,
        clips: nextClips,
        currentClipIndex: idx,
        angles: nextAngles,
        currentAngleId: cur.currentAngleId,
        chapters: nextChapters,
        currentTime: startSeconds,
        isPlaying: true,
        playbackRate: pr,
        playbackCommand,
        action: "resync",
        actionId: commandId,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* RTDB */
      });

      hostLoadVideoAndPlay(newVideoId, startSeconds, "reconnect live", {
        liveHostKick: true,
      });
    })();
  }, [isHost, roomId, clearFfIfActive, hostLoadVideoAndPlay]);

  // No post-sync nudging. Manual fine-tune controls are applied explicitly in Sync View transport.

  // No background / auto sync in archive: playback moves only on explicit user controls.

  const handlePlay = () => {
    if (!isHost) return;
    const snapGuard = roomStateRef.current;
    if (isManualSyncModeRef.current) {
      if (!teamRoomMode || !snapGuard?.manualSyncLocked) return;
    }
    hostLastPlayGestureAtRef.current = Date.now();
    const pr = clearFfIfActive();

    const snapKick = roomStateRef.current;
    const activeAngleId =
      snapKick?.currentAngleId ?? snapKick?.angles[0]?.id ?? "";
    const kickPlayers: YouTubePlayer[] = [];
    if (
      snapKick &&
      isSyncLayoutMode(roomViewModeRef.current) &&
      snapKick.angles.length > 0
    ) {
      for (const a of snapKick.angles) {
        const p = syncPlayerRefs.current[a.id];
        if (p) kickPlayers.push(p);
      }
    }
    if (kickPlayers.length === 0) {
      const p = getPlayer();
      if (p) kickPlayers.push(p);
    }
    const seenKick = new Set<YouTubePlayer>();
    for (const player of kickPlayers) {
      if (seenKick.has(player)) continue;
      seenKick.add(player);
      if (snapKick?.sourceType === "live") {
        forceYouTubePlay(player, "handlePlay-gesture-kick", activeAngleId, {
          delayedUnmute: true,
        });
        void forceLiveBootstrapPlay(
          player,
          `handlePlay-gesture-kick:${activeAngleId}`,
        );
      } else {
        try {
          player.playVideo?.();
        } catch {
          /* YouTube API */
        }
      }
    }
    syncLog("transport play clicked (gesture kick)", {
      activeAngleId,
      kickCount: seenKick.size,
    });

    void (async () => {
      const snap0 = roomStateRef.current;
      const player = getPlayer();

      syncLog("host pressed Play");
      const fb = roomStateRef.current?.currentTime ?? 0;
      const syncAnchorTime = roomStateRef.current?.syncAnchorTime ?? 0;
      const tRaw = await readYoutubeCurrentTime(player, fb);
      const t = Math.max(tRaw, syncAnchorTime);
      syncLog("host Play transport", {
        anchorTime: t,
        playbackRate: pr,
      });
      writeImmediatePlaybackCommand("play", {
        isPlaying: true,
        currentTime: t,
        playbackRate: pr,
      });
      applyHostMultiViewSecondaryDirect({
        primaryAnchorTime: t,
        isPlaying: true,
        playbackRate: pr,
        reason: "play",
        alignSeq: hostActionSeqRef.current,
      });
      const snap = roomStateRef.current;
      if (
        snap &&
        isSyncLayoutMode(roomViewModeRef.current) &&
        snap.angles.length > 0
      ) {
        for (const a of snap.angles) {
          const p = syncPlayerRefs.current[a.id];
          if (!p) continue;
          try {
            const st = await readYoutubePlayerState(p);
            if (
              st === YT_UNSTARTED ||
              st === YT_CUED ||
              st === YT_PAUSED ||
              st === YT_BUFFERING ||
              st === undefined
            ) {
              applySyncStateToAnglePlayer(
                a.id,
                "play-after-cued-or-waiting",
              );
            }
          } catch {
            /* YouTube API */
          }
        }
      }
    })();
  };

  const handlePause = () => {
    if (!isHost) return;
    if (isManualSyncModeRef.current) return;
    const pr = clearFfIfActive();
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const syncAnchorTime = roomStateRef.current?.syncAnchorTime ?? 0;
      const tRaw = await readYoutubeCurrentTime(player, fb);
      const t = Math.max(tRaw, syncAnchorTime);
      try {
        player?.pauseVideo?.();
      } catch {
        /* YouTube API */
      }
      writeImmediatePlaybackCommand("pause", {
        isPlaying: false,
        currentTime: t,
        playbackRate: pr,
      });
      applyHostMultiViewSecondaryDirect({
        primaryAnchorTime: t,
        isPlaying: false,
        playbackRate: pr,
        reason: "pause",
        alignSeq: hostActionSeqRef.current,
      });
    })();
  };

  const handleSeekBack = () => {
    if (!isHost) return;
    if (isManualSyncModeRef.current) return;
    const pr = clearFfIfActive();
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const playing = roomStateRef.current?.isPlaying ?? false;
      const syncAnchorTime = roomStateRef.current?.syncAnchorTime ?? 0;
      const back = await clampHostSeekBackwardSeconds(player, fb, 10);
      const clamped = Math.max(syncAnchorTime, back);
      try {
        player?.seekTo?.(clamped, true);
      } catch {
        /* YouTube API */
      }
      if (playing) {
        try {
          player?.playVideo?.();
        } catch {
          /* YouTube API */
        }
      }
      writeImmediatePlaybackCommand("seek", {
        isPlaying: playing,
        currentTime: clamped,
        playbackRate: pr,
      });
      applyHostMultiViewSecondaryDirect({
        primaryAnchorTime: clamped,
        isPlaying: playing,
        playbackRate: pr,
        reason: "seek-back-10",
        alignSeq: hostActionSeqRef.current,
      });
    })();
  };

  const handleSeekLiveBack30 = () => {
    if (!isHost) return;
    if (isManualSyncModeRef.current) return;
    const pr = clearFfIfActive();
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const playing = roomStateRef.current?.isPlaying ?? false;
      const syncAnchorTime = roomStateRef.current?.syncAnchorTime ?? 0;
      const back = await clampHostSeekBackwardSeconds(player, fb, 30);
      const clamped = Math.max(syncAnchorTime, back);
      try {
        player?.seekTo?.(clamped, true);
      } catch {
        /* YouTube API */
      }
      if (playing) {
        try {
          player?.playVideo?.();
        } catch {
          /* YouTube API */
        }
      }
      writeImmediatePlaybackCommand("seek", {
        isPlaying: playing,
        currentTime: clamped,
        playbackRate: pr,
      });
      applyHostMultiViewSecondaryDirect({
        primaryAnchorTime: clamped,
        isPlaying: playing,
        playbackRate: pr,
        reason: "seek-back-30",
        alignSeq: hostActionSeqRef.current,
      });
    })();
  };

  const handleJumpLiveEdge = () => {
    if (!isHost || !isLiveRoom) return;
    if (isManualSyncModeRef.current) return;
    const pr = clearFfIfActive();
    void (async () => {
      const snap = roomStateRef.current;
      const player = getPlayer();
      const fb = snap?.currentTime ?? 0;
      const playing = snap?.isPlaying ?? false;
      const edge = await readLiveEdgeTime(player, fb);
      const syncAnchorTime = snap?.syncAnchorTime ?? 0;
      const clamped = Math.max(syncAnchorTime, edge - LIVE_EDGE_CLAMP_PAD_S);
      try {
        (
          player as YouTubePlayer & {
            seekTo?: (s: number, allowSeekAhead: boolean) => void;
          }
        ).seekTo?.(clamped, true);
      } catch {
        /* YouTube API */
      }
      writeImmediatePlaybackCommand("seek", {
        isPlaying: playing,
        currentTime: clamped,
        playbackRate: pr,
      });
      applyHostMultiViewSecondaryDirect({
        primaryAnchorTime: clamped,
        isPlaying: playing,
        playbackRate: pr,
        reason: "live-edge",
        alignSeq: hostActionSeqRef.current,
      });
      if (
        snap?.sourceType === "live" &&
        isSyncLayoutMode(roomViewModeRef.current) &&
        snap.angles.length > 0
      ) {
        for (const a of snap.angles) {
          const p = syncPlayerRefs.current[a.id];
          if (!p) continue;
          await livePlayRequestedWithRetry(p, a.id, "transport-live");
        }
      } else if (snap?.sourceType === "live" && player) {
        const aid =
          snap?.currentAngleId ?? snap?.angles[0]?.id ?? "primary";
        await livePlayRequestedWithRetry(player, aid, "transport-live-clip");
      }
    })();
  };

  /** Per-angle only: near-live edge + local play. No RTDB, offsets, or other players. */
  const handleSyncAngleTileLive = useCallback((angleId: string) => {
    const cur = roomStateRef.current;
    if (!cur || cur.sourceType !== "live") return;
    if (roomViewModeRef.current !== "sync") return;
    const pl = syncPlayerRefs.current[angleId];
    if (!pl) return;
    void (async () => {
      const fb = await readYoutubeCurrentTime(pl, 0);
      const edge = await readLiveEdgeTime(pl, fb);
      const target = Math.max(0, edge - LIVE_SAFETY_BUFFER_SECONDS);
      try {
        (
          pl as YouTubePlayer & {
            seekTo?: (s: number, allowSeekAhead: boolean) => void;
          }
        ).seekTo?.(target, true);
      } catch {
        /* YouTube API */
      }
      await livePlayRequestedWithRetry(pl, angleId, "tile-live");
    })();
  }, []);

  // No "Jump to Sync Start": syncing is manual and transport is user-driven.

  const handleFocusPipSwap = useCallback(() => {
    if (!isHost || !roomId) return;
    if (isManualSyncModeRef.current) return;
    const s = roomStateRef.current;
    if (!s || s.angles.length < 2) return;
    if (coachViewModeRef.current !== "multi") return;

    const activeAngle = pickAngle(s.angles, s.currentAngleId);
    const pipAngle =
      s.angles.find((a) => a.id !== activeAngle.id) ?? s.angles[0]!;
    const primary = syncPlayerRefs.current[activeAngle.id];
    const pip = syncPlayerRefs.current[pipAngle.id];
    if (!primary || !pip) return;

    void (async () => {
      const SEEK_EPS = 1.0;
      const syncAnchorTime = s.syncAnchorTime ?? 0;
      const tActive = Math.max(s.currentTime ?? 0, syncAnchorTime);
      const swapped = hostFocusAngleIdRef.current === pipAngle.id;
      const nextActiveAngle = swapped ? activeAngle : pipAngle;
      const nextPipAngle = swapped ? pipAngle : activeAngle;

      const nextActiveT = playbackTimeForAngleFromActiveAnchor(tActive, nextActiveAngle);
      const nextPipRaw = playbackTimeForAngleFromActiveAnchor(tActive, nextPipAngle);

      const wasPlaying = s.isPlaying;
      const pr = clearFfIfActive();

      // If the would-be focused angle hasn't started, do not swap or disturb the valid stream.
      if (nextActiveT < 0) {
        showHostNotice(
          `${nextActiveAngle.name} has not started yet. Starts in ${formatCountdownMmSs(-nextActiveT)} on the active feed.`,
        );
        // Keep the existing active stream audible.
        try {
          pip.mute?.();
        } catch {
          /* YouTube API */
        }
        try {
          primary.unMute?.();
        } catch {
          /* YouTube API */
        }
        return;
      }

      const nextPipT = Math.max(0, nextPipRaw);

      const activePlayer = swapped ? primary : pip;
      const pipPlayer = swapped ? pip : primary;

      // Only seek when drift is meaningful (avoid micro-jumps).
      let activeNow = nextActiveT;
      let pipNow = nextPipT;
      try {
        activeNow = await readYoutubeCurrentTime(activePlayer, nextActiveT);
      } catch {
        /* player not ready */
      }
      try {
        pipNow = await readYoutubeCurrentTime(pipPlayer, nextPipT);
      } catch {
        /* player not ready */
      }

      if (Math.abs(activeNow - nextActiveT) >= SEEK_EPS) {
        try {
          activePlayer.seekTo?.(nextActiveT, true);
        } catch {
          /* YouTube API */
        }
      }
      if (Math.abs(pipNow - nextPipT) >= SEEK_EPS) {
        try {
          pipPlayer.seekTo?.(nextPipT, true);
        } catch {
          /* YouTube API */
        }
      }

      try {
        await safeSetPlaybackRate(primary, pr);
        await safeSetPlaybackRate(pip, pr);
      } catch {
        /* YouTube API */
      }

      if (wasPlaying) {
        if (s.sourceType === "live") {
          forceYouTubePlay(
            activePlayer,
            "handleFocusPipSwap:active",
            nextActiveAngle.id,
            { delayedUnmute: false },
          );
          forceYouTubePlay(
            pipPlayer,
            "handleFocusPipSwap:pip",
            nextPipAngle.id,
            { delayedUnmute: false },
          );
        } else {
          try {
            activePlayer.playVideo?.();
          } catch {
            /* YouTube API */
          }
          try {
            pipPlayer.playVideo?.();
          } catch {
            /* YouTube API */
          }
        }
      } else {
        try {
          activePlayer.pauseVideo?.();
        } catch {
          /* YouTube API */
        }
        try {
          pipPlayer.pauseVideo?.();
        } catch {
          /* YouTube API */
        }
      }

      // Audio: exactly one unmuted — focused video only.
      try {
        activePlayer.unMute?.();
      } catch {
        /* YouTube API */
      }
      try {
        pipPlayer.mute?.();
      } catch {
        /* YouTube API */
      }

      // Layout-only swap: keep roomState currentAngleId/videoId unchanged to avoid iframe reload.
      setHostFocusAngleId(swapped ? null : pipAngle.id);

      // Ensure secondary stays aligned to the shared anchor clock (roomState.currentTime).
      applyHostMultiViewSecondaryDirect({
        primaryAnchorTime: tActive,
        isPlaying: wasPlaying,
        playbackRate: pr,
        reason: "focus-pip-swap",
      });
    })();
  }, [
    isHost,
    roomId,
    clearFfIfActive,
    showHostNotice,
    applyHostMultiViewSecondaryDirect,
  ]);

  /** Multi View fullscreen: layout only (no RTDB angle switch / loadVideoById). */
  const applyHostMultiFullscreenTarget = useCallback(
    (angleId: string) => {
      if (!isHost) return;
      setFullscreenAngleId(angleId);
      const cur = roomStateRef.current;
      if (!cur || cur.angles.length < 2) return;
      if (coachViewModeRef.current !== "multi") return;
      const activeAngle = pickAngle(cur.angles, cur.currentAngleId);
      const secondaryAngle =
        cur.angles.find((a) => a.id !== activeAngle.id) ?? null;
      if (!secondaryAngle) return;
      if (angleId === activeAngle.id) {
        setHostFocusAngleId(null);
      } else if (angleId === secondaryAngle.id) {
        setHostFocusAngleId(secondaryAngle.id);
      }
    },
    [isHost],
  );

  const handleResetManualSyncLock = useCallback(() => {
    if (!isHost || !roomId) return;
    const rr = roomRefForWrite.current;
    const cur = roomStateRef.current;
    if (!rr || !cur) return;
    const nextAngles: VideoAngle[] = cur.angles.map((a) => ({
      ...a,
      offsetFromGameTime: 0,
      ...(a.autoOffsetSource === "manual"
        ? { autoOffsetSource: "unknown" as const }
        : {}),
    }));
    syncLog("reset sync", {
      angles: nextAngles.length,
      sourceType: cur.sourceType ?? "",
    });
    void update(rr, {
      angles: nextAngles,
      manualSyncLocked: false,
      manualSyncAt: null,
      syncAnchorTime: 0,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      /* RTDB */
    });
  }, [isHost, roomId]);

  const handleHostScrubCommit = useCallback(
    (targetSec: number) => {
      if (!isHost || !roomId) return;
      if (isManualSyncModeRef.current) return;
      void (async () => {
        const cur = roomStateRef.current;
        if (!cur) return;
        const pr = clearFfIfActive();
        const wasPlaying = cur.isPlaying;
        const syncAnchorTime = isSyncLayoutMode(roomViewModeRef.current)
          ? (cur.syncAnchorTime ?? 0)
          : 0;
        let clamped = Math.max(syncAnchorTime, targetSec);

        if (cur.sourceType === "live" && roomViewModeRef.current === "sync") {
          const player = getPlayer();
          const ct = await readYoutubeCurrentTime(
            player,
            cur.currentTime ?? 0,
          );
          if (clamped > ct + 0.05) {
            const edge = await getLiveEdgeSeconds(player);
            const maxT = Math.max(0, edge - LIVE_SAFETY_BUFFER_SECONDS);
            clamped = Math.min(clamped, maxT);
          }
        }

        writeImmediatePlaybackCommand("seek", {
          currentTime: clamped,
          isPlaying: wasPlaying,
          playbackRate: pr,
        });

        const p = getPlayer();
        if (
          cur.sourceType === "live" &&
          roomViewModeRef.current === "sync" &&
          cur.angles.length > 1
        ) {
          syncLog("LIVE SEEK", {
            reason: "scrub-primary",
            angleId: cur.currentAngleId,
            target: clamped,
            commandId: hostActionSeqRef.current,
          });
        }
        try {
          p?.seekTo?.(clamped, true);
        } catch {
          /* YouTube API */
        }
        if (wasPlaying) {
          try {
            p?.playVideo?.();
          } catch {
            /* YouTube API */
          }
        } else {
          try {
            p?.pauseVideo?.();
          } catch {
            /* YouTube API */
          }
        }

        if (isSyncLayoutMode(roomViewModeRef.current)) {
          applyHostMultiViewSecondaryDirect({
            primaryAnchorTime: clamped,
            isPlaying: wasPlaying,
            playbackRate: pr,
            reason: "scrub",
            alignSeq: hostActionSeqRef.current,
          });
        }
      })();
    },
    [
      isHost,
      roomId,
      clearFfIfActive,
      writeImmediatePlaybackCommand,
      applyHostMultiViewSecondaryDirect,
    ],
  );

  // No smart resync: keep synced playback deterministic.

  const handlePrevChapter = () => {
    if (!isHost) return;
    pulseChapterNav("prev");
    void (async () => {
      const cur = roomStateRef.current;
      if (!cur || !cur.chapters.length) return;
      const player = getPlayer();
      const t = await readYoutubeCurrentTime(player, cur.currentTime ?? 0);
      const active = pickAngle(cur.angles, cur.currentAngleId);
      const cursorMoment = t - (active.offsetFromGameTime ?? 0);
      const target = findPrevChapterInSession(
        cur.clips,
        cur.chapters,
        cur.currentClipIndex,
        cursorMoment,
        cur.angles,
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
      const active = pickAngle(cur.angles, cur.currentAngleId);
      const cursorMoment = t - (active.offsetFromGameTime ?? 0);
      const target = findNextChapterInSession(
        cur.clips,
        cur.chapters,
        cur.currentClipIndex,
        cursorMoment,
        cur.angles,
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
    const alignSeq = hostActionSeqRef.current;
    void (async () => {
      const cur = roomStateRef.current;
      if (!cur) return;
      if (isSyncLayoutMode(roomViewModeRef.current)) {
        for (const a of cur.angles) {
          const p = syncPlayerRefs.current[a.id];
          if (!p) continue;
          try {
            await safeSetPlaybackRate(p, rate);
          } catch {
            /* YouTube API */
          }
        }
        return;
      }
      const player = getPlayer();
      const fb = cur.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      applyHostMultiViewSecondaryDirect({
        primaryAnchorTime: t,
        isPlaying: cur.isPlaying,
        playbackRate: rate,
        reason: "speed",
        alignSeq,
      });
    })();
  };

  const handleManualFineTuneSecondaryOffset = useCallback(
    (deltaSec: number) => {
      if (!isHost || !roomId) return;
      if (isManualSyncModeRef.current) return;
      if (!isSyncLayoutMode(roomViewModeRef.current)) return;
      const rr = roomRefForWrite.current;
      const cur = roomStateRef.current;
      if (!rr || !cur) return;
      if (coachViewModeRef.current !== "multi") return;
      if (!cur.angles?.length || cur.angles.length < 2) return;

      const active = pickAngle(cur.angles, cur.currentAngleId);
      const sec = cur.angles.find((a) => a.id !== active.id);
      if (!sec) return;

      const nextAngles: VideoAngle[] = cur.angles.map((a) =>
        a.id === sec.id
          ? {
              ...a,
              offsetFromGameTime: (a.offsetFromGameTime ?? 0) + deltaSec,
              autoOffsetSource: "manual" as const,
            }
          : { ...a },
      );

      const nextSecondaryOffset =
        nextAngles.find((a) => a.id === sec.id)?.offsetFromGameTime ?? 0;

      void update(rr, { angles: nextAngles, updatedAt: serverTimestamp() })
        .then(() => {
          const linkedGameId = gameIdFromUrl?.trim() ?? "";
          if (linkedGameId) {
            void persistRoomManualSyncPairToGame(
              linkedGameId,
              active.id,
              sec.id,
              nextSecondaryOffset,
              { markReferenceSynced: true },
            ).catch(() => {
              /* review save — room sync still applied */
            });
          }
          void (async () => {
            const primary = getPlayer();
            if (!primary) return;
            const fb = roomStateRef.current?.currentTime ?? 0;
            const t = await readYoutubeCurrentTime(primary, fb);
            applyHostMultiViewSecondaryDirect({
              primaryAnchorTime: t,
              isPlaying: roomStateRef.current?.isPlaying ?? false,
              playbackRate:
                roomStateRef.current?.playbackRate ?? DEFAULT_PLAYBACK_RATE,
              reason: "manual-fine-tune-offset",
            });
          })();
        })
        .catch(() => {
          /* RTDB */
        });
    },
    [isHost, roomId, gameIdFromUrl, applyHostMultiViewSecondaryDirect],
  );

  const handlePlayerReady = useCallback(() => {
    const s = roomStateRef.current;
    if (!s) return;
    const p = getPlayer();
    if (p && isHostRef.current && s.sourceType !== "live") {
      try {
        const start = Math.max(0, s.currentTime ?? 0, s.syncAnchorTime ?? 0);
        void readYoutubeCurrentTime(p, start).then((cur) => {
          if (Math.abs(cur - start) > 0.35) {
            try {
              p.seekTo?.(start, true);
            } catch {
              /* YouTube API */
            }
          }
          if (!s.isPlaying) {
            try {
              p.pauseVideo?.();
            } catch {
              /* YouTube API */
            }
          }
        });
      } catch {
        /* YouTube API */
      }
    }
    if (p && s.sourceType === "live") {
      void forceLiveBootstrapPlay(p, "onReady:primary");
      const activeAngle =
        s.angles.find((a) => a.id === s.currentAngleId) ?? s.angles[0]!;
      if (activeAngle.appCreatedLive === true) {
        window.setTimeout(() => {
          try {
            const p2 = getPlayer();
            const cur = roomStateRef.current;
            if (!p2 || !cur || cur.sourceType !== "live") return;
            const active =
              cur.angles.find((a) => a.id === cur.currentAngleId) ??
              cur.angles[0]!;
            if (active.appCreatedLive !== true) return;
            const st = p2.getPlayerState?.();
            if (st !== YT_UNSTARTED) return;
            console.log("LIVE_BOOTSTRAP_RECOVER", {
              reason: "unstarted>4s-after-onReady",
              videoId: cur.videoId,
              state: st,
            });
            try {
              (p2 as YouTubePlayer & { loadVideoById?: (id: string) => void })
                .loadVideoById?.(cur.videoId);
            } catch {
              /* ignore */
            }
            void forceLiveBootstrapPlay(
              p2,
              "recover:unstarted>4s-after-onReady",
            );
          } catch {
            /* ignore */
          }
        }, 4000);
      }
    }
    if (!isHostRef.current && p && pendingPlaybackCommandRef.current) {
      const cmd = pendingPlaybackCommandRef.current;
      if (
        cmd.activeVideoId === s.videoId &&
        cmd.commandId !== lastAppliedCommandIdRef.current
      ) {
        pendingPlaybackCommandRef.current = null;
        syncLog("viewer apply pending on player ready", cmd);
        void (async () => {
          const syncMulti =
            isSyncLayoutMode(roomViewModeRef.current) &&
            !!s.angles?.length &&
            s.angles.length > 1;

          if (syncMulti) {
            const anchorTime = getSafeAnchorTime(cmd.anchorVideoTime, s);
            const activeId = s.currentAngleId;
            for (const a of s.angles) {
              const pl = syncPlayerRefs.current[a.id];
              if (!pl) continue;
              try {
                await safeSetPlaybackRate(pl, cmd.playbackRate);
              } catch {
                /* ignore */
              }
              const target =
                a.id === activeId
                  ? Math.max(0, anchorTime)
                  : Math.max(0, anchorTime + (a.offsetFromGameTime ?? 0));
              const ct = await readYoutubeCurrentTime(pl, target);
              if (Math.abs(ct - target) >= VIEWER_SEEK_DEADBAND_S) {
                await pl.seekTo(target, true);
              }
            }
            lastViewerSyncRateRef.current = cmd.playbackRate;
            for (const a of s.angles) {
              const pl = syncPlayerRefs.current[a.id];
              if (!pl) continue;
              if (s.isPlaying) {
                await ensureViewerPlaybackIntent(
                  pl,
                  true,
                  viewerPlaybackUnlockedRef,
                  s.sourceType === "live" ? { liveViewerKick: true } : undefined,
                );
              } else {
                await applyPlaybackIfNeeded(pl, false);
              }
            }
          } else {
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
          }

          lastAppliedCommandIdRef.current = cmd.commandId;
          viewerInitialAppliedRef.current = true;
          lastAppliedKey.current = "";
        })();
        return;
      }
      pendingPlaybackCommandRef.current = null;
    }
    /* After iframe remount, re-sync. If we already applied this snapshot, skip (avoids seek/play churn). */
    const key = stableKey(s);
    if (key === lastAppliedKey.current) return;
    const gen = ++applyRoomGenRef.current;
    if (isHostRef.current) {
      void applyRoomStateToPlayer(s, null, gen);
    }

    if (!isHostRef.current) return;
    const pending = pendingAngleAutoplayRef.current;
    if (
      pending &&
      pending.videoId === s.videoId &&
      pending.commandId === s.actionId &&
      s.isPlaying
    ) {
      pendingAngleAutoplayRef.current = null;
      syncLog("angle switch autoplay", {
        videoId: s.videoId,
        seekTime: pending.seekTime,
      });
      window.setTimeout(() => {
        const pp = getPlayer();
        if (!pp) return;
        const pendingLive = s.sourceType === "live";
        void (async () => {
          try {
            pp.seekTo?.(pending.seekTime, true);
          } catch {
            /* YouTube API */
          }
          const st = await readYoutubePlayerState(pp);
          if (!youtubeStateImpliesPlaying(st)) {
            if (pendingLive) {
              forceYouTubePlay(pp, "angle-switch-autoplay", s.currentAngleId, {
                delayedUnmute: true,
              });
            } else {
              try {
                pp.playVideo();
              } catch {
                /* YouTube autoplay / readiness */
              }
            }
          }
          window.setTimeout(() => {
            const p2 = getPlayer();
            if (!p2) return;
            void (async () => {
              const st2 = await readYoutubePlayerState(p2);
              if (youtubeStateImpliesPlaying(st2)) return;
              if (pendingLive) {
                forceYouTubePlay(p2, "angle-switch-autoplay-retry", s.currentAngleId, {
                  delayedUnmute: true,
                });
              } else {
                try {
                  p2.playVideo();
                } catch {
                  /* YouTube autoplay / readiness */
                }
              }
            })();
          }, 250);
        })();
      }, 120);
    }
  }, [applyRoomStateToPlayer]);

  const handleClearDrawings = useCallback(() => {
    if (!roomId || !isHost) return;
    const dispatchTelestratorClear = (detail: FilmRoomTelestratorClearDetail) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent(FILM_ROOM_TELESTRATOR_CLEAR_EVENT, { detail }),
      );
    };
    const s = roomStateRef.current;
    const syncMultiCoach =
      Boolean(
        s &&
          isSyncLayoutMode(roomViewModeRef.current) &&
          s.angles.length > 1 &&
          coachViewModeRef.current === "multi",
      );
    if (
      !s ||
      !isSyncLayoutMode(roomViewModeRef.current) ||
      s.angles.length <= 1 ||
      syncMultiCoach
    ) {
      dispatchTelestratorClear({ scope: "all" });
      void remove(ref(db, `rooms/${roomId}/telestrator/strokes`));
      return;
    }
    const targetId = resolveViewerStackTopAngleId(s);
    dispatchTelestratorClear({ scope: "angle", angleId: targetId });
    void (async () => {
      try {
        const snap = await get(ref(db, `rooms/${roomId}/telestrator/strokes`));
        const val = snap.val() as Record<string, unknown> | null;
        if (!val || typeof val !== "object") return;
        const payload: Record<string, null> = {};
        for (const [id, row] of Object.entries(val)) {
          if (!row || typeof row !== "object") continue;
          const aid = (row as { angleId?: unknown }).angleId;
          const hasAid = typeof aid === "string" && aid.length > 0;
          if (!hasAid) {
            payload[`rooms/${roomId}/telestrator/strokes/${id}`] = null;
            continue;
          }
          if (aid === targetId) {
            payload[`rooms/${roomId}/telestrator/strokes/${id}`] = null;
          }
        }
        if (Object.keys(payload).length === 0) return;
        await update(ref(db), payload);
      } catch {
        /* RTDB offline / rules */
      }
    })();
  }, [roomId, isHost]);

  const handleCopyViewerLink = () => {
    const raw = roomState?.videoId ?? videoIdFromUrl;
    if (!roomId || !raw || typeof window === "undefined") return;
    const url = buildViewerRoomUrl(window.location.origin, roomId, raw);
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopySyncViewerLink = useCallback(() => {
    if (!roomId || typeof window === "undefined") return;
    const url = `${window.location.origin}/room/${roomId}?view=sync`;
    void navigator.clipboard.writeText(url).then(() => {
      setSyncViewerLinkCopied(true);
      window.setTimeout(() => setSyncViewerLinkCopied(false), 2000);
    });
  }, [roomId]);

  const handleCopySharedToMySessions = useCallback(async () => {
    if (!roomId || !user || isCopyingShared) return;
    setIsCopyingShared(true);
    setCopySharedError(null);
    try {
      const src = roomStateRef.current;
      if (!src) throw new Error("Room not loaded.");
      const newRoomId = Math.random().toString(36).slice(2, 10);
      markRoomHost(newRoomId);
      const dstRef = ref(db, `rooms/${newRoomId}`);

      const clips =
        Array.isArray(src.clips) && src.clips.length > 0
          ? src.clips
          : [{ videoId: src.videoId }];
      const currentClipIndex = Math.min(
        Math.max(0, src.currentClipIndex ?? 0),
        Math.max(0, clips.length - 1),
      );

      const copiedFrom: Record<string, unknown> = {
        roomId,
        ...(typeof src.ownerId === "string" && src.ownerId.trim() !== ""
          ? { ownerId: src.ownerId.trim() }
          : {}),
        ...(typeof src.name === "string" && src.name.trim() !== ""
          ? { name: src.name.trim() }
          : {}),
      };

      await set(dstRef, {
        ...(typeof src.name === "string" && src.name.trim() !== ""
          ? { name: src.name.trim() }
          : {}),
        ...(src.sourceType === "live" ? { sourceType: "live" as const } : {}),
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        sourceRoomId: roomId,
        copiedFrom,
        videoId: src.videoId,
        clips: clips.map((c) => ({
          videoId: c.videoId,
          ...(c.label?.trim() ? { label: c.label.trim() } : {}),
        })),
        currentClipIndex,
        chapters: (src.chapters ?? []).map((ch) => ({
          time: ch.time,
          label: ch.label,
          videoId: ch.videoId,
          ...(typeof ch.gameTime === "number" ? { gameTime: ch.gameTime } : {}),
        })),
        angles: (src.angles ?? []).map((a) => ({ ...a })),
        currentAngleId: src.currentAngleId,
        ...(typeof src.syncAnchorTime === "number" && src.syncAnchorTime > 0
          ? { syncAnchorTime: src.syncAnchorTime }
          : {}),
        ...(src.manualSyncLocked === true ? { manualSyncLocked: true } : {}),
        ...(typeof src.manualSyncAt === "number"
          ? { manualSyncAt: src.manualSyncAt }
          : {}),
        ...(src.playerViewAngleId ? { playerViewAngleId: src.playerViewAngleId } : {}),
        isPlaying: false,
        currentTime: typeof src.currentTime === "number" ? src.currentTime : 0,
        playbackRate:
          typeof src.playbackRate === "number"
            ? src.playbackRate
            : DEFAULT_PLAYBACK_RATE,
        playbackCommand: null,
        action: "init",
        actionId: 1,
      });

      // Best-effort copy drawings (telestrator).
      try {
        const strokesSnap = await get(
          ref(db, `rooms/${roomId}/telestrator/strokes`),
        );
        if (strokesSnap.exists()) {
          await set(
            ref(db, `rooms/${newRoomId}/telestrator/strokes`),
            strokesSnap.val(),
          );
        }
      } catch {
        /* optional */
      }

      setCopySharedToast(true);
      window.setTimeout(() => setCopySharedToast(false), 2000);
      const to =
        src.sourceType === "live" || isSyncLayoutMode(roomViewModeRef.current)
          ? `/room/${newRoomId}?view=sync`
          : `/room/${newRoomId}`;
      router.replace(to);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not copy session.";
      setCopySharedError(msg);
    } finally {
      setIsCopyingShared(false);
    }
  }, [roomId, user, isCopyingShared, router]);

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
    syncLog("save session clicked", { view: roomViewModeRef.current });
    let u = user;
    if (!u) {
      try {
        const cred = await signInWithGoogle();
        if (!cred) return; // redirect sign-in in progress
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
        ...(roomState.angles.length >= 1
          ? {
              angles: roomState.angles,
              currentAngleId: roomState.currentAngleId,
            }
          : {}),
        ...(typeof roomState.syncAnchorTime === "number" &&
        roomState.syncAnchorTime > 0
          ? { syncAnchorTime: roomState.syncAnchorTime }
          : {}),
        ...(roomState.manualSyncLocked === true
          ? { manualSyncLocked: true }
          : {}),
        ...(roomState.playerViewAngleId
          ? { playerViewAngleId: roomState.playerViewAngleId }
          : {}),
        ...(typeof roomState.manualSyncAt === "number"
          ? { manualSyncAt: roomState.manualSyncAt }
          : {}),
        ...(roomState.sourceType === "live"
          ? { sourceType: "live" as const }
          : {}),
        ...(roomState.videoProvider === "facebook"
          ? { videoProvider: "facebook" as const }
          : {}),
      });

      // Save succeeded: mark clean and reset dirty baselines to current state.
      setSessionDirty(false);
      dirtyInitRef.current = true;
      lastDirtyChapterSigRef.current = (roomState.chapters ?? [])
        .map((ch) =>
          [
            ch.videoId ?? "",
            String(ch.time ?? 0),
            ch.label ?? "",
            typeof ch.gameTime === "number" ? String(ch.gameTime) : "",
          ].join("|"),
        )
        .join("~");
      lastDirtyAngleOffsetSigRef.current = (roomState.angles ?? [])
        .map((a) =>
          [
            a.id ?? "",
            a.videoId ?? "",
            typeof (a as { offsetFromGameTime?: number }).offsetFromGameTime ===
            "number"
              ? String((a as { offsetFromGameTime?: number }).offsetFromGameTime)
              : "0",
          ].join("|"),
        )
        .join("~");
      lastDirtyPlayerViewAngleIdRef.current = roomState.playerViewAngleId ?? "";

      closeSaveSessionDialog();
      setSessionSavedToast(true);
      window.setTimeout(() => setSessionSavedToast(false), 2500);
      syncLog("save session success", {
        clips: roomState.clips.length,
        angles: roomState.angles.length,
        syncAnchorTime: roomState.syncAnchorTime ?? 0,
        manualSyncLocked: roomState.manualSyncLocked === true,
        playerViewAngleId: roomState.playerViewAngleId ?? "",
        chapters: roomState.chapters.length,
      });
      lastSavedRoomUpdatedAtRef.current = roomState.updatedAt ?? Date.now();
      if (goHomeAfterSaveRef.current) {
        goHomeAfterSaveRef.current = false;
        setLeaveConfirmOpen(false);
        setLeaveConfirmError(null);
        goHome();
      }
    } catch (err) {
      syncLog("save session error", { err });
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
    goHome,
  ]);

  const handleShareLessonPlan = useCallback(async () => {
    if (!isHost || !roomState || roomState.videoProvider !== "facebook") return;
    let uid = user?.uid;
    if (!uid) {
      try {
        const cred = await signInWithGoogle();
        if (!cred) return; // redirect sign-in in progress
        uid = cred.user.uid;
      } catch {
        return;
      }
    }
    setSharingLessonPlan(true);
    try {
      const name =
        saveSessionName.trim() ||
        roomState.name?.trim() ||
        saveSessionDefaultName();
      const folderTrim = saveSessionFolder.trim();
      const sessionId = await saveSessionTemplate(uid, {
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
        videoProvider: "facebook",
      });
      const shareId = await ensureSessionSharing(uid, sessionId);
      const shareUrl = `${window.location.origin}/shared/${encodeURIComponent(shareId)}`;
      await navigator.clipboard.writeText(shareUrl);
      setLessonPlanShareCopied(true);
      window.setTimeout(() => setLessonPlanShareCopied(false), 2500);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Could not share this lesson plan.",
      );
    } finally {
      setSharingLessonPlan(false);
    }
  }, [
    isHost,
    roomState,
    user,
    saveSessionName,
    saveSessionFolder,
    saveSessionDefaultName,
  ]);

  const maybeUnsaved = Boolean(
    isHost &&
      roomState &&
      (sessionDirty ||
        lastSavedRoomUpdatedAtRef.current === 0 ||
        (roomState.updatedAt ?? 0) > lastSavedRoomUpdatedAtRef.current),
  );

  const handleHomeFromSync = useCallback(() => {
    if (!isHost) {
      goHome();
      return;
    }
    if (!maybeUnsaved) {
      goHome();
      return;
    }
    setLeaveConfirmError(null);
    setLeaveConfirmOpen(true);
  }, [goHome, isHost, maybeUnsaved]);

  const chaptersDisplay = useMemo(
    () =>
      roomState?.chapters?.length
        ? buildChaptersDisplayList(
            roomState.clips,
            roomState.chapters,
            roomState.angles,
          )
        : [],
    [roomState],
  );

  const tForChapterHighlight = uiPlaybackTime ?? roomState?.currentTime ?? 0;
  const chapterNavCursor = roomState
    ? tForChapterHighlight -
      (pickAngle(roomState.angles, roomState.currentAngleId)
        .offsetFromGameTime ?? 0)
    : tForChapterHighlight;
  const activeClipCanonicalId =
    roomState?.clips[roomState.currentClipIndex]?.videoId ?? "";
  const activeChapterIndex =
    roomState?.chapters?.length && activeClipCanonicalId && roomState
      ? findActiveChapterIndexForUi(
          roomState.chapters,
          activeClipCanonicalId,
          tForChapterHighlight,
          pickAngle(roomState.angles, roomState.currentAngleId),
          roomState.angles[0] ??
            pickAngle(roomState.angles, roomState.currentAngleId),
          roomState.angles,
        )
      : null;
  const sessionPrevChapter =
    roomState && roomState.chapters.length > 0
      ? findPrevChapterInSession(
          roomState.clips,
          roomState.chapters,
          roomState.currentClipIndex,
          chapterNavCursor,
          roomState.angles,
        )
      : null;
  const sessionNextChapter =
    roomState && roomState.chapters.length > 0
      ? findNextChapterInSession(
          roomState.clips,
          roomState.chapters,
          roomState.currentClipIndex,
          chapterNavCursor,
          roomState.angles,
        )
      : null;

  const displayRate = roomState?.playbackRate ?? DEFAULT_PLAYBACK_RATE;

  const drawGateOn = Boolean(isHost && telDrawOn);
  const fsActive = Boolean(isHost && fullscreenAngleId !== null);
  const fsStageClass = fsActive ? "fixed inset-0 z-[9999] bg-black" : "";
  const telestratorWrapFs = fsActive
    ? "pointer-events-none fixed inset-0 z-[10000]"
    : undefined;

  const manualSyncManualCount =
    roomState?.angles.filter((a) => a.autoOffsetSource === "manual").length ?? 0;
  const manualSyncBadgeVisible = Boolean(
    isHost &&
      roomState &&
      (roomState.manualSyncLocked === true || manualSyncManualCount >= 2),
  );
  const showResetSyncBtn = Boolean(
    isHost &&
      roomState &&
      (roomState.manualSyncLocked === true || manualSyncManualCount >= 1),
  );
  /** Coach marks toolbar writes game marks; legacy Mark Play chapters are clip-only without a game. */
  const showHostMarkPlay = Boolean(
    isHost && !gameIdFromUrl?.trim() && !isSyncLayoutMode(roomViewMode),
  );

  const hostMultiAngles =
    isHost &&
    isSyncLayoutMode(roomViewMode) &&
    coachViewMode === "multi" &&
    roomState &&
    roomState.angles.length > 1
      ? (() => {
          const activeAngle = pickAngle(
            roomState.angles,
            roomState.currentAngleId,
          );
          const secondaryAngle =
            roomState.angles.find((a) => a.id !== activeAngle.id) ??
            roomState.angles[0]!;
          return { activeAngle, secondaryAngle };
        })()
      : null;

  const fsMA = hostMultiAngles;
  const fsGridLayoutMode = Boolean(
    fsActive && fsMA && fullscreenAngleId !== null,
  );
  const fsGridPrimaryBig = Boolean(
    fsGridLayoutMode &&
      fsMA &&
      fullscreenAngleId === fsMA.activeAngle.id,
  );
  const fsGridSecondaryBig = Boolean(
    fsGridLayoutMode &&
      fsMA &&
      fullscreenAngleId === fsMA.secondaryAngle.id,
  );
  const fsGridBigCls =
    "absolute inset-0 z-[20] min-h-0 overflow-hidden";
  const fsGridPipCls =
    "absolute bottom-3 right-3 z-[30] aspect-video w-[min(38vw,15rem)] max-w-[42%] cursor-pointer overflow-hidden rounded-lg border-2 border-white/35 bg-black shadow-xl ring-1 ring-black/50";

  useEffect(() => {
    if (!isHost) return;
    if (coachViewMode !== "multi") {
      if (hostFocusAngleIdRef.current !== null) setHostFocusAngleId(null);
    }
  }, [isHost, coachViewMode]);

  const returnHomeBtnClass =
    "fixed left-4 top-4 z-50 rounded-lg border border-white/[0.08] bg-zinc-950/85 px-2.5 py-1.5 text-xs font-medium text-zinc-200 shadow-sm shadow-black/20 backdrop-blur-sm transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

  const gameHubNavLink =
    gameIdFromUrl?.trim() ? (
      <>
        <Link
          href={`/game/${gameIdFromUrl.trim()}`}
          className="fixed left-4 top-[3.25rem] z-50 rounded-lg border border-white/[0.08] bg-zinc-950/70 px-2.5 py-1 text-[11px] font-medium text-zinc-400 shadow-sm shadow-black/20 backdrop-blur-sm transition hover:border-white/15 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          ← Game
        </Link>
        {teamRoomMode ? (
          <Link
            href={`/game/${gameIdFromUrl.trim()}/review`}
            className="fixed left-4 top-[5.5rem] z-50 rounded-lg border border-violet-500/30 bg-violet-950/55 px-2.5 py-1 text-[11px] font-medium text-violet-100 shadow-sm shadow-black/20 backdrop-blur-sm transition hover:border-violet-400/45 hover:bg-violet-900/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            Edit marks in Review
          </Link>
        ) : null}
      </>
    ) : null;

  if (!roomId.trim()) {
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
          <p className="mb-6 text-sm text-zinc-300">Missing room id.</p>
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

  if (!roomHydrated) {
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
          <p className="mb-2 text-sm font-medium text-zinc-200">Loading room…</p>
          <p className="text-xs text-zinc-500">Fetching session from the server.</p>
        </div>
      </div>
    );
  }

  if (!roomState) {
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
          <p className="mb-6 text-sm text-zinc-300">
            This room could not be loaded. It may not exist or the link may be
            invalid.
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

  let effectiveVideoId = (
    roomState.videoId?.trim() ||
    videoIdFromUrl ||
    facebookVideoKeyFromUrl ||
    roomState.angles[0]?.videoId?.trim() ||
    ""
  ).trim();
  if (!effectiveVideoId && (viewParam === "sync" || viewParam === "live")) {
    const sid = roomState.angles.find((a) => a.videoId?.trim())?.videoId?.trim();
    if (sid) effectiveVideoId = sid;
  }

  if (!effectiveVideoId) {
    const invalidMsg =
      videoFromUrl?.trim() &&
      !videoIdFromUrl &&
      !facebookVideoKeyFromUrl
        ? "Paste a YouTube or Facebook video link to start a room."
        : !videoFromUrl?.trim()
          ? "No video selected. Add a ?video= link with a YouTube id, or open a room that already has a session."
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

  const isFacebookRoom = roomState.videoProvider === "facebook";
  const facebookEmbedHref = activeFacebookHref(roomState);
  const facebookCaptureClips = roomState.clips.map((c) => ({
    videoKey: c.videoId,
    href:
      c.facebookVideoUrl?.trim() ||
      `https://www.facebook.com/watch?v=${encodeURIComponent(c.videoId)}`,
    label: c.label,
  }));
  const facebookCaptureChapters = roomState.chapters
    .filter((ch) => ch.videoId === roomState.videoId)
    .map((ch) => ({ time: ch.time, label: ch.label }));

  const hostChip =
    "rounded-lg border border-white/[0.10] bg-zinc-950/90 px-3 py-2 text-xs font-medium text-zinc-50 shadow-md shadow-black/40 backdrop-blur-md transition duration-150 hover:border-white/18 hover:bg-zinc-900/95 active:scale-[0.97] active:brightness-90 active:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:text-sm";

  const hostChipSync =
    "rounded-lg border border-blue-500/45 bg-blue-950/60 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-blue-950/50 backdrop-blur-md transition duration-150 hover:border-blue-400/60 hover:bg-blue-900/55 active:scale-[0.97] active:brightness-95 active:border-blue-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:text-sm";

  const hostControlsBar =
    "pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-zinc-950/92 px-3 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-md ring-1 ring-white/[0.06] sm:gap-2.5 sm:px-4";

  const hostChipClean =
    "rounded-md border border-white/[0.10] bg-zinc-950/85 px-2 py-1 text-[10px] font-medium text-zinc-50 shadow-sm shadow-black/35 backdrop-blur-md transition duration-150 hover:border-white/18 hover:bg-zinc-900/90 active:scale-[0.97] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";

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

  const embedErrorBanner = embedError ? (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-3">
      <div className="flex w-full max-w-2xl flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-950/90 px-4 py-3 text-sm text-amber-50 shadow-lg shadow-black/40 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-amber-100">
            This video can’t play embedded here
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-amber-100/85">
            {embedError.code === 101 || embedError.code === 150
              ? "YouTube has embedding disabled for this video. In YouTube Studio → the video → enable “Allow embedding”, or open it on YouTube."
              : embedError.code === 100
                ? "The video is private or was removed. Re-add a public or unlisted embeddable link on the game."
                : embedError.code === 2
                  ? "The video id is invalid. Re-add the YouTube link on the game."
                  : "YouTube reported a playback error for the embedded player. You can still watch on YouTube."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {embedError.videoId &&
          /^[a-zA-Z0-9_-]{11}$/.test(embedError.videoId) ? (
            <a
              href={`https://www.youtube.com/watch?v=${embedError.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-amber-300/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-amber-500/30"
            >
              Open on YouTube
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setEmbedError(null)}
            className="rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-amber-50/90 transition hover:bg-white/[0.12]"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (isSyncLayoutMode(roomViewMode) && roomState && !cleanMode) {
    const s = roomState;
    const synced = (s.syncAnchorTime ?? 0) > 0 || s.manualSyncLocked === true;
    const multi = s.angles.length > 1;
    const showIndependentControls = isHost && multi && (!synced || isManualSyncMode);

    const activeAngle = pickAngle(s.angles, s.currentAngleId);
    const viewerStackTopAngleId = resolveViewerStackTopAngleId(s);
    const viewerStackTopResolvedId =
      viewerLocalMainAngleId &&
      s.angles.some((x) => x.id === viewerLocalMainAngleId)
        ? viewerLocalMainAngleId
        : s.angles.some((x) => x.id === viewerStackTopAngleId)
          ? viewerStackTopAngleId
          : s.angles[0]!.id;
    /** Same as Player View stack: valid playerViewAngleId ?? currentAngleId ?? first angle id. */
    const viewerPlayerViewDrawAngleId = viewerStackTopResolvedId;
    const viewerTopAngleForLabel =
      s.angles.find((x) => x.id === viewerStackTopResolvedId) ?? s.angles[0]!;
    const isLiveSource = s.sourceType === "live";
    const showGoLiveControls =
      isHost && roomViewMode === "sync" && isLiveSource;
    const showPerAngleLiveTiles =
      isLiveSource && roomViewMode === "sync";
    const perAngleLiveBtnClass =
      "rounded-md border border-rose-500/40 bg-rose-950/55 px-2 py-1 text-[10px] font-semibold text-rose-100 shadow-sm transition hover:border-rose-400/55 hover:bg-rose-900/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/45";
    const syncPrimaryVideoId = safeDecodeVideoId(activeAngle.videoId);
    const syncPrimaryVideoOk = /^[a-zA-Z0-9_-]{11}$/.test(syncPrimaryVideoId);

    return (
      <>
      {embedErrorBanner}
      {gameHubNavLink}
      <div className="flex min-h-screen flex-col px-4 py-6 text-zinc-50">
        <div className="mb-4 flex items-center justify-between gap-3">
          {teamRoomMode ? (
            <p className="text-xs text-zinc-500">Watch together · Sync View</p>
          ) : (
            <button
              type="button"
              onClick={() => navigateRoomView("clip")}
              className="rounded-lg border border-white/[0.08] bg-zinc-950/85 px-3 py-2 text-xs font-semibold text-zinc-100 shadow-sm shadow-black/30 backdrop-blur-sm transition hover:border-white/15 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              ← Clip View
            </button>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => navigateRoomView("clip")}
                disabled={teamRoomMode}
                title={
                  teamRoomMode ? "Watch together uses Sync View" : undefined
                }
                className={`rounded-md px-3 py-1 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  roomViewMode === "clip"
                    ? "bg-blue-600/40 text-white"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                Clip View
              </button>
              <button
                type="button"
                onClick={() => navigateRoomView("sync")}
                className={`rounded-md px-3 py-1 text-[12px] font-semibold transition ${
                  roomViewMode === "sync"
                    ? "bg-blue-600/40 text-white"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                Sync View
              </button>
            </div>
            <span className="text-sm font-semibold text-zinc-100">
              {teamRoomMode ? "Watch together" : "Film Room"}
            </span>
            <span className="rounded-md bg-blue-600/35 px-2 py-0.5 text-[11px] font-semibold text-blue-100">
              {isHost ? "Host" : "Viewer"}
            </span>
            {isLiveSource ? (
              <span className="rounded-md border border-red-500/50 bg-red-950/50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-100">
                Live
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {showGoLiveControls ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleGoLive()}
                  className={secondaryHostBtn}
                >
                  Go Live
                </button>
                <button
                  type="button"
                  onClick={() => void handleReconnectLive()}
                  className={secondaryHostBtn}
                >
                  Reconnect Live
                </button>
              </>
            ) : null}
            {isHost ? (
              <button
                type="button"
                onClick={() => {
                  syncLog("save session clicked", { view: roomViewModeRef.current });
                  void openSaveSessionDialog();
                }}
                className={secondaryHostBtn}
              >
                Save Session
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCopySyncViewerLink}
              disabled={!roomId}
              className={secondaryHostBtn}
            >
              {syncViewerLinkCopied ? "Link copied" : "Copy Viewer Link"}
            </button>
            <button
              type="button"
              onClick={handleHomeFromSync}
              className="rounded-lg border border-red-500/35 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:border-red-400/45 hover:bg-red-950/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
            >
              Home
            </button>
          </div>
        </div>

        {isHost && hostNotice ? (
          <p className="mb-3 text-xs text-amber-200">{hostNotice}</p>
        ) : null}

        {!isHost && (!s.ownerId || !user || s.ownerId !== user.uid) ? (
          <div className="mb-4 rounded-xl border border-white/[0.07] bg-zinc-950/40 px-4 py-3 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  This is a shared session.
                </div>
                {!user ? (
                  <div className="mt-1 text-sm text-zinc-300">
                    Sign in to save your own copy.
                  </div>
                ) : null}
                {copySharedError ? (
                  <div className="mt-1 text-sm text-red-200">
                    {copySharedError}
                  </div>
                ) : null}
              </div>
              {user ? (
                <button
                  type="button"
                  onClick={() => void handleCopySharedToMySessions()}
                  disabled={isCopyingShared}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-950/45 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-md shadow-black/30 transition hover:border-emerald-400/55 hover:bg-emerald-950/65 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCopyingShared ? "Saving…" : "Save to My Sessions"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="rounded-lg border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="mb-3 grid w-full grid-cols-1 gap-3 rounded-xl border border-white/[0.06] bg-zinc-950/35 p-3 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              View Mode
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setCoachViewMode("single")}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                  coachViewMode === "single"
                    ? "bg-blue-600/40 text-white"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                Single View
              </button>
              <button
                type="button"
                onClick={() => setCoachViewMode("multi")}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                  coachViewMode === "multi"
                    ? "bg-blue-600/40 text-white"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                Multi View
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Sync Status
            </div>
            <div className="flex items-center gap-2">
              {manualSyncBadgeVisible ? (
                <span className="rounded-md border border-emerald-500/40 bg-emerald-950/45 px-2 py-1 text-[11px] font-semibold text-emerald-100">
                  Manual Sync ✓
                </span>
              ) : (
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-zinc-300">
                  Unsynced
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Reset
            </div>
            <button
              type="button"
              onClick={() => handleResetManualSyncLock()}
              className="w-full rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-[12px] font-semibold text-zinc-100 transition hover:border-white/18 hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              Reset Sync
            </button>
          </div>

          {/* layoutMode removed: Single/Multi view only */}

          <div className="md:col-span-5">
            <div className="flex flex-col items-stretch gap-1.5">
              <div className="flex items-center justify-end gap-2">
                <div className="mr-auto text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Angles ({s.angles.length})
                </div>
                {isHost && (isLiveSource || s.clips.length === 1) ? (
                  <button
                    type="button"
                    onClick={() => void handleAddAngle()}
                    className="rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-[12px] font-semibold text-zinc-100 transition hover:border-white/18 hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                  >
                    + Add Angle
                  </button>
                ) : null}
              </div>
              {isHost && !isLiveSource ? (
                <p className="text-[10px] leading-snug text-zinc-500">
                  For live streams, use Go Live.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {showIndependentControls ? (
          <div className="mb-4 flex items-stretch justify-between gap-3 rounded-xl border border-blue-500/35 bg-blue-950/15 px-4 py-3 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase tracking-wide text-blue-200">
                SYNC SETUP MODE
              </div>
              <div className="mt-0.5 text-[12px] text-blue-100/80">
                Position both videos to the same real-world moment, then click{" "}
                <span className="font-semibold text-blue-100">
                  “Sync These Angles.”
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleManualSyncCancel}
                className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-zinc-100 transition hover:border-white/18 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleManualSyncTheseAngles()}
                className="rounded-lg border border-blue-400/35 bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              >
                Sync These Angles
              </button>
            </div>
          </div>
        ) : null}

        <div className="w-full">
          {isHost && multi ? (
            (() => {
              const featuredId =
                s.playerViewAngleId ?? s.currentAngleId ?? s.angles[0]!.id;
              const featuredIdx = Math.max(
                0,
                s.angles.findIndex((a) => a.id === featuredId),
              );
              const featured = s.angles[featuredIdx] ?? s.angles[0]!;
              const syncCarouselChrome = coachViewMode === "single" && (
                <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[50] flex flex-col items-center gap-1.5 px-3">
                  <div className="flex items-center gap-1">
                    {s.angles.map((a) => (
                      <span
                        key={a.id}
                        className={`rounded-full transition-all ${
                          a.id === featured.id
                            ? "h-1.5 w-5 bg-white"
                            : "h-1.5 w-1.5 bg-white/35"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="rounded-md bg-black/70 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md">
                    {featured.name}
                    <span className="text-zinc-400">
                      {" "}
                      · {featuredIdx + 1}/{s.angles.length}
                    </span>
                    <span className="max-md:inline md:hidden text-zinc-400">
                      {" "}
                      · swipe or tap
                    </span>
                  </div>
                </div>
              );
              return (
                <div
                  className={
                    coachViewMode === "multi"
                      ? "grid w-full grid-cols-1 gap-4 md:grid-cols-2"
                      : "relative isolate aspect-video w-full cursor-pointer overflow-hidden rounded-xl bg-black"
                  }
                  {...(coachViewMode === "single"
                    ? {
                        role: "button" as const,
                        tabIndex: 0,
                        title: "Tap for next angle · swipe left/right",
                        onTouchStart: handleSyncStackTouchStart,
                        onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) =>
                          handleSyncStackTouchEnd(e, featured.id),
                        onClick: () => handleSyncStackTapCycle(featured.id),
                        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSyncStackAngleCycle(1, featured.id);
                          } else if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            handleSyncStackAngleCycle(-1, featured.id);
                          } else if (e.key === "ArrowRight") {
                            e.preventDefault();
                            handleSyncStackAngleCycle(1, featured.id);
                          }
                        },
                      }
                    : {})}
                >
                  {s.angles.map((angle) => {
                    const isFeatured = angle.id === featured.id;
                    const outerClass =
                      coachViewMode === "multi"
                        ? `overflow-hidden rounded-xl bg-zinc-950/35 shadow-xl shadow-black/40 backdrop-blur-sm ${
                            s.playerViewAngleId &&
                            s.playerViewAngleId === angle.id
                              ? "border border-violet-500/45 ring-2 ring-violet-500/40"
                              : "border border-white/[0.07] ring-1 ring-white/[0.04]"
                          }`
                        : isFeatured
                          ? "absolute inset-0 z-10"
                          : "pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-0";
                    return (
                      <div
                        key={angle.id}
                        className={outerClass}
                        aria-hidden={coachViewMode === "single" && !isFeatured}
                      >
                        {coachViewMode === "multi" ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-emerald-400" />
                              <span className="truncate text-sm font-semibold text-zinc-100">
                                {angle.name}
                              </span>
                              {angle.id === s.currentAngleId ? (
                                <span className="rounded-md border border-blue-500/35 bg-blue-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-100">
                                  Game clock
                                </span>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                              {s.playerViewAngleId === angle.id ? (
                                <span className="rounded-md border border-violet-500/40 bg-violet-950/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-100">
                                  Player View
                                </span>
                              ) : null}
                              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-300">
                                <input
                                  type="radio"
                                  name="film-room-player-view"
                                  className="h-3.5 w-3.5 accent-violet-500"
                                  checked={s.playerViewAngleId === angle.id}
                                  onChange={() =>
                                    handleSetPlayerViewAngleId(angle.id)
                                  }
                                />
                                Player View
                              </label>
                              {showPerAngleLiveTiles ? (
                                <button
                                  type="button"
                                  className={perAngleLiveBtnClass}
                                  title="Seek this angle to near live edge (local only)"
                                  onClick={() =>
                                    void handleSyncAngleTileLive(angle.id)
                                  }
                                >
                                  Live
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <>
                            <span className="pointer-events-none absolute left-2 top-2 z-[40] rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white/90">
                              {angle.name}
                            </span>
                            {showPerAngleLiveTiles ? (
                              <button
                                type="button"
                                className={`pointer-events-auto absolute right-2 top-2 z-[45] ${perAngleLiveBtnClass}`}
                                title="Seek this angle to near live edge (local only)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleSyncAngleTileLive(angle.id);
                                }}
                              >
                                Live
                              </button>
                            ) : null}
                          </>
                        )}
                        <VideoZoomStage
                          drawLocked={drawGateOn}
                          showControls={
                            coachViewMode === "multi" || isFeatured
                          }
                          className={
                            coachViewMode === "multi"
                              ? "relative aspect-video w-full bg-black"
                              : "absolute inset-0 h-full w-full bg-black"
                          }
                        >
                          <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                            <YouTube
                              key={angle.id}
                              videoId={safeDecodeVideoId(angle.videoId)}
                              onReady={(e) => {
                                const pl = e.target as YouTubePlayer;
                                syncPlayerRefs.current[angle.id] = pl;
                                try {
                                  const iframe = (
                                    pl as YouTubePlayer & {
                                      getIframe?: () => HTMLElement;
                                    }
                                  ).getIframe?.();
                                  const stage =
                                    iframe?.parentElement?.parentElement;
                                  const w = stage?.clientWidth ?? 0;
                                  const h = stage?.clientHeight ?? 0;
                                  if (w > 2 && h > 2) {
                                    (
                                      pl as YouTubePlayer & {
                                        setSize?: (w: number, h: number) => void;
                                      }
                                    ).setSize?.(w, h);
                                  }
                                } catch {
                                  /* ignore */
                                }
                                if (angle.id === s.currentAngleId) {
                                  handlePlayerReady();
                                }
                                applySyncStateToAnglePlayer(
                                  angle.id,
                                  "host-sync-card-onReady",
                                );
                              }}
                              onStateChange={(e) =>
                                handleHostSyncAngleStateChange(angle.id, e)
                              }
                              className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
                              iframeClassName="h-full w-full border-0"
                              onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                            />
                          </YoutubePointerGate>
                          {debugUiEnabled ? (
                          <SyncAngleDebugStrip
                            angleId={angle.id}
                            angleName={angle.name}
                            videoId={safeDecodeVideoId(angle.videoId)}
                            syncPlayerRefs={syncPlayerRefs}
                            ytMeta={
                              ytDebugMetaByVideoId[
                                safeDecodeVideoId(angle.videoId)
                              ]
                            }
                            relaxApiMismatchForLiveSession={
                              s.sourceType === "live"
                            }
                          />
                          ) : null}
                          {roomId && coachViewMode === "single" && isFeatured ? (
                            <TelestratorOverlay
                              roomId={roomId}
                              isHost={isHost}
                              drawEnabled={telDrawOn}
                              onBroadcastStroke={broadcastTelestratorStroke}
                              strokeAngleId={featured.id}
                              renderAngleId={featured.id}
                              allowLegacyWithoutAngleId={false}
                            />
                          ) : roomId && coachViewMode === "multi" ? (
                            <TelestratorOverlay
                              roomId={roomId}
                              isHost={isHost}
                              drawEnabled={telDrawOn}
                              onBroadcastStroke={broadcastTelestratorStroke}
                              strokeAngleId={angle.id}
                              renderAngleId={angle.id}
                              allowLegacyWithoutAngleId={false}
                            />
                          ) : null}
                        </VideoZoomStage>
                        {coachViewMode === "multi" && showIndependentControls
                          ? renderSyncSetupControls({
                              label: angle.name,
                              which:
                                angle.id === s.currentAngleId
                                  ? "primary"
                                  : "secondary",
                              angleId: angle.id,
                              get: () =>
                                syncPlayerRefs.current[angle.id] ?? undefined,
                            })
                          : null}
                      </div>
                    );
                  })}
                  {syncCarouselChrome}
                </div>
              );
            })()
          ) : (
            <div
              className={`overflow-hidden rounded-xl bg-zinc-950/35 shadow-xl shadow-black/40 backdrop-blur-sm ${
                multi &&
                s.playerViewAngleId &&
                s.playerViewAngleId === activeAngle.id
                  ? "border border-violet-500/45 ring-2 ring-violet-500/40"
                  : "border border-white/[0.07] ring-1 ring-white/[0.04]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="truncate text-sm font-semibold text-zinc-100">
                    {multi ? `${activeAngle.name} (Active)` : activeAngle.name}
                  </span>
                  {multi ? (
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-zinc-200">
                      Main
                    </span>
                  ) : null}
                </div>
                {multi ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {s.playerViewAngleId === activeAngle.id ? (
                      <span className="rounded-md border border-violet-500/40 bg-violet-950/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-100">
                        Player View
                      </span>
                    ) : null}
                    {isHost ? (
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-300">
                        <input
                          type="radio"
                          name="film-room-player-view"
                          className="h-3.5 w-3.5 accent-violet-500"
                          checked={s.playerViewAngleId === activeAngle.id}
                          onChange={() =>
                            handleSetPlayerViewAngleId(activeAngle.id)
                          }
                        />
                        Player View
                      </label>
                    ) : null}
                    {showPerAngleLiveTiles ? (
                      <button
                        type="button"
                        className={perAngleLiveBtnClass}
                        title="Seek this angle to near live edge (local only)"
                        onClick={() =>
                          void handleSyncAngleTileLive(activeAngle.id)
                        }
                      >
                        Live
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="relative isolate aspect-video w-full overflow-hidden bg-black">
                {!isHost && !viewerPlaybackUnlocked ? (
                  <div className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/55 px-4">
                    <button
                      type="button"
                      onClick={handleViewerPlaybackUnlock}
                      className="rounded-xl border border-blue-500/35 bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-950/30 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                    >
                      Tap to join playback
                    </button>
                  </div>
                ) : null}
                {!isHost && multi ? (
                  <div
                    className="relative isolate h-full w-full cursor-pointer"
                    role="button"
                    tabIndex={0}
                    title="Tap for next angle · swipe left/right"
                    onTouchStart={handleSyncStackTouchStart}
                    onTouchEnd={(e) =>
                      handleSyncStackTouchEnd(e, viewerStackTopResolvedId)
                    }
                    onClick={() => {
                      if (!viewerPlaybackUnlocked) return;
                      handleSyncStackTapCycle(viewerStackTopResolvedId);
                    }}
                    onKeyDown={(e) => {
                      if (!viewerPlaybackUnlocked) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSyncStackAngleCycle(1, viewerStackTopResolvedId);
                      } else if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        handleSyncStackAngleCycle(-1, viewerStackTopResolvedId);
                      } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        handleSyncStackAngleCycle(1, viewerStackTopResolvedId);
                      }
                    }}
                  >
                    {s.angles.map((a) => {
                      const isMain = a.id === viewerStackTopResolvedId;
                      return (
                        <div
                          key={a.id}
                          className={
                            isMain
                              ? "absolute inset-0 z-10"
                              : "pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-0"
                          }
                          aria-hidden={!isMain}
                        >
                          <VideoZoomStage
                            drawLocked={drawGateOn}
                            showControls={isMain}
                            className="absolute inset-0 z-10 min-h-0 min-w-0 bg-black"
                          >
                            <YouTube
                              videoId={safeDecodeVideoId(a.videoId)}
                              onReady={(e) => {
                                const pl = e.target as YouTubePlayer;
                                syncPlayerRefs.current[a.id] = pl;
                                applySyncStateToAnglePlayer(
                                  a.id,
                                  "viewer-sync-onReady",
                                );
                              }}
                              className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
                              iframeClassName="h-full w-full border-0"
                              onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                            />
                          {roomId && isMain ? (
                            <TelestratorOverlay
                              roomId={roomId}
                              isHost={false}
                              drawEnabled={telDrawOn}
                              renderAngleId={viewerPlayerViewDrawAngleId}
                              allowLegacyWithoutAngleId
                              wrapClassName="pointer-events-none absolute inset-0 z-30 touch-none"
                              viewerDebug={debugUiEnabled}
                            />
                          ) : null}
                          </VideoZoomStage>
                        {!viewerPlaybackUnlocked && isMain ? (
                          <div className="pointer-events-auto absolute inset-0 z-[35] flex items-center justify-center bg-black/55 px-4">
                            <button
                              type="button"
                              onClick={handleViewerPlaybackUnlock}
                              className="rounded-xl border border-blue-500/35 bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-950/30 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                            >
                              Tap to join playback
                            </button>
                          </div>
                        ) : null}
                          {debugUiEnabled ? (
                          <SyncAngleDebugStrip
                            angleId={a.id}
                            angleName={a.name}
                            videoId={safeDecodeVideoId(a.videoId)}
                            syncPlayerRefs={syncPlayerRefs}
                            ytMeta={
                              ytDebugMetaByVideoId[
                                safeDecodeVideoId(a.videoId)
                              ]
                            }
                            relaxApiMismatchForLiveSession={
                              s.sourceType === "live"
                            }
                          />
                          ) : null}
                          {showPerAngleLiveTiles ? (
                            <button
                              type="button"
                              className={`pointer-events-auto absolute right-2 top-2 z-[55] ${perAngleLiveBtnClass}`}
                              title="Seek this angle to near live edge (local only)"
                              onClick={() => void handleSyncAngleTileLive(a.id)}
                            >
                              Live
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[50] flex flex-col items-center gap-1.5 px-3">
                      <div className="flex items-center gap-1">
                        {s.angles.map((a) => (
                          <span
                            key={a.id}
                            className={`rounded-full transition-all ${
                              a.id === viewerStackTopResolvedId
                                ? "h-1.5 w-5 bg-white"
                                : "h-1.5 w-1.5 bg-white/35"
                            }`}
                          />
                        ))}
                      </div>
                      <div className="rounded-md bg-black/70 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md">
                        {viewerTopAngleForLabel.name}
                        <span className="text-zinc-400">
                          {" "}
                          ·{" "}
                          {Math.max(
                            0,
                            s.angles.findIndex(
                              (x) => x.id === viewerStackTopResolvedId,
                            ),
                          ) + 1}
                          /{s.angles.length}
                        </span>
                        <span className="max-md:inline md:hidden text-zinc-400">
                          {" "}
                          · swipe or tap
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <VideoZoomStage
                    drawLocked={drawGateOn}
                    className="absolute inset-0 z-10 h-full w-full min-h-0 min-w-0 bg-black"
                  >
                    {!syncPrimaryVideoOk ? (
                      <div className="absolute inset-0 z-[30] flex flex-col items-center justify-center gap-2 bg-black px-4 text-center">
                        <p className="text-sm font-semibold text-zinc-100">
                          No playable YouTube video on this angle
                        </p>
                        <p className="max-w-sm text-[12px] leading-snug text-zinc-400">
                          Re-open Watch together from the game after adding an
                          embeddable YouTube source, or open the video on YouTube.
                        </p>
                      </div>
                    ) : null}
                    {embedError && syncPrimaryVideoOk ? (
                      <div className="absolute inset-0 z-[30] flex flex-col items-center justify-center gap-3 bg-black/90 px-4 text-center">
                        <p className="text-sm font-semibold text-amber-100">
                          Video won’t embed here
                        </p>
                        <p className="max-w-sm text-[12px] leading-snug text-amber-100/80">
                          Enable “Allow embedding” on the YouTube video, or watch
                          it on YouTube.
                        </p>
                        <a
                          href={`https://www.youtube.com/watch?v=${syncPrimaryVideoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-amber-300/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-amber-500/30"
                        >
                          Open on YouTube
                        </a>
                      </div>
                    ) : null}
                    <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                      {syncPrimaryVideoOk ? (
                        <YouTube
                          key={`sync-primary-${syncPrimaryVideoId}`}
                          ref={playerRef}
                          videoId={syncPrimaryVideoId}
                          onReady={(e) => {
                            const pl = e.target as YouTubePlayer;
                            syncPlayerRefs.current[activeAngle.id] = pl;
                            try {
                              const iframe = (
                                pl as YouTubePlayer & {
                                  getIframe?: () => HTMLElement;
                                }
                              ).getIframe?.();
                              const stage = iframe?.parentElement?.parentElement;
                              const w = stage?.clientWidth ?? 0;
                              const h = stage?.clientHeight ?? 0;
                              if (w > 2 && h > 2) {
                                (
                                  pl as YouTubePlayer & {
                                    setSize?: (w: number, h: number) => void;
                                  }
                                ).setSize?.(w, h);
                              }
                            } catch {
                              /* ignore */
                            }
                            handlePlayerReady();
                            applySyncStateToAnglePlayer(
                              activeAngle.id,
                              "sync-single-onReady",
                            );
                          }}
                          onStateChange={handleYoutubeStateChange}
                          className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
                          iframeClassName="h-full w-full border-0"
                          onError={handlePlayerError}
                          opts={youtubePlayerOpts}
                        />
                      ) : null}
                    </YoutubePointerGate>
                    {roomId ? (
                      <TelestratorOverlay
                        roomId={roomId}
                        isHost={isHost}
                        drawEnabled={telDrawOn}
                        onBroadcastStroke={broadcastTelestratorStroke}
                        strokeAngleId={isHost ? activeAngle.id : undefined}
                        renderAngleId={
                          isHost ? activeAngle.id : viewerPlayerViewDrawAngleId
                        }
                        allowLegacyWithoutAngleId
                        wrapClassName={
                          !isHost
                            ? "pointer-events-none absolute inset-0 z-30 touch-none"
                            : undefined
                        }
                        viewerDebug={debugUiEnabled}
                      />
                    ) : null}
                  </VideoZoomStage>
                )}
                {showPerAngleLiveTiles && !multi ? (
                  <button
                    type="button"
                    className={`pointer-events-auto absolute right-2 top-2 z-[55] ${perAngleLiveBtnClass}`}
                    title="Seek this angle to near live edge (local only)"
                    onClick={() =>
                      void handleSyncAngleTileLive(activeAngle.id)
                    }
                  >
                    Live
                  </button>
                ) : null}
                {debugUiEnabled && (!isHost && multi ? null : (
                  <SyncAngleDebugStrip
                    angleId={activeAngle.id}
                    angleName={activeAngle.name}
                    videoId={safeDecodeVideoId(activeAngle.videoId)}
                    syncPlayerRefs={syncPlayerRefs}
                    ytMeta={
                      ytDebugMetaByVideoId[
                        safeDecodeVideoId(activeAngle.videoId)
                      ]
                    }
                    relaxApiMismatchForLiveSession={
                      s.sourceType === "live"
                    }
                  />
                ))}
              </div>
              {!isHost && multi && !viewerPlaybackUnlocked ? (
                <div className="border-t border-white/[0.06] bg-zinc-900/55 px-3 py-2.5">
                  <p className="text-[11px] leading-snug text-zinc-400">
                    If playback is blocked, tap <span className="font-semibold text-zinc-200">Tap to join playback</span>{" "}
                    on the video.
                  </p>
                </div>
              ) : null}
              {showIndependentControls
                ? renderSyncSetupControls({
                    label: "Angle 1",
                    which: "primary",
                    angleId: activeAngle.id,
                    get: getPlayer,
                  })
                : null}
            </div>
          )}
        </div>

        <div className="mt-2 w-full rounded-lg border border-white/[0.06] bg-zinc-950/40 px-2.5 py-2 ring-1 ring-white/[0.04]">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Chapters / Marks
          </div>
          <div className="max-h-[140px] overflow-y-auto overscroll-y-contain pr-1">
            {chaptersDisplay.length === 0 ? (
              <p className="text-[11px] leading-snug text-zinc-500">
                {teamRoomMode
                  ? "No marks yet. Add them in Review."
                  : "No chapters yet. Add marks in Clip View."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {chaptersDisplay.map(({ chapter: ch, sourceIndex: i }) => {
                  const onQueuedClip =
                    ch.videoId === s.clips[s.currentClipIndex]?.videoId;
                  const taggedAngle =
                    s.angles.find((a) => a.videoId === ch.videoId) ?? null;
                  const onActiveSurface = onQueuedClip || taggedAngle != null;
                  const isCurrentChapter =
                    activeChapterIndex !== null && activeChapterIndex === i;
                  return (
                    <li key={`sync-marks-${ch.videoId}-${ch.time}-${ch.label}-${i}`}>
                      <div className="flex min-w-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={!isHost}
                          title={
                            isHost ? undefined : "Only the host can jump to marks"
                          }
                          onClick={() => void jumpToChapter(ch)}
                          className={`min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 text-left text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-45 ${
                            isCurrentChapter && onActiveSurface
                              ? "border-blue-500/80 bg-blue-600/40 text-white ring-1 ring-blue-400/40"
                              : onActiveSurface
                                ? "border-white/10 bg-black/30 text-zinc-100 hover:border-white/18 hover:bg-black/45"
                                : "border-white/6 bg-black/20 text-zinc-400 hover:border-white/12"
                          }`}
                        >
                          <span className="font-medium text-zinc-100">
                            {ch.label}
                          </span>
                          <span className="ml-1.5 font-mono text-[10px] text-zinc-400">
                            {formatChapterTime(ch.gameTime ?? ch.time)}
                          </span>
                          {taggedAngle && !onQueuedClip ? (
                            <span className="ml-1 text-[9px] text-zinc-500">
                              · {taggedAngle.name}
                            </span>
                          ) : !onActiveSurface ? (
                            <span className="ml-1 text-[9px] text-amber-400/80">
                              (other clip)
                            </span>
                          ) : null}
                        </button>
                        {isHost && !teamRoomMode ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRenameChapter(i)}
                              className={miniHostBtn}
                              title="Rename chapter"
                            >
                              Ren
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteChapter(i)}
                              className="shrink-0 rounded-md border border-white/10 px-1.5 py-1.5 text-[10px] font-medium text-zinc-400 transition hover:border-red-500/35 hover:bg-red-950/25 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                              aria-label={`Delete chapter ${ch.label}`}
                            >
                              ×
                            </button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {isHost ? (
          <div className="mt-3 w-full">
            {!teamRoomMode ? (
              <GameMarksToolbar
                variant="band"
                busy={gameMarksBusy}
                onQuickMark={(lbl) => void handleCreateGameMark(lbl)}
                onCustomMark={handleGameMarkCustomPrompt}
              />
            ) : null}
            <div
              className={`${hostControlsBar} mt-2 ${
                isManualSyncMode ? "pointer-events-none opacity-35" : ""
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  roomState?.isPlaying ? handlePause() : handlePlay()
                }
                className={hostChip}
              >
                {roomState?.isPlaying ? "Pause" : "Play"}
              </button>
              {isFacebookRoom ? (
                <button
                  type="button"
                  onClick={() => setFbLandscapeCaptureOpen(true)}
                  className={`${hostChip} border-blue-500/40 text-blue-100`}
                  title="Full-screen 16:9 landscape tab capture"
                >
                  Landscape capture
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSeekLiveBack30}
                className={hostChip}
              >
                -30s
              </button>
              <button type="button" onClick={handleSeekBack} className={hostChip}>
                -10s
              </button>
              <button
                type="button"
                onClick={() => void handlePrevChapter()}
                className={`${hostChip} ${
                  chapterNavFlash === "prev"
                    ? "ring-2 ring-blue-400/50 border-blue-500/40"
                    : ""
                }`}
                title="Previous mark or chapter"
              >
                Prev mark
              </button>
              <button
                type="button"
                onClick={() => void handleNextChapter()}
                className={`${hostChip} ${
                  chapterNavFlash === "next"
                    ? "ring-2 ring-blue-400/50 border-blue-500/40"
                    : ""
                }`}
                title="Next mark or chapter"
              >
                Next mark
              </button>
              <button type="button" onClick={cycleFf} className={hostChip}>
                {ffMode === 0
                  ? "FF"
                  : ffMode === 2
                    ? "FF 2×"
                    : ffMode === 4
                      ? "FF 4×"
                      : "FF 8×"}
              </button>
              {HOST_SPEEDS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleSpeed(r)}
                  className={`${hostChip} ${
                    Math.abs(displayRate - r) < 0.01
                      ? "border-blue-500/55 bg-blue-950/45 text-blue-100"
                      : ""
                  }`}
                >
                  {r === 1 ? "1×" : `${r}×`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleManualFineTuneSecondaryOffset(-1)}
                className={hostChip}
                title="Manual fine-tune: shift secondary −1s"
              >
                −1s
              </button>
              <button
                type="button"
                onClick={() => handleManualFineTuneSecondaryOffset(1)}
                className={hostChip}
                title="Manual fine-tune: shift secondary +1s"
              >
                +1s
              </button>
              {showHostMarkPlay ? (
                <button
                  type="button"
                  onClick={() => void handleMarkPlay()}
                  className={`${hostChip} ${
                    markPlayState === "marked"
                      ? "border-emerald-500/55 bg-emerald-950/50 font-semibold text-emerald-100 ring-2 ring-emerald-400/40 shadow-[0_0_12px_-4px_rgba(16,185,129,0.45)]"
                      : ""
                  }`}
                >
                  {markPlayState === "marked" ? "Marked" : "Mark Play"}
                </button>
              ) : null}
              {isLiveRoom ? (
                <button
                  type="button"
                  onClick={handleJumpLiveEdge}
                  className={`${hostChipSync} border-red-500/35 font-semibold text-red-100`}
                >
                  LIVE
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setTelDrawOn((v) => !v)}
                className={hostChip}
              >
                {telDrawOn ? "Draw Off" : "Draw On"}
              </button>
              <button
                type="button"
                onClick={handleClearDrawings}
                className={hostChip}
              >
                Clear Drawings
              </button>
              {showResetSyncBtn ? (
                <button
                  type="button"
                  onClick={handleResetManualSyncLock}
                  className={hostChip}
                >
                  Reset Sync
                </button>
              ) : null}
            </div>
            {isHost && (uiDuration ?? 0) > 0.25 ? (
              <div
                className={`mt-2 w-full ${
                  isManualSyncMode ? "pointer-events-none opacity-35" : ""
                }`}
              >
                <div className="flex items-center justify-between px-1 text-[10px] font-medium text-zinc-300">
                  <span className="font-mono tabular-nums">
                    {formatCountdownMmSs(hostScrubDraft ?? uiPlaybackTime ?? 0)}
                  </span>
                  <span className="font-mono tabular-nums text-zinc-400">
                    {formatCountdownMmSs(uiDuration ?? 0)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={uiDuration ?? 0}
                  step={0.05}
                  value={hostScrubDraft ?? uiPlaybackTime ?? 0}
                  onPointerDown={() => {
                    hostScrubActiveRef.current = true;
                  }}
                  onPointerUp={() => {
                    hostScrubActiveRef.current = false;
                    if (hostScrubDraft !== null) {
                      handleHostScrubCommit(hostScrubDraft);
                      setHostScrubDraft(null);
                    }
                  }}
                  onTouchEnd={() => {
                    hostScrubActiveRef.current = false;
                    if (hostScrubDraft !== null) {
                      handleHostScrubCommit(hostScrubDraft);
                      setHostScrubDraft(null);
                    }
                  }}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    if (Number.isFinite(v)) setHostScrubDraft(v);
                  }}
                  className="mt-1 w-full accent-blue-500"
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {copySharedToast ? (
          <div
            className="pointer-events-none fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 text-sm font-medium text-emerald-100 shadow-lg shadow-black/40 ring-1 ring-emerald-500/25"
            role="status"
          >
            Session copied
          </div>
        ) : null}
      </div>
      {sessionSavedToast ? (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 text-sm font-medium text-emerald-100 shadow-lg shadow-black/40 ring-1 ring-emerald-500/25"
          role="status"
        >
          Session saved
        </div>
      ) : null}
      {copySharedToast ? (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 text-sm font-medium text-emerald-100 shadow-lg shadow-black/40 ring-1 ring-emerald-500/25"
          role="status"
        >
          Session copied
        </div>
      ) : null}
      {coachAlertToast ? (
        <CoachAlertToastOverlay
          alert={coachAlertToast}
          onJump={() => {
            void handleJumpToMarkReplay({
              timestamp: coachAlertToast.timestamp,
              angleId: coachAlertToast.angleId,
            });
            handleDismissCoachAlert();
          }}
          onDismiss={handleDismissCoachAlert}
        />
      ) : null}
      {leaveConfirmOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLeaveConfirmOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950/95 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/[0.05]"
            role="dialog"
            aria-labelledby="leave-confirm-title"
          >
            <h2
              id="leave-confirm-title"
              className="mb-2 text-sm font-semibold text-white"
            >
              Save session before leaving?
            </h2>
            <p className="mb-4 text-sm text-zinc-300">
              You have unsaved changes in this session.
            </p>
            {leaveConfirmError ? (
              <p className="mb-3 text-sm text-red-200">{leaveConfirmError}</p>
            ) : null}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  if (saveSessionSaving) return;
                  goHomeAfterSaveRef.current = true;
                  void openSaveSessionDialog();
                }}
                className="w-full rounded-lg border border-blue-500/40 bg-blue-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={saveSessionSaving}
              >
                Save &amp; Go Home
              </button>
              <button
                type="button"
                onClick={() => {
                  goHomeAfterSaveRef.current = false;
                  setLeaveConfirmOpen(false);
                  setLeaveConfirmError(null);
                  goHome();
                }}
                className="w-full rounded-lg border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                Go Home Without Saving
              </button>
              <button
                type="button"
                onClick={() => {
                  goHomeAfterSaveRef.current = false;
                  setLeaveConfirmOpen(false);
                  setLeaveConfirmError(null);
                }}
                className={secondaryHostBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

  return (
    <>
    {embedErrorBanner}
    <div
      className={`flex min-h-screen flex-col text-zinc-50 ${
        cleanMode
          ? "fixed inset-0 z-40 flex h-[100dvh] w-[100dvw] flex-col overflow-hidden bg-[#030306] p-0"
          : "px-4 py-6"
      }`}
    >
      {!cleanMode ? (
        <>
          <button
            type="button"
            onClick={handleReturnHome}
            className={returnHomeBtnClass}
          >
            ← Home
          </button>
          {gameHubNavLink}
        </>
      ) : null}
      <div
        className={`mx-auto flex w-full flex-1 flex-col min-h-0 ${
          cleanMode
            ? "max-w-none justify-center md:min-h-0"
            : isManualSyncMode
              ? "max-w-none"
              : "max-w-3xl"
        }`}
      >
        {!cleanMode ? (
          <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4 text-sm text-zinc-400">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => navigateRoomView("clip")}
                  disabled={teamRoomMode}
                  title={
                    teamRoomMode ? "Watch together uses Sync View" : undefined
                  }
                  className={`rounded-md px-3 py-1 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    roomViewMode === "clip"
                      ? "bg-blue-600/40 text-white"
                      : "text-zinc-300 hover:text-white"
                  }`}
                >
                  Clip View
                </button>
                <button
                  type="button"
                  onClick={() => navigateRoomView("sync")}
                  className={`rounded-md px-3 py-1 text-[12px] font-semibold transition ${
                    roomViewMode === "sync"
                      ? "bg-blue-600/40 text-white"
                      : "text-zinc-300 hover:text-white"
                  }`}
                >
                  Sync View
                </button>
              </div>
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
            </div>
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
                  onClick={() => void handleReconnectLive()}
                  className={secondaryHostBtn}
                >
                  Reconnect Live
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

        {!cleanMode && !isHost && roomState && (!roomState.ownerId || !user || roomState.ownerId !== user.uid) ? (
          <div className={frPanel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={frPanelTitle}>This is a shared session.</p>
                {!user ? (
                  <p className="text-sm text-zinc-300">
                    Sign in to save your own copy.
                  </p>
                ) : null}
                {copySharedError ? (
                  <p className="text-sm text-red-200">{copySharedError}</p>
                ) : null}
              </div>
              {user ? (
                <button
                  type="button"
                  onClick={() => void handleCopySharedToMySessions()}
                  disabled={isCopyingShared}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-950/45 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-md shadow-black/30 transition hover:border-emerald-400/55 hover:bg-emerald-950/65 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCopyingShared ? "Saving…" : "Save to My Sessions"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className={secondaryHostBtn}
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        ) : null}

        {!cleanMode && roomState && !teamRoomMode ? (
          <div className={`${frPanel} mb-3`}>
            <GameMarksToolbar
              busy={gameMarksBusy}
              onQuickMark={(lbl) => void handleCreateGameMark(lbl)}
              onCustomMark={handleGameMarkCustomPrompt}
            />
            {gameMarks.length > 0 ? (
              <div className="mt-3 max-h-40 overflow-y-auto border-t border-white/[0.08] pt-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Recent marks
                </div>
                <ul className="mt-1.5 space-y-1.5">
                  {gameMarks.slice(0, 40).map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-black/25 px-2 py-1.5 text-[11px]"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-zinc-100">{m.label}</span>
                        <span className="ml-2 font-mono text-zinc-400 tabular-nums">
                          {formatCountdownMmSs(m.timestamp)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-blue-500/40 bg-blue-950/50 px-2 py-0.5 text-[10px] font-semibold text-blue-100 transition hover:bg-blue-900/55"
                        onClick={() => {
                          void handleJumpToMarkReplay({
                            timestamp: m.timestamp,
                            angleId: m.angleId,
                          });
                        }}
                      >
                        Jump
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {!cleanMode && isHost && roomState && reelSteps.length > 0 ? (
          <div className="mb-3">
            <RoomReelBar
              steps={reelSteps}
              reelName={reelName ?? undefined}
              labelForSource={reelLabelForSource}
              getActiveTime={getCutGameTime}
              applyStep={applyReelStep}
              onStop={stopReelPlayback}
            />
          </div>
        ) : null}

        {!cleanMode && user && roomState && roomState.angles.length > 1 && !teamRoomMode ? (
          <div className={`${frPanel} mb-3`}>
            <CutStudio
              gameId={gameIdFromUrl}
              userId={user.uid}
              userName={user.displayName ?? undefined}
              getSnapshot={getCutSnapshot}
              getTime={getCutGameTime}
              applyLayout={cutApplyLayout}
              applyActiveSource={cutApplyActiveSource}
              applyPlayerView={cutApplyPlayerView}
            />
          </div>
        ) : null}

        {roomViewMode === "clip" && !isManualSyncMode && isHost && roomState && !cleanMode ? (
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

        {roomViewMode === "clip" && !isManualSyncMode && roomState && isHost && !cleanMode ? (
          <div className={frPanel}>
            <p className={frPanelTitle}>Chapters</p>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {!teamRoomMode ? (
                <button
                  type="button"
                  onClick={() => void handleAddChapter()}
                  className={secondaryHostBtn}
                >
                  Add Chapter
                </button>
              ) : null}
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
              <p className="text-xs text-zinc-400">
                {teamRoomMode
                  ? "No marks yet. Add them in Review."
                  : "No chapters yet."}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {chaptersDisplay.map(({ chapter: ch, sourceIndex: i }) => {
                  const onQueuedClip =
                    ch.videoId ===
                    roomState.clips[roomState.currentClipIndex]?.videoId;
                  const taggedAngle =
                    roomState.angles.find((a) => a.videoId === ch.videoId) ??
                    null;
                  const onActiveSurface = onQueuedClip || taggedAngle != null;
                  const isCurrentChapter =
                    activeChapterIndex !== null && activeChapterIndex === i;
                  return (
                    <li key={`${ch.videoId}-${ch.time}-${ch.label}-${i}`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void jumpToChapter(ch)}
                          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left text-xs transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-[0.99] active:brightness-95 ${
                            isCurrentChapter && onActiveSurface
                              ? "border-blue-500/80 bg-blue-600/40 text-white ring-2 ring-blue-400/45 shadow-lg shadow-blue-950/30"
                              : onActiveSurface
                                ? "border-blue-500/25 bg-blue-950/30 text-zinc-100 ring-1 ring-blue-500/15 hover:border-blue-400/35 hover:bg-blue-950/45"
                                : "border-white/8 bg-black/35 text-zinc-200 hover:border-white/15 hover:bg-black/55"
                          }`}
                        >
                          <span className="font-medium text-white">
                            {ch.label}
                          </span>
                          <span
                            className={`ml-2 font-mono ${
                              isCurrentChapter && onActiveSurface
                                ? "text-blue-100/90"
                                : "text-zinc-400"
                            }`}
                          >
                            {formatChapterTime(ch.gameTime ?? ch.time)}
                          </span>
                          {taggedAngle && !onQueuedClip ? (
                            <span className="ml-2 text-[10px] text-zinc-500">
                              · {taggedAngle.name}
                            </span>
                          ) : !onActiveSurface ? (
                            <span className="ml-2 text-[10px] text-amber-400/85">
                              (other clip)
                            </span>
                          ) : null}
                        </button>
                        {!teamRoomMode ? (
                          <>
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
                          </>
                        ) : null}
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

        {isHost &&
        isManualSyncMode &&
        coachViewMode === "multi" &&
        roomState?.angles?.length &&
        roomState.angles.length > 1 &&
        !cleanMode ? (
          <div className="mb-3">
            <div className="flex items-stretch justify-between gap-3 rounded-xl border border-blue-500/35 bg-blue-950/15 px-4 py-3 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]">
              <div className="min-w-0">
                <div className="text-[12px] font-extrabold uppercase tracking-wide text-blue-200">
                  Sync Setup Mode
                </div>
                <div className="mt-0.5 text-[12px] text-blue-100/80">
                  Position both videos to the same real-world moment, then click{" "}
                  <span className="font-semibold text-blue-100">
                    “Sync These Angles.”
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualSyncCancel}
                  className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-zinc-100 transition hover:border-white/18 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleManualSyncTheseAngles()}
                  className="rounded-lg border border-blue-400/35 bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                >
                  Sync These Angles
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {roomViewMode === "clip" ? (
          <div
            className={`relative w-full overflow-hidden bg-black ${
              cleanMode
                ? "flex min-h-0 w-full flex-1 flex-col rounded-none ring-0 shadow-none md:h-[100dvh] md:w-[100dvw] md:overflow-hidden"
                : "rounded-xl ring-1 ring-white/10 shadow-2xl shadow-black/50"
            }`}
          >
          {cleanMode ? (
            <div className="flex min-h-0 flex-1 flex-col max-md:overflow-y-auto max-md:overscroll-y-contain md:min-h-0 md:flex-1 md:overflow-hidden">
          {/*
            Always keep aspect-video: absolutely positioned YouTube/iframe does not
            contribute height — flex-1/min-h-0 without aspect ratio collapsed the
            player (black screen) after unlock on some mobile watch layouts.
          */}
          <div
            className={`relative aspect-video w-full shrink-0 overflow-hidden md:aspect-auto md:min-h-0 md:flex-1 ${
              fsActive ? "min-h-[100dvh] md:min-h-0" : ""
            }`}
            onClick={(e) => {
              if (fullscreenAngleId !== null) return;
              handleToggleCleanMode(e);
            }}
          >
            {hostMultiAngles ? (
              true ? (
                <div
                  className={`absolute inset-0 flex min-h-0 flex-1 flex-col gap-1 bg-black ${fsStageClass}`}
                >
                  <div
                    className={`${
                      !hostFocusAngleId ||
                      hostFocusAngleId === hostMultiAngles.activeAngle.id
                        ? "relative min-h-0 flex-1 overflow-hidden"
                        : "absolute bottom-3 right-3 z-[24] aspect-video w-[min(38vw,15rem)] max-w-[42%] cursor-pointer overflow-hidden rounded-lg border-2 border-white/35 bg-black shadow-xl ring-1 ring-black/50"
                    }`}
                    role={
                      !hostFocusAngleId ||
                      hostFocusAngleId === hostMultiAngles.activeAngle.id
                        ? undefined
                        : "button"
                    }
                    tabIndex={
                      !hostFocusAngleId ||
                      hostFocusAngleId === hostMultiAngles.activeAngle.id
                        ? undefined
                        : 0
                    }
                    title={
                      !hostFocusAngleId ||
                      hostFocusAngleId === hostMultiAngles.activeAngle.id
                        ? undefined
                        : "Tap to swap focus/PiP (no reload)"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        hostFocusAngleId &&
                        hostFocusAngleId !== hostMultiAngles.activeAngle.id
                      ) {
                        handleFocusPipSwap();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        !hostFocusAngleId ||
                        hostFocusAngleId === hostMultiAngles.activeAngle.id
                      ) {
                        return;
                      }
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleFocusPipSwap();
                      }
                    }}
                  >
                    {!hostFocusAngleId ||
                    hostFocusAngleId === hostMultiAngles.activeAngle.id ? (
                      <span className="pointer-events-none absolute left-2 top-2 z-[2] rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white/90">
                        {hostMultiAngles.activeAngle.name}
                      </span>
                    ) : (
                      <span className="pointer-events-none absolute left-1 top-1 z-[2] rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white/90">
                        Tap to switch
                      </span>
                    )}
                    <VideoZoomStage
                      drawLocked={drawGateOn}
                      showControls={
                        !hostFocusAngleId ||
                        hostFocusAngleId === hostMultiAngles.activeAngle.id
                      }
                      className="absolute inset-0 h-full w-full bg-black"
                    >
                    <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                      <YouTube
                        key={fsMA?.activeAngle.id ?? "active"}
                        videoId={safeDecodeVideoId(
                          fsMA?.activeAngle.videoId ?? "",
                        )}
                        onReady={(e) => {
                          const p = e.target as YouTubePlayer;
                          syncPlayerRefs.current[hostMultiAngles.activeAngle.id] =
                            p;
                          if (
                            hostMultiAngles.activeAngle.id ===
                            roomStateRef.current?.currentAngleId
                          ) {
                            handlePlayerReady();
                          }
                          applySyncStateToAnglePlayer(
                            hostMultiAngles.activeAngle.id,
                            "clean-sync-active-onReady",
                          );
                        }}
                        onStateChange={handleYoutubeStateChange}
                        className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                        onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                      />
                    </YoutubePointerGate>
                    </VideoZoomStage>
                    {renderSyncSetupControls({
                      label: hostMultiAngles.activeAngle.name,
                      which: "primary",
                      angleId: hostMultiAngles.activeAngle.id,
                      get: getPlayer,
                    })}
                  </div>
                  <div
                    className={`${
                      !hostFocusAngleId ||
                      hostFocusAngleId === hostMultiAngles.activeAngle.id
                        ? "absolute bottom-3 right-3 z-[24] aspect-video w-[min(38vw,15rem)] max-w-[42%] cursor-pointer overflow-hidden rounded-lg border-2 border-white/35 bg-black shadow-xl ring-1 ring-black/50"
                        : "relative min-h-0 flex-1 overflow-hidden"
                    }`}
                    role={
                      !hostFocusAngleId ||
                      hostFocusAngleId === hostMultiAngles.activeAngle.id
                        ? "button"
                        : undefined
                    }
                    tabIndex={
                      !hostFocusAngleId ||
                      hostFocusAngleId === hostMultiAngles.activeAngle.id
                        ? 0
                        : undefined
                    }
                    title={
                      !hostFocusAngleId ||
                      hostFocusAngleId === hostMultiAngles.activeAngle.id
                        ? "Tap to swap focus/PiP (no reload)"
                        : undefined
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        !hostFocusAngleId ||
                        hostFocusAngleId === hostMultiAngles.activeAngle.id
                      ) {
                        handleFocusPipSwap();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        hostFocusAngleId &&
                        hostFocusAngleId !== hostMultiAngles.activeAngle.id
                      ) {
                        return;
                      }
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleFocusPipSwap();
                      }
                    }}
                  >
                    {!hostFocusAngleId ||
                    hostFocusAngleId === hostMultiAngles.activeAngle.id ? (
                      <span className="pointer-events-none absolute left-1 top-1 z-[2] rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white/90">
                        Tap to switch
                      </span>
                    ) : (
                      <span className="pointer-events-none absolute left-2 top-2 z-[2] rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white/90">
                        {hostMultiAngles.secondaryAngle.name}
                      </span>
                    )}
                    <VideoZoomStage
                      drawLocked={drawGateOn}
                      showControls={
                        hostFocusAngleId === hostMultiAngles.secondaryAngle.id
                      }
                      className="absolute inset-0 h-full w-full bg-black"
                    >
                    <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                      <YouTube
                        key={hostMultiAngles.secondaryAngle.id}
                        videoId={safeDecodeVideoId(
                          hostMultiAngles.secondaryAngle.videoId,
                        )}
                        onReady={(e) => {
                          const p = e.target as YouTubePlayer;
                          syncPlayerRefs.current[
                            fsMA?.secondaryAngle.id ?? ""
                          ] = p;
                          applySyncStateToAnglePlayer(
                            fsMA?.secondaryAngle.id ?? "",
                            "clean-sync-secondary-onReady",
                          );
                        }}
                        onStateChange={(e) =>
                          handleHostSyncAngleStateChange(
                            fsMA?.secondaryAngle.id ?? "",
                            e,
                          )
                        }
                        className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                        onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                      />
                    </YoutubePointerGate>
                    </VideoZoomStage>
                        <span className="pointer-events-none absolute left-1 top-1 z-[1] rounded bg-black/75 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/90">
                      {hostMultiAngles.secondaryAngle.name}
                    </span>
                    {multiViewSecondaryHold &&
                    multiViewSecondaryHold.angleId ===
                      hostMultiAngles.secondaryAngle.id ? (
                      <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center bg-black/55 px-2 text-center">
                        <div className="rounded-lg border border-white/10 bg-zinc-950/80 px-2 py-1.5 text-[10px] font-semibold text-white shadow-lg shadow-black/40">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-300">
                            {hostMultiAngles.secondaryAngle.name}
                          </p>
                          <p className="mt-0.5 font-mono tabular-nums text-xs">
                            {formatCountdownMmSs(
                              multiViewSecondaryHold.countdownSec,
                            )}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {renderSyncSetupControls({
                      label: fsMA?.secondaryAngle.name ?? "Angle",
                      which: "secondary",
                      angleId: fsMA?.secondaryAngle.id ?? "",
                      get: () =>
                        syncPlayerRefs.current[
                          fsMA?.secondaryAngle.id ?? ""
                        ] ?? undefined,
                    })}
                  </div>
                </div>
              ) : (
                <div
                  className={`absolute inset-0 gap-1 bg-black ${fsGridLayoutMode ? "relative" : "grid grid-cols-1 md:grid-cols-2"} ${fsStageClass}`}
                >
                  <div
                    className={
                      fsGridPrimaryBig
                        ? fsGridBigCls
                        : fsGridLayoutMode
                          ? fsGridPipCls
                          : "relative min-h-0 overflow-hidden"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (fsGridLayoutMode) {
                        applyHostMultiFullscreenTarget(
                          fsMA?.activeAngle.id ?? "",
                        );
                      }
                    }}
                  >
                    <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                      <YouTube
                        key={fsMA?.activeAngle.id ?? "active"}
                        videoId={safeDecodeVideoId(fsMA?.activeAngle.videoId ?? "")}
                        onReady={(e) => {
                          const p = e.target as YouTubePlayer;
                          syncPlayerRefs.current[fsMA?.activeAngle.id ?? ""] =
                            p;
                          if (
                            fsMA?.activeAngle.id ===
                            roomStateRef.current?.currentAngleId
                          ) {
                            handlePlayerReady();
                          }
                          applySyncStateToAnglePlayer(
                            fsMA?.activeAngle.id ?? "",
                            "clean-sync-active-onReady",
                          );
                        }}
                        onStateChange={handleYoutubeStateChange}
                        className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                        onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                      />
                    </YoutubePointerGate>
                    {renderSyncSetupControls({
                      label: fsMA?.activeAngle.name ?? "Angle",
                      which: "primary",
                      angleId: fsMA?.activeAngle.id ?? "",
                      get: getPlayer,
                    })}
                  </div>
                  <div
                    className={
                      fsGridSecondaryBig
                        ? fsGridBigCls
                        : fsGridLayoutMode
                          ? fsGridPipCls
                          : "relative min-h-0 cursor-pointer overflow-hidden"
                    }
                    title={
                      fsGridLayoutMode
                        ? "Tap to enlarge this angle (no reload)"
                        : "Tap to make this the active angle (audio here)"
                    }
                    role="presentation"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (fsGridLayoutMode) {
                        applyHostMultiFullscreenTarget(
                          fsMA?.secondaryAngle.id ?? "",
                        );
                      } else {
                        void handleSelectAngle(fsMA?.secondaryAngle.id ?? "");
                      }
                    }}
                  >
                    <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                      <YouTube
                        key={fsMA?.secondaryAngle.id ?? "secondary"}
                        videoId={safeDecodeVideoId(
                          fsMA?.secondaryAngle.videoId ?? "",
                        )}
                        onReady={(e) => {
                          const p = e.target as YouTubePlayer;
                          syncPlayerRefs.current[
                            fsMA?.secondaryAngle.id ?? ""
                          ] = p;
                          applySyncStateToAnglePlayer(
                            fsMA?.secondaryAngle.id ?? "",
                            "clean-sync-secondary-onReady",
                          );
                        }}
                        onStateChange={(e) =>
                          handleHostSyncAngleStateChange(
                            fsMA?.secondaryAngle.id ?? "",
                            e,
                          )
                        }
                        className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                        onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                      />
                    </YoutubePointerGate>
                    {multiViewSecondaryHold?.angleId ===
                      (fsMA?.secondaryAngle.id ?? "") ? (
                      <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center bg-black/55 px-3 text-center">
                        <div className="rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-[11px] font-semibold text-white shadow-lg shadow-black/40">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">
                            {fsMA?.secondaryAngle.name ?? "Angle"}
                          </p>
                          <p className="mt-1 text-sm">
                            Angle starts in{" "}
                            <span className="font-mono tabular-nums">
                              {formatCountdownMmSs(
                                multiViewSecondaryHold?.countdownSec ?? 0,
                              )}
                            </span>
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {renderSyncSetupControls({
                      label: fsMA?.secondaryAngle.name ?? "Angle",
                      which: "secondary",
                      angleId: fsMA?.secondaryAngle.id ?? "",
                      get: () =>
                        syncPlayerRefs.current[
                          fsMA?.secondaryAngle.id ?? ""
                        ] ?? undefined,
                    })}
                  </div>
                </div>
              )
            ) : (
              <VideoZoomStage
                drawLocked={drawGateOn}
                className={`absolute inset-0 bg-black ${fsStageClass}`}
              >
                {isFacebookRoom && facebookEmbedHref ? (
                  <FacebookVideoPlayer
                    key={`fb-${facebookEmbedHref}`}
                    href={facebookEmbedHref}
                    className="absolute left-0 top-0 h-full w-full"
                    onReady={(player) => {
                      facebookPlayerRef.current = player;
                      handlePlayerReady();
                    }}
                    onError={(message) => {
                      setEmbedError({ code: -1, videoId: effectiveVideoId });
                      console.warn("[FB] embed error:", message);
                    }}
                  />
                ) : isFacebookRoom ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black px-4 text-center text-sm text-zinc-300">
                    Facebook video URL missing for this clip. Re-add the clip from
                    a facebook.com link.
                  </div>
                ) : (
                  <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                    <YouTube
                      key={
                        isHost
                          ? `host-${safeDecodeVideoId(effectiveVideoId)}`
                          : `viewer-${safeDecodeVideoId(effectiveVideoId)}`
                      }
                      ref={playerRef}
                      videoId={safeDecodeVideoId(effectiveVideoId)}
                      onReady={handlePlayerReady}
                      onStateChange={handleYoutubeStateChange}
                      className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                      onError={handlePlayerError}
                      opts={youtubePlayerOpts}
                    />
                  </YoutubePointerGate>
                )}
                <TelestratorOverlay
                  roomId={roomId}
                  isHost={isHost}
                  drawEnabled={telDrawOn}
                  wrapClassName={telestratorWrapFs}
                />
              </VideoZoomStage>
            )}
            {fsActive ? (
              <button
                type="button"
                onClick={() => setFullscreenAngleId(null)}
                className="fixed right-3 top-3 z-[10020] rounded-lg border border-white/20 bg-black/85 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              >
                Exit Fullscreen
              </button>
            ) : null}
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
          </div>
            {isHost && !isManualSyncMode ? (
            <div className="z-30 w-full shrink-0 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
              <div
                ref={hostControlsRef}
                className="mx-auto flex w-full max-w-none flex-col items-center gap-1.5"
              >
                {isLiveRoom ? (
                  <span className="pointer-events-none rounded-full border border-red-500/40 bg-red-950/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-100 shadow-sm shadow-red-950/40">
                    LIVE
                  </span>
                ) : null}
                <div
                  className={`w-full ${isManualSyncMode ? "" : ""}`}
                  aria-hidden={isManualSyncMode}
                >
                  <div
                    className={`${hostControlsBarClean} ${
                      isManualSyncMode ? "pointer-events-none opacity-35" : ""
                    }`}
                  >
                  <button
                    type="button"
                    onClick={() =>
                      roomState?.isPlaying ? handlePause() : handlePlay()
                    }
                    className={hostChipClean}
                  >
                    {roomState?.isPlaying ? "Pause" : "Play"}
                  </button>
                  {isFacebookRoom ? (
                    <button
                      type="button"
                      onClick={() => setFbLandscapeCaptureOpen(true)}
                      className={`${hostChipClean} border-blue-500/40 text-blue-100`}
                      title="Full-screen 16:9 landscape tab capture"
                    >
                      Landscape capture
                    </button>
                  ) : null}
                  {isFacebookRoom ? (
                    <button
                      type="button"
                      onClick={() => void handleShareLessonPlan()}
                      disabled={sharingLessonPlan}
                      className={`${hostChipClean} border-emerald-500/35 text-emerald-100`}
                      title="Save clips + chapters and copy a share link"
                    >
                      {sharingLessonPlan
                        ? "Sharing…"
                        : lessonPlanShareCopied
                          ? "Link copied"
                          : "Share lesson"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSeekLiveBack30}
                    className={hostChipClean}
                  >
                    -30s
                  </button>
                  <button
                    type="button"
                    onClick={handleSeekBack}
                    className={hostChipClean}
                  >
                    -10s
                  </button>
                  {showHostMarkPlay ? (
                    <button
                      type="button"
                      onClick={() => void handleMarkPlay()}
                      className={`${hostChipClean} ${
                        markPlayState === "marked"
                          ? "border-emerald-500/55 bg-emerald-950/50 font-semibold text-emerald-100 ring-2 ring-emerald-400/40 shadow-[0_0_12px_-4px_rgba(16,185,129,0.45)]"
                          : ""
                      }`}
                    >
                      {markPlayState === "marked" ? "Marked" : "Mark Play"}
                    </button>
                  ) : null}
                  {isLiveRoom ? (
                    <button
                      type="button"
                      onClick={handleJumpLiveEdge}
                      className={`${hostChipClean} border-red-500/35 font-semibold text-red-100`}
                    >
                      LIVE
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleReconnectLive()}
                    className={hostChipClean}
                    title="Replace active stream URL without losing session"
                  >
                    Reconnect
                  </button>
                  {/* Removed smart resync / jump-to-start for deterministic sync */}
                  </div>
                  {isManualSyncMode ? (
                    <div className="mt-1 w-full rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-[11px] font-medium text-amber-100/90">
                      Sync Setup Mode is active — shared controls are temporarily disabled.
                    </div>
                  ) : null}
                  {isHost && (uiDuration ?? 0) > 0.25 ? (
                    <div
                      className={`mt-1 w-full max-w-none px-1 ${
                        isManualSyncMode ? "pointer-events-none opacity-35" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-medium text-zinc-300">
                        <span className="font-mono tabular-nums">
                          {formatCountdownMmSs(
                            hostScrubDraft ?? uiPlaybackTime ?? 0,
                          )}
                        </span>
                        <span className="font-mono tabular-nums text-zinc-400">
                          {formatCountdownMmSs(uiDuration ?? 0)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={uiDuration ?? 0}
                        step={0.05}
                        value={hostScrubDraft ?? uiPlaybackTime ?? 0}
                        onPointerDown={() => {
                          hostScrubActiveRef.current = true;
                        }}
                        onPointerUp={() => {
                          hostScrubActiveRef.current = false;
                          if (hostScrubDraft !== null) {
                            handleHostScrubCommit(hostScrubDraft);
                            setHostScrubDraft(null);
                          }
                        }}
                        onTouchEnd={() => {
                          hostScrubActiveRef.current = false;
                          if (hostScrubDraft !== null) {
                            handleHostScrubCommit(hostScrubDraft);
                            setHostScrubDraft(null);
                          }
                        }}
                        onChange={(e) => {
                          const v = Number.parseFloat(e.target.value);
                          if (Number.isFinite(v)) setHostScrubDraft(v);
                        }}
                        className="mt-1 w-full accent-blue-500"
                      />
                    </div>
                  ) : null}
                </div>
                {!teamRoomMode ? (
                  <GameMarksToolbar
                    variant="band"
                    busy={gameMarksBusy}
                    onQuickMark={(lbl) => void handleCreateGameMark(lbl)}
                    onCustomMark={handleGameMarkCustomPrompt}
                  />
                ) : null}
              </div>
              <div className="h-44 w-full shrink-0 md:hidden" aria-hidden />
            </div>
          ) : null}
            </div>
          ) : (
            <>
              {isHost && !isManualSyncMode ? (
                <div className="w-full shrink-0 border-b border-white/[0.06] px-2 pb-2 pt-2">
                  <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-1">
                    {isLiveRoom ? (
                      <span className="rounded-full border border-red-500/40 bg-red-950/55 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-100 shadow-sm shadow-red-950/40">
                        LIVE
                      </span>
                    ) : null}
                    <div
                      className={isManualSyncMode ? "w-full" : ""}
                      aria-hidden={isManualSyncMode}
                    >
                      <div
                        ref={hostControlsRef}
                        className={`${hostControlsBar} ${
                          isManualSyncMode ? "pointer-events-none opacity-35" : ""
                        }`}
                      >
                      <button
                        type="button"
                        onClick={() =>
                          roomState?.isPlaying ? handlePause() : handlePlay()
                        }
                        className={hostChip}
                      >
                        {roomState?.isPlaying ? "Pause" : "Play"}
                      </button>
                      {isFacebookRoom ? (
                        <button
                          type="button"
                          onClick={() => setFbLandscapeCaptureOpen(true)}
                          className={`${hostChip} border-blue-500/40 text-blue-100`}
                          title="Full-screen 16:9 landscape tab capture"
                        >
                          Landscape capture
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleSeekLiveBack30}
                        className={hostChip}
                      >
                        -30s
                      </button>
                      <button
                        type="button"
                        onClick={handleSeekBack}
                        className={hostChip}
                      >
                        -10s
                      </button>
                      {showHostMarkPlay ? (
                        <button
                          type="button"
                          onClick={() => void handleMarkPlay()}
                          className={`${hostChip} ${
                            markPlayState === "marked"
                              ? "border-emerald-500/55 bg-emerald-950/50 font-semibold text-emerald-100 ring-2 ring-emerald-400/40 shadow-[0_0_12px_-4px_rgba(16,185,129,0.45)]"
                              : ""
                          }`}
                        >
                          {markPlayState === "marked" ? "Marked" : "Mark Play"}
                        </button>
                      ) : null}
                      {isLiveRoom ? (
                        <button
                          type="button"
                          onClick={handleJumpLiveEdge}
                          className={`${hostChip} border-red-500/35 font-semibold text-red-100`}
                        >
                          LIVE
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleReconnectLive()}
                        className={hostChip}
                        title="Replace active stream URL without losing session"
                      >
                        Reconnect Live
                      </button>
                      {/* Removed smart resync / jump-to-start for deterministic sync */}
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
                                DEFAULT_PLAYBACK_RATE) - rate,
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
                      </div>
                      {isManualSyncMode ? (
                        <div className="mt-1 w-full rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-[11px] font-medium text-amber-100/90">
                          Sync Setup Mode is active — shared controls are temporarily disabled.
                        </div>
                      ) : null}
                    </div>
                    {isHost && (uiDuration ?? 0) > 0.25 ? (
                      <div className="mt-2 w-full">
                        <div className="flex items-center justify-between px-1 text-[10px] font-medium text-zinc-300">
                          <span className="font-mono tabular-nums">
                            {formatCountdownMmSs(
                              hostScrubDraft ?? uiPlaybackTime ?? 0,
                            )}
                          </span>
                          <span className="font-mono tabular-nums text-zinc-400">
                            {formatCountdownMmSs(uiDuration ?? 0)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={uiDuration ?? 0}
                          step={0.05}
                          value={hostScrubDraft ?? uiPlaybackTime ?? 0}
                          onPointerDown={() => {
                            hostScrubActiveRef.current = true;
                          }}
                          onPointerUp={() => {
                            hostScrubActiveRef.current = false;
                            if (hostScrubDraft !== null) {
                              handleHostScrubCommit(hostScrubDraft);
                              setHostScrubDraft(null);
                            }
                          }}
                          onTouchEnd={() => {
                            hostScrubActiveRef.current = false;
                            if (hostScrubDraft !== null) {
                              handleHostScrubCommit(hostScrubDraft);
                              setHostScrubDraft(null);
                            }
                          }}
                          onChange={(e) => {
                            const v = Number.parseFloat(e.target.value);
                            if (Number.isFinite(v)) setHostScrubDraft(v);
                          }}
                          className="mt-1 w-full accent-blue-500"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {/*
                Always keep aspect-video: absolutely positioned YouTube/iframe does not
                contribute height — flex-1/min-h-0 without aspect ratio collapsed the
                player (black screen) after unlock on some mobile watch layouts.
              */}
              <div
                className={`relative aspect-video w-full min-h-[12rem] overflow-hidden ${
                  fsActive ? "min-h-[100dvh] sm:min-h-[12rem]" : ""
                }`}
                onClick={(e) => {
                  if (fullscreenAngleId !== null) return;
                  handleToggleCleanMode(e);
                }}
              >
            {hostMultiAngles ? (
                  true ? (
                    <div
                      className={`absolute inset-0 flex min-h-0 flex-1 flex-col gap-1 bg-black ${fsStageClass}`}
                    >
                      <div
                        className={`${
                          !hostFocusAngleId ||
                          hostFocusAngleId === hostMultiAngles.activeAngle.id
                            ? "relative min-h-0 flex-1 overflow-hidden"
                            : "absolute bottom-3 right-3 z-[24] aspect-video w-[min(38vw,15rem)] max-w-[42%] cursor-pointer overflow-hidden rounded-lg border-2 border-white/35 bg-black shadow-xl ring-1 ring-black/50"
                        }`}
                        role={
                          !hostFocusAngleId ||
                          hostFocusAngleId === hostMultiAngles.activeAngle.id
                            ? undefined
                            : "button"
                        }
                        tabIndex={
                          !hostFocusAngleId ||
                          hostFocusAngleId === hostMultiAngles.activeAngle.id
                            ? undefined
                            : 0
                        }
                        title={
                          !hostFocusAngleId ||
                          hostFocusAngleId === hostMultiAngles.activeAngle.id
                            ? undefined
                            : "Tap to swap focus/PiP (no reload)"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            hostFocusAngleId &&
                            hostFocusAngleId !== hostMultiAngles.activeAngle.id
                          ) {
                            handleFocusPipSwap();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (
                            !hostFocusAngleId ||
                            hostFocusAngleId === hostMultiAngles.activeAngle.id
                          ) {
                            return;
                          }
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleFocusPipSwap();
                          }
                        }}
                      >
                        {!hostFocusAngleId ||
                        hostFocusAngleId === hostMultiAngles.activeAngle.id ? (
                          <span className="pointer-events-none absolute left-2 top-2 z-[2] rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white/90">
                            {hostMultiAngles.activeAngle.name}
                          </span>
                        ) : (
                          <span className="pointer-events-none absolute left-1 top-1 z-[2] rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white/90">
                            Tap to switch
                          </span>
                        )}
                        <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                          <YouTube
                            key={hostMultiAngles!.activeAngle.id}
                            videoId={safeDecodeVideoId(
                              hostMultiAngles!.activeAngle.videoId,
                            )}
                            onReady={(e) => {
                              const p = e.target as YouTubePlayer;
                              syncPlayerRefs.current[
                                hostMultiAngles!.activeAngle.id
                              ] = p;
                              if (
                                hostMultiAngles!.activeAngle.id ===
                                roomStateRef.current?.currentAngleId
                              ) {
                                handlePlayerReady();
                              }
                              applySyncStateToAnglePlayer(
                                hostMultiAngles!.activeAngle.id,
                                "clean-sync-active-onReady",
                              );
                            }}
                            onStateChange={handleYoutubeStateChange}
                            className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                            onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                          />
                        </YoutubePointerGate>
                        {renderSyncSetupControls({
                          label: hostMultiAngles!.activeAngle.name,
                          which: "primary",
                          angleId: hostMultiAngles!.activeAngle.id,
                          get: getPlayer,
                        })}
                      </div>
                      <div
                        className={`${
                          !hostFocusAngleId ||
                          hostFocusAngleId === hostMultiAngles.activeAngle.id
                            ? "absolute bottom-3 right-3 z-[24] aspect-video w-[min(38vw,15rem)] max-w-[42%] cursor-pointer overflow-hidden rounded-lg border-2 border-white/35 bg-black shadow-xl ring-1 ring-black/50"
                            : "relative min-h-0 flex-1 overflow-hidden"
                        }`}
                        role={
                          !hostFocusAngleId ||
                          hostFocusAngleId === hostMultiAngles.activeAngle.id
                            ? "button"
                            : undefined
                        }
                        tabIndex={
                          !hostFocusAngleId ||
                          hostFocusAngleId === hostMultiAngles.activeAngle.id
                            ? 0
                            : undefined
                        }
                        title={
                          !hostFocusAngleId ||
                          hostFocusAngleId === hostMultiAngles.activeAngle.id
                            ? "Tap to swap focus/PiP (no reload)"
                            : undefined
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            !hostFocusAngleId ||
                            hostFocusAngleId === hostMultiAngles.activeAngle.id
                          ) {
                            handleFocusPipSwap();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (
                            hostFocusAngleId &&
                            hostFocusAngleId !== hostMultiAngles.activeAngle.id
                          ) {
                            return;
                          }
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleFocusPipSwap();
                          }
                        }}
                      >
                        {!hostFocusAngleId ||
                        hostFocusAngleId === hostMultiAngles.activeAngle.id ? (
                          <span className="pointer-events-none absolute left-1 top-1 z-[2] rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white/90">
                            Tap to switch
                          </span>
                        ) : (
                          <span className="pointer-events-none absolute left-2 top-2 z-[2] rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white/90">
                            {hostMultiAngles.secondaryAngle.name}
                          </span>
                        )}
                        <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                          <YouTube
                            key={hostMultiAngles.secondaryAngle.id}
                            videoId={safeDecodeVideoId(
                              hostMultiAngles.secondaryAngle.videoId,
                            )}
                            onReady={(e) => {
                              const p = e.target as YouTubePlayer;
                              syncPlayerRefs.current[
                                hostMultiAngles!.secondaryAngle.id
                              ] = p;
                              applySyncStateToAnglePlayer(
                                hostMultiAngles!.secondaryAngle.id,
                                "clean-sync-secondary-onReady",
                              );
                            }}
                            onStateChange={(e) =>
                              handleHostSyncAngleStateChange(
                                hostMultiAngles!.secondaryAngle.id,
                                e,
                              )
                            }
                            className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                            onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                          />
                        </YoutubePointerGate>
                        <span className="pointer-events-none absolute left-1 top-1 z-[1] rounded bg-black/75 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/90">
                          {hostMultiAngles.secondaryAngle.name}
                        </span>
                        {multiViewSecondaryHold &&
                        multiViewSecondaryHold.angleId ===
                          hostMultiAngles.secondaryAngle.id ? (
                          <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center bg-black/55 px-2 text-center">
                            <div className="rounded-lg border border-white/10 bg-zinc-950/80 px-2 py-1.5 text-[10px] font-semibold text-white shadow-lg shadow-black/40">
                              <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-300">
                                {hostMultiAngles.secondaryAngle.name}
                              </p>
                              <p className="mt-0.5 font-mono tabular-nums text-xs">
                                {formatCountdownMmSs(
                                  multiViewSecondaryHold.countdownSec,
                                )}
                              </p>
                            </div>
                          </div>
                        ) : null}
                        {renderSyncSetupControls({
                          label: hostMultiAngles!.secondaryAngle.name,
                          which: "secondary",
                          angleId: hostMultiAngles!.secondaryAngle.id,
                          get: () =>
                            syncPlayerRefs.current[
                              hostMultiAngles!.secondaryAngle.id
                            ] ?? undefined,
                        })}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`absolute inset-0 gap-1 bg-black ${fsGridLayoutMode ? "relative" : "grid grid-cols-1 sm:grid-cols-2"} ${fsStageClass}`}
                    >
                      <div
                        className={
                          fsGridPrimaryBig
                            ? fsGridBigCls
                            : fsGridLayoutMode
                              ? fsGridPipCls
                              : "relative min-h-0 overflow-hidden"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (fsGridLayoutMode) {
                            applyHostMultiFullscreenTarget(
                              hostMultiAngles!.activeAngle.id,
                            );
                          }
                        }}
                      >
                        <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                          <YouTube
                            key={hostMultiAngles!.activeAngle.id}
                            videoId={safeDecodeVideoId(
                              hostMultiAngles!.activeAngle.videoId,
                            )}
                            onReady={(e) => {
                              const p = e.target as YouTubePlayer;
                              syncPlayerRefs.current[
                                hostMultiAngles!.activeAngle.id
                              ] = p;
                              if (
                                hostMultiAngles!.activeAngle.id ===
                                roomStateRef.current?.currentAngleId
                              ) {
                                handlePlayerReady();
                              }
                              applySyncStateToAnglePlayer(
                                hostMultiAngles!.activeAngle.id,
                                "clean-sync-active-onReady",
                              );
                            }}
                            onStateChange={handleYoutubeStateChange}
                            className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                            onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                          />
                        </YoutubePointerGate>
                        {renderSyncSetupControls({
                          label: hostMultiAngles!.activeAngle.name,
                          which: "primary",
                          angleId: hostMultiAngles!.activeAngle.id,
                          get: getPlayer,
                        })}
                      </div>
                      <div
                        className={
                          fsGridSecondaryBig
                            ? fsGridBigCls
                            : fsGridLayoutMode
                              ? fsGridPipCls
                              : "relative min-h-0 cursor-pointer overflow-hidden"
                        }
                        title={
                          fsGridLayoutMode
                            ? "Tap to enlarge this angle (no reload)"
                            : "Tap to make this the active angle (audio here)"
                        }
                        role="presentation"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (fsGridLayoutMode) {
                            applyHostMultiFullscreenTarget(
                              hostMultiAngles!.secondaryAngle.id,
                            );
                          } else {
                            void handleSelectAngle(
                              hostMultiAngles!.secondaryAngle.id,
                            );
                          }
                        }}
                      >
                        <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                          <YouTube
                            key={hostMultiAngles!.secondaryAngle.id}
                            videoId={safeDecodeVideoId(
                              hostMultiAngles!.secondaryAngle.videoId,
                            )}
                            onReady={(e) => {
                              const p = e.target as YouTubePlayer;
                              syncPlayerRefs.current[
                                hostMultiAngles!.secondaryAngle.id
                              ] = p;
                              applySyncStateToAnglePlayer(
                                hostMultiAngles!.secondaryAngle.id,
                                "clean-sync-secondary-onReady",
                              );
                            }}
                            onStateChange={(e) =>
                              handleHostSyncAngleStateChange(
                                hostMultiAngles!.secondaryAngle.id,
                                e,
                              )
                            }
                            className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                            onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                          />
                        </YoutubePointerGate>
                        {multiViewSecondaryHold?.angleId ===
                          hostMultiAngles!.secondaryAngle.id ? (
                          <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center bg-black/55 px-3 text-center">
                            <div className="rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-[11px] font-semibold text-white shadow-lg shadow-black/40">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">
                                {hostMultiAngles!.secondaryAngle.name}
                              </p>
                              <p className="mt-1 text-sm">
                                Angle starts in{" "}
                                <span className="font-mono tabular-nums">
                                  {formatCountdownMmSs(
                                    multiViewSecondaryHold?.countdownSec ?? 0,
                                  )}
                                </span>
                              </p>
                            </div>
                          </div>
                        ) : null}
                        {renderSyncSetupControls({
                          label: hostMultiAngles!.secondaryAngle.name,
                          which: "secondary",
                          angleId: hostMultiAngles!.secondaryAngle.id,
                          get: () =>
                            syncPlayerRefs.current[
                              hostMultiAngles!.secondaryAngle.id
                            ] ?? undefined,
                        })}
                      </div>
                    </div>
                  )
                ) : (
                  <VideoZoomStage
                    drawLocked={drawGateOn}
                    className={`absolute inset-0 bg-black ${fsStageClass}`}
                  >
                    {isFacebookRoom && facebookEmbedHref ? (
                      <FacebookVideoPlayer
                        key={`fb-${facebookEmbedHref}`}
                        href={facebookEmbedHref}
                        className="absolute left-0 top-0 h-full w-full"
                        onReady={(player) => {
                          facebookPlayerRef.current = player;
                          handlePlayerReady();
                        }}
                        onError={(message) => {
                          setEmbedError({ code: -1, videoId: effectiveVideoId });
                          console.warn("[FB] embed error:", message);
                        }}
                      />
                    ) : isFacebookRoom ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black px-4 text-center text-sm text-zinc-300">
                        Facebook video URL missing for this clip. Re-add the clip
                        from a facebook.com link.
                      </div>
                    ) : (
                    <YoutubePointerGate drawOn={drawGateOn} blockOn={blockHostYoutubePointer}>
                      <YouTube
                        key={
                      isHost
                        ? `host-${safeDecodeVideoId(effectiveVideoId)}`
                        : `viewer-${safeDecodeVideoId(effectiveVideoId)}`
                    }
                        ref={playerRef}
                        videoId={safeDecodeVideoId(effectiveVideoId)}
                        onReady={handlePlayerReady}
                        onStateChange={handleYoutubeStateChange}
                        className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
iframeClassName="h-full w-full border-0"
                        onError={handlePlayerError}
                        opts={youtubePlayerOpts}
                      />
                    </YoutubePointerGate>
                    )}
                    <TelestratorOverlay
                      roomId={roomId}
                      isHost={isHost}
                      drawEnabled={telDrawOn}
                      wrapClassName={telestratorWrapFs}
                    />
                  </VideoZoomStage>
                )}
                {fsActive ? (
                  <button
                    type="button"
                    onClick={() => setFullscreenAngleId(null)}
                    className="fixed right-3 top-3 z-[10020] rounded-lg border border-white/20 bg-black/85 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    Exit Fullscreen
                  </button>
                ) : null}
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
              </div>
            </>
          )}
          </div>
        ) : null}
      </div>
    </div>
    {sessionSavedToast ? (
      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 text-sm font-medium text-emerald-100 shadow-lg shadow-black/40 ring-1 ring-emerald-500/25"
        role="status"
      >
        Session saved
      </div>
    ) : null}
    {copySharedToast ? (
      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 text-sm font-medium text-emerald-100 shadow-lg shadow-black/40 ring-1 ring-emerald-500/25"
        role="status"
      >
        Session copied
      </div>
    ) : null}
    {coachAlertToast ? (
      <CoachAlertToastOverlay
        alert={coachAlertToast}
        onJump={() => {
          void handleJumpToMarkReplay({
            timestamp: coachAlertToast.timestamp,
            angleId: coachAlertToast.angleId,
          });
          handleDismissCoachAlert();
        }}
        onDismiss={handleDismissCoachAlert}
      />
    ) : null}
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
    {fbLandscapeCaptureOpen && isFacebookRoom && facebookEmbedHref ? (
      <FacebookLandscapeCapture
        open
        onClose={() => setFbLandscapeCaptureOpen(false)}
        href={facebookEmbedHref}
        videoKey={effectiveVideoId}
        clips={facebookCaptureClips}
        clipIndex={roomState.currentClipIndex}
        chapters={facebookCaptureChapters}
        initialTime={uiPlaybackTime ?? roomState.currentTime ?? 0}
        initialPlaying={roomState.isPlaying}
        exportBaseName={`film-room-${roomId}`}
      />
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
