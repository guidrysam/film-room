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
import { TelestratorOverlay } from "@/components/TelestratorOverlay";

const HOST_SPEEDS = [0.25, 0.5, 1] as const;
const DEFAULT_PLAYBACK_RATE = 1;

/** Stable reference — new object each render breaks react-youtube `shouldResetPlayer` / remounts the iframe. */
const YOUTUBE_PLAYER_OPTS = {
  width: "100%",
  height: "100%",
  /* fs: 0 — hide YT iframe fullscreen; fullscreen must use the stage (video + telestrator). */
  playerVars: { rel: 0, fs: 0 },
} as const;

/** Host-issued transport; `sync` is occasional time reference only (not command transport). */
type TransportAction = "init" | "play" | "pause" | "seek" | "rate" | "sync";

type RoomState = {
  videoId: string;
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  updatedAt: number;
  action: TransportAction;
  /** Monotonic per room — viewer applies command when this advances. */
  actionId: number;
};

function parseTransportAction(raw: unknown): TransportAction {
  if (
    raw === "init" ||
    raw === "play" ||
    raw === "pause" ||
    raw === "seek" ||
    raw === "rate" ||
    raw === "sync"
  ) {
    return raw;
  }
  return "init";
}

function stableKey(s: RoomState): string {
  return `${s.videoId}|${s.isPlaying}|${s.currentTime}|${s.playbackRate}|${s.updatedAt}|${s.action}|${s.actionId}`;
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
  const [copied, setCopied] = useState(false);
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
  const applyRoomStateToPlayerRef = useRef<
    (state: RoomState, prev: RoomState | null, gen: number) => Promise<void>
  >(async () => {});
  const prevRoomRef = useRef<RoomState | null>(null);
  /** Last `prev` passed into `applyRoomStateToPlayer` (for unlock resync pair with `roomStateRef`). */
  const applyPrevSnapshotRef = useRef<RoomState | null>(null);
  const roomStateRef = useRef<RoomState | null>(null);

  useLayoutEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    lastViewerSyncRateRef.current = Number.NaN;
  }, [roomId]);

  useEffect(() => {
    viewerPlaybackUnlockedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset unlock UI when room changes
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

  const isHostRef = useRef(isHost);
  const roomRefForWrite = useRef(roomRef);

  useLayoutEffect(() => {
    isHostRef.current = isHost;
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
    const vid = decodeURIComponent(videoFromUrl);
    void get(roomRef).then((snap) => {
      if (!snap.exists()) {
        void set(roomRef, {
          videoId: vid,
          isPlaying: false,
          currentTime: 0,
          playbackRate: DEFAULT_PLAYBACK_RATE,
          updatedAt: serverTimestamp(),
          action: "init",
          actionId: 1,
        });
      } else {
        const d = snap.val() as { actionId?: unknown } | null;
        if (d && typeof d.actionId !== "number") {
          void update(roomRef, {
            action: "init",
            actionId: 1,
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
  }, [roomRef, isHost, videoFromUrl]);

  useEffect(() => {
    if (!roomRef) return;
    const unsub = onValue(roomRef, (snap) => {
      const v = snap.val() as Partial<RoomState> | null;
      if (
        v &&
        typeof v.videoId === "string" &&
        typeof v.isPlaying === "boolean" &&
        typeof v.currentTime === "number"
      ) {
        setRoomState({
          videoId: v.videoId,
          isPlaying: v.isPlaying,
          currentTime: v.currentTime,
          playbackRate: normalizePlaybackRate(v.playbackRate),
          updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
          action: parseTransportAction(v.action),
          actionId: typeof v.actionId === "number" ? v.actionId : 0,
        });
      } else {
        setRoomState(null);
      }
    });
    return () => unsub();
  }, [roomRef]);

  const applyRoomStateToPlayer = useCallback(
    async (state: RoomState, prev: RoomState | null, gen: number) => {
      const stale = () => gen !== applyRoomGenRef.current;
      if (stale()) return;

      const yt = playerRef.current;
      const player = yt?.getInternalPlayer() as YouTubePlayer | null | undefined;
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
              await viewerApplySeekCommand(
                player,
                state,
                lastViewerSyncRateRef,
                viewerPlaybackUnlockedRef,
              );
              break;
            case "play":
              await viewerApplyPlayCommand(
                player,
                state,
                lastViewerSyncRateRef,
                viewerPlaybackUnlockedRef,
              );
              break;
            case "pause":
              await viewerApplyPauseCommand(
                player,
                state,
                lastViewerSyncRateRef,
              );
              break;
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
    (partial: Record<string, unknown>, action: TransportAction) => {
      const rr = roomRefForWrite.current;
      if (!rr || !isHostRef.current) return;
      hostActionSeqRef.current += 1;
      void update(rr, {
        ...partial,
        action,
        actionId: hostActionSeqRef.current,
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* RTDB permission / network — avoid unhandled rejection */
      });
    },
    [],
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
      writeHostTransport({ isPlaying: true, currentTime: t }, "play");
    })();
  };

  const handlePause = () => {
    if (!isHost) return;
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      writeHostTransport({ isPlaying: false, currentTime: t }, "pause");
    })();
  };

  const handleSeekBack = () => {
    if (!isHost) return;
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      writeHostTransport(
        { currentTime: Math.max(0, t - 10) },
        "seek",
      );
    })();
  };

  const handleSpeed = (rate: (typeof HOST_SPEEDS)[number]) => {
    if (!isHost) return;
    writeHostTransport({ playbackRate: rate }, "rate");
  };

  const handlePlayerReady = useCallback(() => {
    const s = roomStateRef.current;
    if (!s) return;
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

  const effectiveVideoId = roomState?.videoId ?? videoFromUrl;
  const displayRate = roomState?.playbackRate ?? DEFAULT_PLAYBACK_RATE;

  if (!videoFromUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-white">
        <p className="mb-4 text-center text-gray-300">
          No video selected. Add a <code className="text-gray-100">?video=</code>{" "}
          query with a YouTube video ID.
        </p>
        <Link
          href="/"
          className="rounded bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (!effectiveVideoId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-white">
        <p className="mb-4 text-center text-gray-300">Missing video id.</p>
        <Link
          href="/"
          className="rounded bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500"
        >
          Back to home
        </Link>
      </div>
    );
  }

  const hostChip =
    "rounded-md border border-white/15 bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm hover:bg-black/85 sm:text-sm";

  return (
    <div className="flex min-h-screen flex-col bg-black px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 text-sm text-gray-400">
          <p>
            Room{" "}
            <span className="font-mono text-gray-200">{roomId}</span>
            {" · "}
            <span className="text-gray-200">{isHost ? "Host" : "Viewer"}</span>
            {" · "}
            Speed{" "}
            <span className="text-gray-200">
              {displayRate === 1 ? "1×" : `${displayRate}×`}
            </span>
          </p>
          {isHost ? (
            <button
              type="button"
              onClick={handleCopyViewerLink}
              className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
            >
              {copied ? "Copied" : "Copy Viewer Link"}
            </button>
          ) : null}
        </div>

        <div
          ref={stageRef}
          className={`relative w-full overflow-hidden bg-black ${
            stageFullscreen
              ? "flex max-h-none min-h-0 flex-1 flex-col rounded-none"
              : "rounded-lg"
          }`}
        >
          <div className="relative aspect-video w-full">
            <div className="absolute inset-0 overflow-hidden">
              <YouTube
                ref={playerRef}
                videoId={safeDecodeVideoId(effectiveVideoId)}
                onReady={handlePlayerReady}
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
              <div className="pointer-events-auto absolute inset-0 z-[35] flex items-center justify-center bg-black/75 px-4 backdrop-blur-[1px]">
                <button
                  type="button"
                  onClick={handleViewerPlaybackUnlock}
                  className="rounded-lg border border-white/20 bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-lg hover:bg-blue-500"
                >
                  Tap to enable playback
                </button>
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
              <div className="pointer-events-none absolute bottom-2 left-1/2 z-30 flex w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 justify-center px-1 sm:bottom-3">
                <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/70 px-2 py-2 shadow-lg backdrop-blur-sm sm:gap-2 sm:px-3">
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
                          ? "border-blue-400/50 bg-blue-600/80 ring-1 ring-white/20"
                          : ""
                      }`}
                    >
                      {rate === 1 ? "1×" : `${rate}×`}
                    </button>
                  ))}
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
        <div className="flex min-h-screen items-center justify-center bg-black text-white">
          Loading…
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
