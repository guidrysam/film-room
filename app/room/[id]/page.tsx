"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  get,
  onValue,
  ref,
  set,
  update,
  serverTimestamp,
} from "firebase/database";
import type { YouTubePlayer } from "react-youtube";
import YouTube from "react-youtube";
import { db } from "@/lib/firebase";

const HOST_SPEEDS = [0.25, 0.5, 1] as const;
const DEFAULT_PLAYBACK_RATE = 1;

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
  const searchParams = useSearchParams();
  const roomId = typeof params.id === "string" ? params.id : "";
  const videoFromUrl = searchParams.get("video");
  const isHost = searchParams.get("host") === "true";

  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const playerRef = useRef<InstanceType<typeof YouTube>>(null);
  const lastAppliedKey = useRef<string>("");
  const roomStateRef = useRef<RoomState | null>(null);

  useLayoutEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  const roomRef = roomId ? ref(db, `rooms/${roomId}`) : null;

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

  const applyRoomStateToPlayer = useCallback(async (state: RoomState) => {
    const yt = playerRef.current;
    const player = yt?.getInternalPlayer() as YouTubePlayer | null | undefined;
    if (!player) return;

    const key = stableKey(state);
    if (key === lastAppliedKey.current) return;
    lastAppliedKey.current = key;

    try {
      const localT = await player.getCurrentTime();
      if (Math.abs(localT - state.currentTime) > 0.5) {
        await player.seekTo(state.currentTime, true);
      }
      await safeSetPlaybackRate(player, state.playbackRate);
      if (state.isPlaying) player.playVideo();
      else player.pauseVideo();
    } catch {
      lastAppliedKey.current = "";
    }
  }, []);

  useEffect(() => {
    if (!roomState) return;
    void applyRoomStateToPlayer(roomState);
  }, [roomState, applyRoomStateToPlayer]);

  const getPlayer = () =>
    playerRef.current?.getInternalPlayer() as YouTubePlayer | null | undefined;

  const writeUpdate = (partial: Record<string, unknown>) => {
    if (!roomRef || !isHost) return;
    void update(roomRef, {
      ...partial,
      updatedAt: serverTimestamp(),
    });
  };

  const handlePlay = () => {
    if (!isHost) return;
    const player = getPlayer();
    if (!player) {
      writeUpdate({ isPlaying: true });
      return;
    }
    void player.getCurrentTime().then((t: number) => {
      writeUpdate({ isPlaying: true, currentTime: t });
    });
  };

  const handlePause = () => {
    if (!isHost) return;
    const player = getPlayer();
    if (!player) {
      writeUpdate({ isPlaying: false });
      return;
    }
    void player.getCurrentTime().then((t: number) => {
      writeUpdate({ isPlaying: false, currentTime: t });
    });
  };

  const handleSeekBack = () => {
    if (!isHost) return;
    const player = getPlayer();
    if (!player) return;
    void player.getCurrentTime().then((t: number) => {
      writeUpdate({ currentTime: Math.max(0, t - 10) });
    });
  };

  const handleSpeed = (rate: (typeof HOST_SPEEDS)[number]) => {
    if (!isHost) return;
    writeUpdate({ playbackRate: rate });
  };

  const handlePlayerReady = () => {
    const s = roomStateRef.current;
    if (s) void applyRoomStateToPlayer(s);
  };

  const effectiveVideoId = roomState?.videoId ?? videoFromUrl;
  const displayRate = roomState?.playbackRate ?? DEFAULT_PLAYBACK_RATE;
  const roleLabel = isHost ? "Host" : "Viewer";

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-8 text-white">
      <div className="w-full max-w-3xl">
        <p className="mb-2 text-center text-sm text-gray-400">
          Role: <span className="text-gray-200">{roleLabel}</span>
          {" · "}
          Speed:{" "}
          <span className="text-gray-200">
            {displayRate === 1 ? "1×" : `${displayRate}×`}
          </span>
        </p>
        <div className="overflow-hidden rounded-lg">
          <YouTube
            ref={playerRef}
            videoId={safeDecodeVideoId(effectiveVideoId)}
            onReady={handlePlayerReady}
            opts={{
              width: "100%",
              height: "480",
              playerVars: {
                rel: 0,
              },
            }}
          />
        </div>
        {isHost ? (
          <div className="mt-6 space-y-4">
            <p className="text-center text-xs uppercase tracking-wide text-gray-500">
              Host controls
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {HOST_SPEEDS.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handleSpeed(rate)}
                  className={`rounded px-4 py-2 text-sm font-medium ${
                    Math.abs((roomState?.playbackRate ?? DEFAULT_PLAYBACK_RATE) - rate) <
                    1e-6
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-200 hover:bg-gray-700"
                  }`}
                >
                  {rate === 1 ? "1×" : `${rate}×`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handlePlay}
                className="rounded bg-green-600 px-6 py-3 font-semibold hover:bg-green-500"
              >
                Play
              </button>
              <button
                type="button"
                onClick={handlePause}
                className="rounded bg-amber-600 px-6 py-3 font-semibold hover:bg-amber-500"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={handleSeekBack}
                className="rounded bg-gray-700 px-6 py-3 font-semibold hover:bg-gray-600"
              >
                -10s
              </button>
            </div>
          </div>
        ) : null}
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
