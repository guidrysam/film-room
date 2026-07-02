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
import ReelInterstitial from "@/components/ReelInterstitial";
import type { ReelStep } from "@/lib/highlight-draft";
import {
  REEL_STAT_HOLD_MS,
  REEL_TITLE_HOLD_MS,
  statInterstitialFromStep,
  type ReelInterstitial as ReelInterstitialCard,
  type ReelTitleCard,
} from "@/lib/highlight-reel-cards";
import {
  REEL_FADE_HOLD_MS,
  REEL_FADE_IN_MS,
  REEL_FADE_OUT_MS,
  REEL_FADE_POST_READY_MS,
  delayMs,
} from "@/lib/highlight-reel-transition";

const POLL_MS = 150;
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
  play: () => void;
  stop: () => void;
};

export type HighlightReelPlayerProps = {
  steps: ReelStep[];
  videoIdForSource: (sourceId: string) => string | undefined;
  labelForSource?: (sourceId: string) => string | undefined;
  captureRef?: Ref<HTMLDivElement>;
  /** Shown on black before the first segment. */
  titleCard?: ReelTitleCard | null;
  onEnded?: () => void;
  onPlayingChange?: (playing: boolean) => void;
};

const HighlightReelPlayer = forwardRef<
  HighlightReelPlayerHandle,
  HighlightReelPlayerProps
>(function HighlightReelPlayer(
  {
    steps,
    videoIdForSource,
    captureRef,
    titleCard,
    onEnded,
    onPlayingChange,
  },
  ref,
) {
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [fadeOpaque, setFadeOpaque] = useState(false);
  const [interstitial, setInterstitial] = useState<ReelInterstitialCard | null>(
    null,
  );

  const playerRef = useRef<YouTubePlayer | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const stepsRef = useRef(steps);
  const titleCardRef = useRef(titleCard);
  useEffect(() => {
    stepsRef.current = steps;
  });
  useEffect(() => {
    titleCardRef.current = titleCard;
  });

  const playingRef = useRef(false);
  const stepIndexRef = useRef(-1);
  const repeatPassRef = useRef(0);
  const pendingPlayRef = useRef(false);
  const transitioningRef = useRef(false);
  const playSeqRef = useRef(0);
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

  const kickPlayback = useCallback((player: YouTubePlayer) => {
    const now = Date.now();
    if (now - lastPlayKickAtRef.current < PLAY_RETRY_MS) return;
    lastPlayKickAtRef.current = now;
    try {
      const state = player.getPlayerState?.();
      if (state === YT_PLAYING || state === YT_BUFFERING) return;
      player.playVideo?.();
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
      const deadline = Date.now() + 3200;
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

  const loadStep = useCallback(
    (index: number, pass: number) => {
      const player = playerRef.current;
      const step = stepsRef.current[index];
      if (!player || !step) return;
      const videoId = videoIdForSource(step.sourceId);
      if (!videoId) return;

      stepIndexRef.current = index;
      repeatPassRef.current = pass;
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
          (player as YouTubePlayerWithCue).loadVideoById?.({
            videoId,
            startSeconds: start,
          });
        }
        window.setTimeout(() => {
          try {
            player.setPlaybackRate?.(step.speed);
            if (playingRef.current) kickPlayback(player);
          } catch {
            /* unsupported rate */
          }
        }, 120);
      } catch {
        /* player not ready */
      }
    },
    [videoIdForSource, kickPlayback],
  );

  const presentSegmentUnderBlack = useCallback(
    async (index: number, pass: number, seq: number) => {
      const step = stepsRef.current[index];
      const stat = statInterstitialFromStep(step);
      setInterstitial(stat);

      setFadeOpaque(true);
      await delayMs(REEL_FADE_IN_MS);
      if (seq !== playSeqRef.current || !playingRef.current) return;

      loadStep(index, pass);
      await waitForSegmentPresentable(index);
      if (seq !== playSeqRef.current || !playingRef.current) return;

      await delayMs(stat ? REEL_STAT_HOLD_MS : REEL_FADE_HOLD_MS);
      await delayMs(REEL_FADE_POST_READY_MS);
      if (seq !== playSeqRef.current || !playingRef.current) return;

      setInterstitial(null);
      setFadeOpaque(false);
      await delayMs(REEL_FADE_OUT_MS);
    },
    [loadStep, waitForSegmentPresentable],
  );

  const beginPlayback = useCallback(async () => {
    const seq = ++playSeqRef.current;
    setPlayingState(true);

    const title = titleCardRef.current;
    if (title) {
      setInterstitial({ kind: "title", ...title });
      setFadeOpaque(true);
      await delayMs(REEL_FADE_IN_MS);
      await delayMs(REEL_TITLE_HOLD_MS);
      if (seq !== playSeqRef.current || !playingRef.current) return;
    }

    await presentSegmentUnderBlack(0, 0, seq);
  }, [presentSegmentUnderBlack, setPlayingState]);

  const stop = useCallback(() => {
    playSeqRef.current += 1;
    setPlayingState(false);
    pendingPlayRef.current = false;
    transitioningRef.current = false;
    setFadeOpaque(false);
    setInterstitial(null);
    stepIndexRef.current = -1;
    repeatPassRef.current = 0;
    try {
      playerRef.current?.pauseVideo?.();
    } catch {
      /* ignore */
    }
  }, [setPlayingState]);

  const transitionToSegment = useCallback(
    async (index: number, pass: number) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      const seq = playSeqRef.current;
      try {
        await presentSegmentUnderBlack(index, pass, seq);
      } finally {
        transitioningRef.current = false;
      }
    },
    [presentSegmentUnderBlack],
  );

  const advanceToStep = useCallback(
    (index: number, pass: number, withFade: boolean) => {
      if (withFade) {
        void transitionToSegment(index, pass);
        return;
      }
      loadStep(index, pass);
    },
    [loadStep, transitionToSegment],
  );

  const play = useCallback(() => {
    if (stepsRef.current.length === 0) return;
    if (!playerRef.current || !ready) {
      pendingPlayRef.current = true;
      setPlayingState(true);
      return;
    }
    void beginPlayback();
  }, [beginPlayback, ready, setPlayingState]);

  useImperativeHandle(ref, () => ({ play, stop }), [play, stop]);

  useEffect(() => {
    if (!ready || playingRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    const id = window.setTimeout(() => cueIdlePreview(player), 120);
    return () => window.clearTimeout(id);
  }, [steps, ready, cueIdlePreview]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !playingRef.current || transitioningRef.current) return;
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
        kickPlayback(player);
      }
      if (current + 0.2 < step.sourceStartTime) return;
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
      if (!playingRef.current) return;
      const state = event.data;
      if (
        state === YT_PAUSED ||
        state === YT_CUED ||
        state === YT_UNSTARTED
      ) {
        kickPlayback(event.target);
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
    [advanceToStep, kickPlayback, onEnded, stop],
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
              className="h-full w-full"
              iframeClassName="h-full w-full pointer-events-none"
              opts={youtubeOpts}
              onReady={(e) => {
                playerRef.current = e.target;
                loadedVideoIdRef.current = firstVideoId;
                setReady(true);
                if (pendingPlayRef.current) {
                  pendingPlayRef.current = false;
                  void beginPlayback();
                  return;
                }
                cueIdlePreview(e.target);
              }}
              onStateChange={handleYoutubeStateChange}
            />
            <div className="pointer-events-none absolute inset-0 z-10" aria-hidden />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
            Add a segment to preview the reel.
          </div>
        )}

        {interstitial && fadeOpaque ? (
          <div className="pointer-events-none absolute inset-0 z-[45] bg-black">
            <ReelInterstitial card={interstitial} />
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
