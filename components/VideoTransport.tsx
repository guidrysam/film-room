"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { YouTubePlayer } from "react-youtube";

export type VideoTransportProps = {
  /** Ref to the active YouTube player (read live each tick). */
  playerRef: RefObject<YouTubePlayer | null>;
  /** True once the player has fired onReady. */
  ready: boolean;
  /**
   * Called every poll tick with the player's current playback time (seconds).
   * Use to keep an app-level playhead (e.g. the tag/stat game time) in sync.
   */
  onSourceTime?: (sourceTime: number) => void;
};

const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2] as const;
const SKIPS = [-10, -1, 1, 10] as const;

const btn =
  "rounded-md border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-medium tabular-nums text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-40";

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

async function read(fn: (() => unknown) | undefined): Promise<number> {
  if (!fn) return 0;
  try {
    const v = await fn();
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * Standard, always-visible video transport (play/pause, skip, scrub, speed)
 * for a react-youtube player. Keeps a parent playhead in sync via onSourceTime.
 */
export default function VideoTransport({
  playerRef,
  ready,
  onSourceTime,
}: VideoTransportProps) {
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const scrubbingRef = useRef(false);
  const onSourceTimeRef = useRef(onSourceTime);

  useEffect(() => {
    onSourceTimeRef.current = onSourceTime;
  }, [onSourceTime]);

  // Poll the player for time / duration / play state.
  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      void (async () => {
        const t = await read(p.getCurrentTime?.bind(p));
        const d = await read(p.getDuration?.bind(p));
        const state = await read(p.getPlayerState?.bind(p));
        if (!scrubbingRef.current) {
          setCurrent(t);
          onSourceTimeRef.current?.(t);
        }
        if (d > 0) setDuration(d);
        // YT.PlayerState.PLAYING === 1
        setPlaying(state === 1);
      })();
    }, 250);
    return () => window.clearInterval(id);
  }, [ready, playerRef]);

  const seekTo = useCallback(
    (sec: number) => {
      const p = playerRef.current;
      if (!p) return;
      const clamped = Math.max(0, duration > 0 ? Math.min(sec, duration) : sec);
      setCurrent(clamped);
      try {
        void p.seekTo(clamped, true);
      } catch {
        /* not ready */
      }
      onSourceTimeRef.current?.(clamped);
    },
    [playerRef, duration],
  );

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (playing) void p.pauseVideo();
      else void p.playVideo();
    } catch {
      /* not ready */
    }
  }, [playerRef, playing]);

  const changeRate = useCallback(
    (r: number) => {
      setRate(r);
      const p = playerRef.current;
      if (!p) return;
      try {
        void p.setPlaybackRate(r);
      } catch {
        /* not ready */
      }
    },
    [playerRef],
  );

  return (
    <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/30 p-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!ready}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-500/40 bg-blue-600/90 text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {playing ? (
            <span className="text-sm leading-none">❚❚</span>
          ) : (
            <span className="text-sm leading-none">▶</span>
          )}
        </button>

        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.1}
          value={Math.min(current, duration > 0 ? duration : current)}
          disabled={!ready}
          onMouseDown={() => {
            scrubbingRef.current = true;
          }}
          onTouchStart={() => {
            scrubbingRef.current = true;
          }}
          onChange={(e) => setCurrent(Number(e.target.value))}
          onMouseUp={(e) => {
            scrubbingRef.current = false;
            seekTo(Number((e.target as HTMLInputElement).value));
          }}
          onTouchEnd={(e) => {
            scrubbingRef.current = false;
            seekTo(Number((e.target as HTMLInputElement).value));
          }}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-blue-500 disabled:cursor-not-allowed"
          aria-label="Scrub video"
        />

        <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-300">
          {fmt(current)}
          <span className="text-zinc-600"> / {fmt(duration)}</span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {SKIPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => seekTo(current + s)}
              disabled={!ready}
              className={btn}
            >
              {s > 0 ? `+${s}s` : `${s}s`}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          Speed
          <select
            value={rate}
            disabled={!ready}
            onChange={(e) => changeRate(Number(e.target.value))}
            className="rounded-md border border-white/10 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50 disabled:opacity-40"
          >
            {PLAYBACK_RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
