"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import YouTube, { type YouTubePlayer } from "react-youtube";
import type { ReelStep } from "@/lib/highlight-draft";
import {
  REEL_FADE_IN_MS,
  REEL_FADE_OUT_MS,
  runReelSegmentTransition,
} from "@/lib/highlight-reel-transition";
import { REEL_PLAYER_OVERLAY_SEC } from "@/lib/highlight-player-overlay";

const POLL_MS = 150;
/** Ignore segment-end checks until a seek/load has had time to settle. */
const SEEK_SETTLE_MS = 900;
const PLAY_RETRY_MS = 400;

const YT_UNSTARTED = -1;
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_CUED = 5;

type YouTubePlayerWithCue = YouTubePlayer & {
  loadVideoById?: (o: { videoId: string; startSeconds?: number }) => void;
  cueVideoById?: (o: { videoId: string; startSeconds?: number }) => void;
};

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
  /** 16:9 surface used for tab capture / recording (video frame only). */
  captureRef?: Ref<HTMLDivElement>;
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
  { steps, videoIdForSource, captureRef, onEnded, onPlayingChange },
  ref,
) {
  const [playing, setPlaying] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [repeatPass, setRepeatPass] = useState(0);
  const [ready, setReady] = useState(false);
  const [fadeOpaque, setFadeOpaque] = useState(false);
  const [playerOverlay, setPlayerOverlay] = useState<string | null>(null);
  /** Covers YouTube's large center play/pause glyph until playback is running. */
  const [coverCenterChrome, setCoverCenterChrome] = useState(true);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const overlayTimerRef = useRef<number | null>(null);
  const centerRevealTimerRef = useRef<number | null>(null);
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  });
  const playingRef = useRef(false);
  const stepIndexRef = useRef(-1);
  const repeatPassRef = useRef(0);
  const pendingPlayRef = useRef(false);
  const transitioningRef = useRef(false);
  const seekSettledAtRef = useRef(0);
  const lastPlayKickAtRef = useRef(0);
  const lastObservedTimeRef = useRef(0);
  const lastTimeAdvanceAtRef = useRef(0);

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

  /** Hidden chrome + JS API origin (required to avoid YouTube sign-in walls). */
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
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        cc_load_policy: 0,
        ...(typeof window !== "undefined"
          ? { origin: window.location.origin }
          : {}),
      },
    }),
    [],
  );

  const clearPlayerOverlay = useCallback(() => {
    if (overlayTimerRef.current != null) {
      window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
    setPlayerOverlay(null);
  }, []);

  const showPlayerOverlay = useCallback(
    (step: ReelStep) => {
      clearPlayerOverlay();
      const text = step.playerOverlay?.trim();
      if (!text) return;
      setPlayerOverlay(text);
      const sec = step.playerOverlaySec ?? REEL_PLAYER_OVERLAY_SEC;
      overlayTimerRef.current = window.setTimeout(() => {
        overlayTimerRef.current = null;
        setPlayerOverlay(null);
      }, sec * 1000);
    },
    [clearPlayerOverlay],
  );

  useEffect(() => () => clearPlayerOverlay(), [clearPlayerOverlay]);

  const clearCenterRevealTimer = useCallback(() => {
    if (centerRevealTimerRef.current != null) {
      window.clearTimeout(centerRevealTimerRef.current);
      centerRevealTimerRef.current = null;
    }
  }, []);

  const hideCenterChrome = useCallback(() => {
    clearCenterRevealTimer();
    setCoverCenterChrome(true);
  }, [clearCenterRevealTimer]);

  const scheduleCenterChromeReveal = useCallback(() => {
    clearCenterRevealTimer();
    centerRevealTimerRef.current = window.setTimeout(() => {
      centerRevealTimerRef.current = null;
      if (!playingRef.current) return;
      try {
        const state = playerRef.current?.getPlayerState?.();
        if (state === YT_PLAYING) setCoverCenterChrome(false);
      } catch {
        /* ignore */
      }
    }, 360);
  }, [clearCenterRevealTimer]);

  const handleYoutubeChromeState = useCallback(
    (state: number) => {
      if (state === YT_PLAYING && playingRef.current) {
        scheduleCenterChromeReveal();
        return;
      }
      if (
        state === YT_PAUSED ||
        state === YT_CUED ||
        state === YT_UNSTARTED ||
        state === YT_BUFFERING ||
        state === YT_ENDED
      ) {
        hideCenterChrome();
      }
    },
    [hideCenterChrome, scheduleCenterChromeReveal],
  );

  useEffect(
    () => () => {
      clearCenterRevealTimer();
    },
    [clearCenterRevealTimer],
  );

  const kickPlayback = useCallback((player: YouTubePlayer, reason: string) => {
    const now = Date.now();
    if (now - lastPlayKickAtRef.current < PLAY_RETRY_MS) return;
    lastPlayKickAtRef.current = now;
    try {
      let state: number | undefined;
      try {
        state = player.getPlayerState?.();
      } catch {
        state = undefined;
      }
      if (state === YT_PLAYING || state === YT_BUFFERING) return;
      player.playVideo?.();
      if (reason === "state") {
        const t = player.getCurrentTime?.() ?? 0;
        if (Number.isFinite(t) && t >= 0) {
          player.seekTo?.(t, true);
        }
      }
    } catch {
      /* player not ready */
    }
  }, []);

  const cueIdlePreview = useCallback(
    (player: YouTubePlayer) => {
      if (playingRef.current) return;
      const step = stepsRef.current[0];
      if (!step) return;
      const videoId = videoIdForSource(step.sourceId);
      if (!videoId) return;
      const start = Math.max(0, step.sourceStartTime);
      const yt = player as YouTubePlayerWithCue;
      try {
        if (loadedVideoIdRef.current === videoId) {
          player.seekTo?.(start, true);
          player.pauseVideo?.();
        } else {
          yt.cueVideoById?.({ videoId, startSeconds: start });
          loadedVideoIdRef.current = videoId;
        }
      } catch {
        /* player not ready */
      }
    },
    [videoIdForSource],
  );

  const waitForSegmentPresentable = useCallback((index: number): Promise<void> => {
    return new Promise((resolve) => {
      const step = stepsRef.current[index];
      if (!step) {
        resolve();
        return;
      }
      const deadline = Date.now() + 2800;
      const check = () => {
        const player = playerRef.current;
        if (!player) {
          resolve();
          return;
        }
        try {
          const state = player.getPlayerState?.();
          const current = player.getCurrentTime?.() ?? 0;
          const timeOk = current + 0.35 >= step.sourceStartTime;
          const stateOk =
            state === YT_PLAYING ||
            state === YT_BUFFERING ||
            state === YT_PAUSED;
          if ((timeOk && stateOk) || Date.now() >= deadline) {
            resolve();
            return;
          }
        } catch {
          resolve();
          return;
        }
        window.setTimeout(check, 90);
      };
      window.setTimeout(check, 180);
    });
  }, []);

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
      showPlayerOverlay(step);
      hideCenterChrome();
      seekSettledAtRef.current = Date.now() + SEEK_SETTLE_MS;
      lastObservedTimeRef.current = Math.max(0, step.sourceStartTime);
      lastTimeAdvanceAtRef.current = Date.now();

      const start = Math.max(0, step.sourceStartTime);
      try {
        if (loadedVideoIdRef.current === videoId) {
          player.seekTo(start, true);
          player.playVideo?.();
        } else {
          loadedVideoIdRef.current = videoId;
          // loadVideoById autoplays from startSeconds.
          (player as YouTubePlayerWithCue).loadVideoById?.({
            videoId,
            startSeconds: start,
          });
        }
        window.setTimeout(() => {
          try {
            player.setPlaybackRate?.(step.speed);
            if (playingRef.current) kickPlayback(player, "load");
          } catch {
            /* unsupported rate */
          }
        }, 120);
      } catch {
        /* player not ready */
      }
    },
    [videoIdForSource, showPlayerOverlay, kickPlayback, hideCenterChrome],
  );

  const stop = useCallback(() => {
    setPlayingState(false);
    pendingPlayRef.current = false;
    transitioningRef.current = false;
    setFadeOpaque(false);
    clearPlayerOverlay();
    hideCenterChrome();
    stepIndexRef.current = -1;
    repeatPassRef.current = 0;
    setStepIndex(-1);
    setRepeatPass(0);
    try {
      playerRef.current?.pauseVideo?.();
    } catch {
      /* ignore */
    }
  }, [setPlayingState, clearPlayerOverlay, hideCenterChrome]);

  const advanceToStep = useCallback(
    (index: number, pass: number, withFade: boolean) => {
      if (transitioningRef.current) return;
      const run = () => loadStep(index, pass);
      if (!withFade) {
        run();
        return;
      }
      transitioningRef.current = true;
      void runReelSegmentTransition(
        run,
        setFadeOpaque,
        () => waitForSegmentPresentable(index),
      ).finally(() => {
        transitioningRef.current = false;
      });
    },
    [loadStep, waitForSegmentPresentable],
  );

  const play = useCallback(() => {
    if (stepsRef.current.length === 0) return;
    hideCenterChrome();
    setPlayingState(true);
    if (!playerRef.current || !ready) {
      pendingPlayRef.current = true;
      return;
    }
    loadStep(0, 0);
  }, [loadStep, ready, setPlayingState, hideCenterChrome]);

  useImperativeHandle(ref, () => ({ play, stop }), [play, stop]);

  // Cue the first segment when the reel changes while idle (no autoplay).
  useEffect(() => {
    if (!ready || playingRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    const id = window.setTimeout(() => cueIdlePreview(player), 120);
    return () => window.clearTimeout(id);
  }, [steps, ready, cueIdlePreview]);

  // Advance loop: watch source time and move through repeats + segments.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !playingRef.current) return;
      const step = stepsRef.current[stepIndexRef.current];
      if (!step) return;
      if (Date.now() < seekSettledAtRef.current) return;
      let current = 0;
      let state: number | undefined;
      try {
        current = player.getCurrentTime?.() ?? 0;
        state = player.getPlayerState?.();
      } catch {
        return;
      }
      if (
        Number.isFinite(current) &&
        current > lastObservedTimeRef.current + 0.08
      ) {
        lastObservedTimeRef.current = current;
        lastTimeAdvanceAtRef.current = Date.now();
      }
      if (
        playingRef.current &&
        (state === YT_PAUSED ||
          state === YT_CUED ||
          state === YT_UNSTARTED ||
          state === YT_BUFFERING) &&
        Date.now() - lastTimeAdvanceAtRef.current > 1800
      ) {
        kickPlayback(player, "stall");
      }
      // Ignore stale times from before a seek lands on this segment.
      if (current + 0.2 < step.sourceStartTime) return;
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
  }, [playing, advanceToStep, stop, onEnded, kickPlayback]);

  const handleYoutubeStateChange = useCallback(
    (event: { data: number; target: YouTubePlayer }) => {
      handleYoutubeChromeState(event.data);
      if (!playingRef.current) return;
      const state = event.data;
      if (
        state === YT_PAUSED ||
        state === YT_CUED ||
        state === YT_UNSTARTED
      ) {
        kickPlayback(event.target, "state");
      }
      if (state === YT_ENDED) {
        const pass = repeatPassRef.current;
        const step = stepsRef.current[stepIndexRef.current];
        if (!step) return;
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
    },
    [advanceToStep, kickPlayback, onEnded, stop, handleYoutubeChromeState],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-black">
      <div
        ref={captureRef}
        data-reel-capture
        className="relative aspect-video w-full overflow-hidden bg-black"
      >
        {firstVideoId ? (
          <div className="absolute inset-0 overflow-hidden">
            <YouTube
              key={firstVideoId}
              videoId={firstVideoId}
              className="h-[126%] w-[126%] -translate-x-[13%] -translate-y-[13%]"
              iframeClassName="h-full w-full pointer-events-none"
              opts={youtubeOpts}
              onReady={(e) => {
                playerRef.current = e.target;
                loadedVideoIdRef.current = firstVideoId;
                setReady(true);
                hideCenterChrome();
                if (pendingPlayRef.current) {
                  pendingPlayRef.current = false;
                  loadStep(0, 0);
                  return;
                }
                cueIdlePreview(e.target);
              }}
              onStateChange={handleYoutubeStateChange}
            />
            <div className="pointer-events-none absolute inset-0 z-10" aria-hidden />
            {/* Mask YouTube chrome that flashes on seek / loadVideoById. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[25] h-[16%] bg-black" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[25] h-[16%] bg-black" />
            <div className="pointer-events-none absolute inset-y-0 left-0 z-[25] w-[5%] bg-black" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[25] w-[5%] bg-black" />
            {/* Safari / mobile can flash a pause badge in the top-left corner. */}
            <div className="pointer-events-none absolute left-0 top-0 z-[26] h-[14%] w-[16%] bg-black" />
            <div
              className={`pointer-events-none absolute left-1/2 top-1/2 z-[26] aspect-square w-[22%] min-w-[4.75rem] max-w-[9rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black transition-opacity duration-300 ${coverCenterChrome ? "opacity-100" : "opacity-0"}`}
              aria-hidden
            />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
            Add a segment to preview the reel.
          </div>
        )}

        {playerOverlay ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[12%] z-30 flex justify-center px-4">
            <p className="max-w-[90%] rounded-lg bg-black/80 px-4 py-2 text-center text-sm font-semibold tracking-wide text-white shadow-lg ring-1 ring-white/10">
              {playerOverlay}
            </p>
          </div>
        ) : null}

        <div
          className="pointer-events-none absolute inset-0 z-40 bg-black transition-opacity ease-in-out"
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
