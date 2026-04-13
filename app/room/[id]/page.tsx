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
  playerVars: { rel: 0 },
} as const;

type RoomState = {
  videoId: string;
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  updatedAt: number;
};

function stableKey(s: RoomState): string {
  return `${s.videoId}|${s.isPlaying}|${s.currentTime}|${s.playbackRate}|${s.updatedAt}`;
}

/** Compare Firebase `currentTime` snapshots (often stale during playback). */
function sameDbClock(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.05;
}

/** Paused: keep picture aligned with DB. */
const SEEK_DRIFT_PAUSED_S = 0.4;
/** Playing: only catch up forward when this far behind (late join / lag). */
const SEEK_CATCHUP_PLAYING_S = 2.0;
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
    return Math.abs(drift) > SEEK_AFTER_TRANSPORT_JUMP_S;
  }

  if (!isPlaying) {
    return Math.abs(drift) > SEEK_DRIFT_PAUSED_S;
  }

  /* Playing without a new currentTime in Firebase: remote is usually stale — do not seek
   * backward (that caused random backward jumps). Only catch up if clearly behind. */
  if (drift < -SEEK_CATCHUP_PLAYING_S) {
    return true;
  }

  return false;
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

async function applyPlaybackIfNeeded(
  player: YouTubePlayer,
  shouldPlay: boolean,
): Promise<void> {
  const p = player as YouTubePlayer & {
    getPlayerState?: () => Promise<number>;
  };
  try {
    if (typeof p.getPlayerState === "function") {
      const st = await p.getPlayerState();
      if (shouldPlay && st !== YT_PLAYING) {
        player.playVideo();
      } else if (!shouldPlay && st !== YT_PAUSED) {
        player.pauseVideo();
      }
      return;
    }
  } catch {
    /* fall through */
  }
  if (shouldPlay) player.playVideo();
  else player.pauseVideo();
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
  const prevRoomRef = useRef<RoomState | null>(null);
  const roomStateRef = useRef<RoomState | null>(null);

  useLayoutEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

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
        });
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
        });
      } else {
        setRoomState(null);
      }
    });
    return () => unsub();
  }, [roomRef]);

  const applyRoomStateToPlayer = useCallback(
    async (state: RoomState, prev: RoomState | null) => {
      const yt = playerRef.current;
      const player = yt?.getInternalPlayer() as YouTubePlayer | null | undefined;
      if (!player) return;

      const key = stableKey(state);
      if (key === lastAppliedKey.current) return;

      const rateOnly = isRateOnlyFirebaseUpdate(prev, state);

      try {
        if (rateOnly) {
          await safeSetPlaybackRate(player, state.playbackRate);
          lastAppliedKey.current = key;
          return;
        }

        if (isUpdatedAtOnlyFirebaseUpdate(prev, state)) {
          lastAppliedKey.current = key;
          return;
        }

        lastAppliedKey.current = key;

        const localT = await player.getCurrentTime();
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
        }
        await safeSetPlaybackRate(player, state.playbackRate);
        await applyPlaybackIfNeeded(player, state.isPlaying);
      } catch {
        lastAppliedKey.current = "";
      }
    },
    [],
  );

  useEffect(() => {
    if (!roomState) {
      prevRoomRef.current = null;
      return;
    }
    const prev = prevRoomRef.current;
    prevRoomRef.current = roomState;
    void applyRoomStateToPlayer(roomState, prev);
  }, [roomState, applyRoomStateToPlayer]);

  const getPlayer = () =>
    playerRef.current?.getInternalPlayer() as YouTubePlayer | null | undefined;

  const writeHostRoomPartial = (partial: Record<string, unknown>) => {
    const rr = roomRefForWrite.current;
    if (!rr || !isHostRef.current) return;
    void update(rr, {
      ...partial,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      /* RTDB permission / network — avoid unhandled rejection */
    });
  };

  const handlePlay = () => {
    if (!isHost) return;
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      writeHostRoomPartial({ isPlaying: true, currentTime: t });
    })();
  };

  const handlePause = () => {
    if (!isHost) return;
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      writeHostRoomPartial({ isPlaying: false, currentTime: t });
    })();
  };

  const handleSeekBack = () => {
    if (!isHost) return;
    void (async () => {
      const player = getPlayer();
      const fb = roomStateRef.current?.currentTime ?? 0;
      const t = await readYoutubeCurrentTime(player, fb);
      writeHostRoomPartial({ currentTime: Math.max(0, t - 10) });
    })();
  };

  const handleSpeed = (rate: (typeof HOST_SPEEDS)[number]) => {
    if (!isHost) return;
    writeHostRoomPartial({ playbackRate: rate });
  };

  const handlePlayerReady = useCallback(() => {
    const s = roomStateRef.current;
    if (!s) return;
    /* After iframe remount, re-sync. If we already applied this snapshot, skip (avoids seek/play churn). */
    const key = stableKey(s);
    if (key === lastAppliedKey.current) return;
    void applyRoomStateToPlayer(s, null);
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
