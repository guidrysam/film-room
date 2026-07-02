"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import YouTube, { type YouTubePlayer } from "react-youtube";
import type { ReelStep } from "@/lib/highlight-draft";
import {
  REEL_FADE_IN_MS,
  REEL_FADE_OUT_MS,
  runReelSegmentTransition,
} from "@/lib/highlight-reel-transition";

const POLL_MS = 150;

export type HighlightReelPlayerHandle = {
  /** Start the reel from the first segment. */
  play: () => void;
  /** Stop playback. */
  stop: () => void;
};

export type HighlightReelPlayerProps = {
  steps: ReelStep[];
  /** Resolve a source id to its YouTube video id. */
  videoIdForSource: (sourceId: string) => string | undefined;
  /** Resolve a source id to a human label (for the overlay). */
  labelForSource?: (sourceId: string) => string | undefined;
  /** Fires when the reel reaches the end of the last segment. */
  onEnded?: () => void;
  /** Fires whenever play/pause state changes. */
  onPlayingChange?: (playing: boolean) => void;
};

/**
 * Plays a highlight reel through a single YouTube iframe by sequencing the
 * resolved {@link ReelStep}s: it loads/seeks to each segment's source video,
 * applies the segment speed, repeats it the requested number of times, then
 * advances. Because it drives one element it is the clean thing to screen
 * record, and it never touches the synced multi-angle room engine.
 */
const HighlightReelPlayer = forwardRef<
  HighlightReelPlayerHandle,
  HighlightReelPlayerProps
>(function HighlightReelPlayer(
  { steps, videoIdForSource, labelForSource, onEnded, onPlayingChange },
  ref,
) {
  const [playing, setPlaying] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [repeatPass, setRepeatPass] = useState(0);
  const [ready, setReady] = useState(false);
  const [fadeOpaque, setFadeOpaque] = useState(false);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  });
  const playingRef = useRef(false);
  const stepIndexRef = useRef(-1);
  const repeatPassRef = useRef(0);
  const pendingPlayRef = useRef(false);
  const transitioningRef = useRef(false);

  const setPlayingState = useCallback(
    (next: boolean) => {
      playingRef.current = next;
      setPlaying(next);
      onPlayingChange?.(next);
    },
    [onPlayingChange],
  );

  const firstVideoId = steps[0]
    ? videoIdForSource(steps[0].sourceId)
    : undefined;

  /** Match Game Review / room embed params — hidden controls trigger YouTube sign-in walls. */
  const youtubeOpts = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 0,
        enablejsapi: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        ...(typeof window !== "undefined"
          ? { origin: window.location.origin }
          : {}),
      },
    }),
    [],
  );

  /** Load (or seek within) the source for a given step + repeat pass. */
  const loadStep = useCallback(
    (index: number, pass: number) => {
      const player = playerRef.current;
      const step = stepsRef.current[index];
      if (!player || !step) return;
      const videoId = videoIdForSource(step.sourceId);
      if (!videoId) return;

      stepIndexRef.current = index;
      repeatPassRef.current = pass;
      setStepIndex(index);
      setRepeatPass(pass);

      const start = Math.max(0, step.sourceStartTime);
      try {
        if (loadedVideoIdRef.current === videoId) {
          player.seekTo(start, true);
          player.playVideo?.();
        } else {
          loadedVideoIdRef.current = videoId;
          // loadVideoById autoplays from startSeconds.
          (
            player as YouTubePlayer & {
              loadVideoById?: (o: {
                videoId: string;
                startSeconds?: number;
              }) => void;
            }
          ).loadVideoById?.({ videoId, startSeconds: start });
        }
        // Apply speed shortly after; YouTube can reset rate on load/seek.
        window.setTimeout(() => {
          try {
            player.setPlaybackRate?.(step.speed);
          } catch {
            /* unsupported rate */
          }
        }, 120);
      } catch {
        /* player not ready */
      }
    },
    [videoIdForSource],
  );

  const stop = useCallback(() => {
    setPlayingState(false);
    pendingPlayRef.current = false;
    transitioningRef.current = false;
    setFadeOpaque(false);
    stepIndexRef.current = -1;
    repeatPassRef.current = 0;
    setStepIndex(-1);
    setRepeatPass(0);
    try {
      playerRef.current?.pauseVideo?.();
    } catch {
      /* ignore */
    }
  }, [setPlayingState]);

  const advanceToStep = useCallback(
    (index: number, pass: number, withFade: boolean) => {
      if (transitioningRef.current) return;
      const run = () => loadStep(index, pass);
      if (!withFade) {
        run();
        return;
      }
      transitioningRef.current = true;
      void runReelSegmentTransition(run, setFadeOpaque).finally(() => {
        transitioningRef.current = false;
      });
    },
    [loadStep],
  );

  const play = useCallback(() => {
    if (stepsRef.current.length === 0) return;
    setPlayingState(true);
    if (!playerRef.current || !ready) {
      pendingPlayRef.current = true;
      return;
    }
    loadStep(0, 0);
  }, [loadStep, ready, setPlayingState]);

  useImperativeHandle(ref, () => ({ play, stop }), [play, stop]);

  // Advance loop: watch source time and move through repeats + segments.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !playingRef.current) return;
      const step = stepsRef.current[stepIndexRef.current];
      if (!step) return;
      let current = 0;
      try {
        current = player.getCurrentTime?.() ?? 0;
      } catch {
        return;
      }
      // Keep the segment speed pinned (YouTube occasionally drifts to 1×).
      try {
        if (Math.abs((player.getPlaybackRate?.() ?? 1) - step.speed) > 0.01) {
          player.setPlaybackRate?.(step.speed);
        }
      } catch {
        /* ignore */
      }
      if (current >= step.sourceEndTime - 0.05) {
        const pass = repeatPassRef.current;
        if (pass + 1 < step.repeat) {
          advanceToStep(stepIndexRef.current, pass + 1, false);
          return;
        }
        const nextIndex = stepIndexRef.current + 1;
        if (nextIndex >= stepsRef.current.length) {
          stop();
          onEnded?.();
          return;
        }
        advanceToStep(nextIndex, 0, true);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [playing, advanceToStep, stop, onEnded]);

  const activeStep = stepIndex >= 0 ? steps[stepIndex] : null;
  const activeLabel = activeStep
    ? activeStep.label ||
      labelForSource?.(activeStep.sourceId) ||
      "Segment"
    : null;

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-black">
      <div className="relative aspect-video w-full">
        {firstVideoId ? (
          <YouTube
            key={firstVideoId}
            videoId={firstVideoId}
            className="h-full w-full"
            iframeClassName="h-full w-full"
            opts={youtubeOpts}
            onReady={(e) => {
              playerRef.current = e.target;
              loadedVideoIdRef.current = firstVideoId;
              setReady(true);
              if (pendingPlayRef.current) {
                pendingPlayRef.current = false;
                loadStep(0, 0);
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
            Add a segment to preview the reel.
          </div>
        )}

        {activeStep ? (
          <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-2 text-[11px] font-medium text-white">
            <span className="truncate">{activeLabel}</span>
            <span className="shrink-0 font-mono text-[10px] text-zinc-200">
              {stepIndex + 1}/{steps.length}
              {activeStep.repeat > 1
                ? ` · loop ${repeatPass + 1}/${activeStep.repeat}`
                : ""}
              {activeStep.speed !== 1 ? ` · ${activeStep.speed}×` : ""}
            </span>
          </div>
        ) : null}

        <div
          className="pointer-events-none absolute inset-0 z-20 bg-black transition-opacity ease-in-out"
          style={{
            opacity: fadeOpaque ? 1 : 0,
            transitionDuration: `${fadeOpaque ? REEL_FADE_IN_MS : REEL_FADE_OUT_MS}ms`,
          }}
          aria-hidden
        />
      </div>

      <div className="flex items-center gap-2 border-t border-white/[0.06] bg-zinc-950/60 px-3 py-2">
        <button
          type="button"
          onClick={() => (playing ? stop() : play())}
          disabled={steps.length === 0}
          className={`rounded-md border px-3 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            playing
              ? "border-amber-500/45 bg-amber-950/45 text-amber-100 hover:bg-amber-900/55"
              : "border-blue-500/45 bg-blue-950/55 text-blue-100 hover:bg-blue-900/60"
          }`}
        >
          {playing ? "Stop" : "▶ Play reel"}
        </button>
        <span className="text-[10px] text-zinc-500">
          {steps.length} segment{steps.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
});

export default HighlightReelPlayer;
