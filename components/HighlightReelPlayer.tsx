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
import MatchScoreboardOverlay from "@/components/MatchScoreboardOverlay";
import YoutubeChromelessStage from "@/components/YoutubeChromelessStage";
import type { ReelStep } from "@/lib/highlight-draft";
import {
  gameTimeFromReelPlayback,
  scoreboardAtGameTime,
  type ScoreboardState,
  type ScoreboardTick,
} from "@/lib/game-scoreboard";
import {
  REEL_AUDIO_FADE_MS,
  REEL_END_HOLD_MS,
  REEL_TITLE_HOLD_MS,
  buildReelEndCard,
  sponsorInterstitialForCut,
  statInterstitialFromStep,
  type ReelInterstitial as ReelInterstitialCard,
  type ReelTitleCard,
} from "@/lib/highlight-reel-cards";
import type { HighlightSponsorLogo } from "@/lib/highlight-sponsors";
import { reelStepTransitionKind } from "@/lib/highlight-reel-event";
import {
  REEL_FADE_IN_MS,
  REEL_FADE_OUT_MS,
  REEL_USE_BLACK_TRANSITIONS,
  delayMs,
  reelPlaybackStartSec,
  reelPrerollWallMs,
  reelTransitionLeadSec,
} from "@/lib/highlight-reel-transition";
import { computeKenBurnsScale } from "@/lib/highlight-ken-burns";
import { YOUTUBE_CHROMELESS_PLAYER_VARS } from "@/lib/youtube-player-vars";

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

export type HighlightReelScoreboard = {
  ticks: ScoreboardTick[];
  homeName: string;
  awayName: string;
};

export type HighlightReelPlayerProps = {
  steps: ReelStep[];
  videoIdForSource: (sourceId: string) => string | undefined;
  labelForSource?: (sourceId: string) => string | undefined;
  captureRef?: Ref<HTMLDivElement>;
  /** Shown on black before the first segment. */
  titleCard?: ReelTitleCard | null;
  /** Live match scoreboard reconstructed from Game Cap / timeline marks. */
  scoreboard?: HighlightReelScoreboard | null;
  /**
   * Playable URL for the reel bed (blob: or /api/reel/.../soundtrack).
   * When set, YouTube segment audio is muted so the song is the bed.
   */
  soundtrackUrl?: string | null;
  /** Sponsor logos cycled on black cuts between clips. */
  sponsors?: HighlightSponsorLogo[] | null;
  /** Custom thank-you copy on sponsor cuts (default if omitted). */
  thankYouMessage?: string | null;
  /**
   * When true, start the reel once the YouTube player is ready
   * (shared watch page — user already pressed Watch).
   */
  autoPlay?: boolean;
  /** Hide the transport chrome (shared fullscreen watch). */
  hideChrome?: boolean;
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
    scoreboard,
    soundtrackUrl,
    sponsors,
    thankYouMessage,
    autoPlay = false,
    hideChrome = false,
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
  const [kenBurnsScale, setKenBurnsScale] = useState(1);
  const [liveScore, setLiveScore] = useState<ScoreboardState | null>(null);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const stepsRef = useRef(steps);
  const titleCardRef = useRef(titleCard);
  const scoreboardRef = useRef(scoreboard);
  const soundtrackUrlRef = useRef(soundtrackUrl);
  const sponsorsRef = useRef(sponsors);
  const thankYouMessageRef = useRef(thankYouMessage);
  const cutIndexRef = useRef(0);
  useEffect(() => {
    stepsRef.current = steps;
  });
  useEffect(() => {
    titleCardRef.current = titleCard;
  });
  useEffect(() => {
    scoreboardRef.current = scoreboard;
  });
  useEffect(() => {
    soundtrackUrlRef.current = soundtrackUrl;
  });
  useEffect(() => {
    sponsorsRef.current = sponsors;
  });
  useEffect(() => {
    thankYouMessageRef.current = thankYouMessage;
  });

  const playingRef = useRef(false);
  const stepIndexRef = useRef(-1);
  const repeatPassRef = useRef(0);
  const pendingPlayRef = useRef(false);
  const transitioningRef = useRef(false);
  const preTransitionArmRef = useRef(false);
  const finishingRef = useRef(false);
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

  const applyScoreboardAtGameTime = useCallback((gameTime: number) => {
    const board = scoreboardRef.current;
    if (!board) {
      setLiveScore(null);
      return;
    }
    const next = scoreboardAtGameTime(board.ticks, gameTime, {
      homeName: board.homeName,
      awayName: board.awayName,
    });
    setLiveScore((prev) => {
      if (
        prev &&
        prev.home === next.home &&
        prev.away === next.away &&
        prev.homeName === next.homeName &&
        prev.awayName === next.awayName
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const syncScoreboardFromPlayback = useCallback(
    (sourcePlaybackSec: number, step: ReelStep | undefined) => {
      if (!scoreboardRef.current || !step) return;
      const gameTime = gameTimeFromReelPlayback(step, sourcePlaybackSec);
      if (gameTime == null) {
        if (typeof step.gameStartTime === "number") {
          applyScoreboardAtGameTime(step.gameStartTime);
        }
        return;
      }
      applyScoreboardAtGameTime(gameTime);
    },
    [applyScoreboardAtGameTime],
  );

  useEffect(() => {
    if (!scoreboard) {
      setLiveScore(null);
      return;
    }
    const first = steps[0];
    const t =
      typeof first?.gameStartTime === "number" ? first.gameStartTime : 0;
    applyScoreboardAtGameTime(t);
  }, [scoreboard, steps, applyScoreboardAtGameTime]);

  const firstVideoId = steps[0]
    ? videoIdForSource(steps[0].sourceId)
    : undefined;

  const youtubeOpts = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 0,
        ...YOUTUBE_CHROMELESS_PLAYER_VARS,
      },
    }),
    [],
  );

  const setStageNode = useCallback(
    (node: HTMLDivElement | null) => {
      stageRef.current = node;
      if (!captureRef) return;
      if (typeof captureRef === "function") {
        captureRef(node);
      } else {
        (captureRef as { current: HTMLDivElement | null }).current = node;
      }
    },
    [captureRef],
  );

  const syncPlayerSize = useCallback((player?: YouTubePlayer | null) => {
    const el = stageRef.current;
    const pl = player ?? playerRef.current;
    if (!el || !pl) return;
    const w = Math.round(el.clientWidth);
    const h = Math.round(el.clientHeight);
    if (w < 2 || h < 2) return;
    try {
      pl.setSize?.(w, h);
    } catch {
      /* player not ready */
    }
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => syncPlayerSize());
    ro.observe(el);
    syncPlayerSize();
    return () => ro.disconnect();
  }, [syncPlayerSize, firstVideoId, ready]);

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

  const applyYouTubeMuteForSoundtrack = useCallback((player?: YouTubePlayer | null) => {
    const pl = player ?? playerRef.current;
    if (!pl) return;
    try {
      if (soundtrackUrlRef.current) {
        pl.mute?.();
        pl.setVolume?.(0);
      } else {
        pl.unMute?.();
        pl.setVolume?.(100);
      }
    } catch {
      /* player not ready */
    }
  }, []);

  const stopSoundtrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
    } catch {
      /* ignore */
    }
  }, []);

  const fadeSoundtrackOut = useCallback(async (ms: number, seq: number) => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const startVol =
      typeof audio.volume === "number" && Number.isFinite(audio.volume)
        ? audio.volume
        : 1;
    const steps = 24;
    const dt = Math.max(16, ms / steps);
    for (let i = 1; i <= steps; i += 1) {
      if (seq !== playSeqRef.current) return;
      try {
        audio.volume = Math.max(0, startVol * (1 - i / steps));
      } catch {
        break;
      }
      await delayMs(dt);
    }
    if (seq !== playSeqRef.current) return;
    try {
      audio.pause();
      audio.volume = 1;
    } catch {
      /* ignore */
    }
  }, []);

  const startSoundtrack = useCallback(async () => {
    const audio = audioRef.current;
    const url = soundtrackUrlRef.current;
    if (!audio || !url) return;
    try {
      if (audio.src !== url && !audio.src.endsWith(url)) {
        audio.src = url;
      }
      audio.volume = 1;
      audio.currentTime = 0;
      await audio.play();
    } catch {
      /* autoplay / decode — fail soft */
    }
  }, []);

  useEffect(() => {
    applyYouTubeMuteForSoundtrack();
  }, [soundtrackUrl, ready, applyYouTubeMuteForSoundtrack]);

  /** Park on the first segment without cue/load thrash (matches Review embed). */
  const cueIdlePreview = useCallback(
    (player: YouTubePlayer) => {
      if (playingRef.current) return;
      const step = stepsRef.current[0];
      if (!step) return;
      const videoId = videoIdForSource(step.sourceId);
      if (!videoId) return;
      const start = Math.max(0, step.sourceStartTime);
      try {
        if (loadedVideoIdRef.current === videoId) {
          player.seekTo?.(start, true);
          applyYouTubeMuteForSoundtrack(player);
          return;
        }
        const yt = player as YouTubePlayerWithCue;
        yt.cueVideoById?.({ videoId, startSeconds: start });
        loadedVideoIdRef.current = videoId;
        applyYouTubeMuteForSoundtrack(player);
      } catch {
        /* player not ready */
      }
    },
    [videoIdForSource, applyYouTubeMuteForSoundtrack],
  );

  const waitForSegmentPlaying = useCallback(
    (index: number): Promise<void> => {
      return new Promise((resolve) => {
        const step = stepsRef.current[index];
        if (!step) {
          resolve();
          return;
        }
        // Shared/mobile players often need longer than a few seconds to leave
        // UNSTARTED after loadVideoById — keep kicking until deadline.
        const deadline = Date.now() + 10000;
        const playbackStart = reelPlaybackStartSec(
          step.sourceStartTime,
          REEL_USE_BLACK_TRANSITIONS,
          step.speed,
        );
        const check = () => {
          const player = playerRef.current;
          if (!player) {
            resolve();
            return;
          }
          try {
            const state = player.getPlayerState?.();
            const current = player.getCurrentTime?.() ?? 0;
            const timeOk =
              playbackStart <= 0.5
                ? current >= 0
                : current + 0.55 >= playbackStart;
            const playingOk =
              state === YT_PLAYING || state === YT_BUFFERING;
            if (timeOk && playingOk) {
              resolve();
              return;
            }
            if (
              state === YT_PAUSED ||
              state === YT_CUED ||
              state === YT_UNSTARTED ||
              state === YT_BUFFERING
            ) {
              kickPlayback(player);
            }
            if (Date.now() >= deadline) {
              kickPlayback(player);
              resolve();
              return;
            }
          } catch {
            resolve();
            return;
          }
          window.setTimeout(check, 90);
        };
        window.setTimeout(check, 120);
      });
    },
    [kickPlayback],
  );

  const waitUntilSourceTime = useCallback(
    (targetTime: number, seq: number): Promise<void> => {
      return new Promise((resolve) => {
        const deadline = Date.now() + 8000;
        const check = () => {
          if (seq !== playSeqRef.current || !playingRef.current) {
            resolve();
            return;
          }
          const player = playerRef.current;
          if (!player) {
            resolve();
            return;
          }
          try {
            const current = player.getCurrentTime?.() ?? 0;
            if (current >= targetTime - 0.05 || Date.now() >= deadline) {
              resolve();
              return;
            }
          } catch {
            resolve();
            return;
          }
          window.setTimeout(check, 50);
        };
        check();
      });
    },
    [],
  );

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
      const playbackStart = reelPlaybackStartSec(
        step.sourceStartTime,
        REEL_USE_BLACK_TRANSITIONS,
        step.speed,
      );
      lastObservedTimeRef.current = Math.max(0, playbackStart);
      lastTimeAdvanceAtRef.current = Date.now();

      const start = playbackStart;
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
          if (playingRef.current) {
            window.setTimeout(() => kickPlayback(player), 180);
          }
        }
        window.setTimeout(() => {
          try {
            player.setPlaybackRate?.(step.speed);
            applyYouTubeMuteForSoundtrack(player);
            if (playingRef.current) kickPlayback(player);
          } catch {
            /* unsupported rate */
          }
        }, 120);
      } catch {
        /* player not ready */
      }
    },
    [videoIdForSource, kickPlayback, applyYouTubeMuteForSoundtrack],
  );

  const ensureSegmentPlaying = useCallback(
    (index: number, pass: number, reuseIfSame: boolean) => {
      const player = playerRef.current;
      if (!player) return;
      if (
        reuseIfSame &&
        stepIndexRef.current === index &&
        repeatPassRef.current === pass
      ) {
        kickPlayback(player);
        return;
      }
      loadStep(index, pass);
    },
    [kickPlayback, loadStep],
  );

  const presentSegmentUnderBlack = useCallback(
    async (
      index: number,
      pass: number,
      seq: number,
      options?: { alreadyBlack?: boolean; segmentStarted?: boolean },
    ) => {
      const { alreadyBlack = false, segmentStarted = false } = options ?? {};
      const step = stepsRef.current[index];
      // Keep the title card on-screen through first-clip preroll so YouTube
      // chrome stays covered under the branded black.
      if (!(alreadyBlack && segmentStarted)) {
        setInterstitial(step ? statInterstitialFromStep(step) : null);
      }

      const clearCover = () => {
        setInterstitial(null);
        setFadeOpaque(false);
      };

      try {
        if (!step) {
          clearCover();
          return;
        }
        if (!alreadyBlack) {
          setFadeOpaque(true);
          if (!segmentStarted) ensureSegmentPlaying(index, pass, false);
          if (seq !== playSeqRef.current || !playingRef.current) return;
        } else if (segmentStarted) {
          // Force a fresh seek/play — reuse-only kick often no-ops while cued.
          ensureSegmentPlaying(index, pass, false);
        } else {
          ensureSegmentPlaying(index, pass, false);
        }

        await waitForSegmentPlaying(index);
        if (seq !== playSeqRef.current || !playingRef.current) return;

        await delayMs(reelPrerollWallMs(step.speed));
        if (seq !== playSeqRef.current || !playingRef.current) return;

        clearCover();
        await delayMs(REEL_FADE_OUT_MS);
      } catch {
        if (seq === playSeqRef.current) clearCover();
      } finally {
        if (seq !== playSeqRef.current || !playingRef.current) {
          clearCover();
        }
      }
    },
    [ensureSegmentPlaying, waitForSegmentPlaying],
  );

  const runPreRollTransition = useCallback(
    async (
      fromIndex: number,
      toIndex: number,
      toPass: number,
      kind: "event" | "beat",
    ) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      preTransitionArmRef.current = true;
      const seq = playSeqRef.current;
      const fromStep = stepsRef.current[fromIndex];
      const toStep = stepsRef.current[toIndex];
      if (!fromStep || !toStep) {
        transitioningRef.current = false;
        preTransitionArmRef.current = false;
        return;
      }

      try {
        const cut = cutIndexRef.current++;
        const sponsorCard = sponsorInterstitialForCut(
          sponsorsRef.current,
          cut,
          { message: thankYouMessageRef.current },
        );
        if (sponsorCard) {
          setInterstitial(sponsorCard);
        } else if (kind === "event") {
          setInterstitial(statInterstitialFromStep(toStep));
        } else {
          setInterstitial(null);
        }
        setFadeOpaque(true);
        if (seq !== playSeqRef.current || !playingRef.current) return;

        await waitUntilSourceTime(fromStep.sourceEndTime, seq);
        if (seq !== playSeqRef.current || !playingRef.current) return;

        ensureSegmentPlaying(toIndex, toPass, false);
        await waitForSegmentPlaying(toIndex);
        if (seq !== playSeqRef.current || !playingRef.current) return;

        await delayMs(reelPrerollWallMs(toStep.speed));
        if (seq !== playSeqRef.current || !playingRef.current) return;

        setInterstitial(null);
        setFadeOpaque(false);
        await delayMs(REEL_FADE_OUT_MS);
      } finally {
        transitioningRef.current = false;
        preTransitionArmRef.current = false;
        if (seq !== playSeqRef.current || !playingRef.current) {
          setInterstitial(null);
          setFadeOpaque(false);
        }
      }
    },
    [ensureSegmentPlaying, waitForSegmentPlaying, waitUntilSourceTime],
  );

  const beginPlayback = useCallback(async () => {
    const seq = ++playSeqRef.current;
    cutIndexRef.current = 0;
    finishingRef.current = false;
    setPlayingState(true);
    void startSoundtrack();
    applyYouTubeMuteForSoundtrack();

    if (!REEL_USE_BLACK_TRANSITIONS) {
      setInterstitial(null);
      setFadeOpaque(false);
      loadStep(0, 0);
      return;
    }

    const title = titleCardRef.current;
    let segmentStarted = false;
    try {
      if (title) {
        setInterstitial({ kind: "title", ...title });
        setFadeOpaque(true);
        ensureSegmentPlaying(0, 0, false);
        segmentStarted = true;
        await delayMs(REEL_FADE_IN_MS);
        await delayMs(REEL_TITLE_HOLD_MS);
        if (seq !== playSeqRef.current) return;
        if (!playingRef.current) {
          setInterstitial(null);
          setFadeOpaque(false);
          return;
        }
      }

      await presentSegmentUnderBlack(0, 0, seq, {
        alreadyBlack: !!title,
        segmentStarted,
      });
    } catch {
      if (seq === playSeqRef.current) {
        setInterstitial(null);
        setFadeOpaque(false);
      }
    }
  }, [
    ensureSegmentPlaying,
    loadStep,
    presentSegmentUnderBlack,
    setPlayingState,
    startSoundtrack,
    applyYouTubeMuteForSoundtrack,
  ]);

  const transitionToNextStep = useCallback(
    (fromIndex: number, nextIndex: number, pass: number) => {
      if (!REEL_USE_BLACK_TRANSITIONS) {
        loadStep(nextIndex, pass);
        return;
      }
      const cur = stepsRef.current[fromIndex];
      const next = stepsRef.current[nextIndex];
      const kind = reelStepTransitionKind(cur, next);
      void runPreRollTransition(
        fromIndex,
        nextIndex,
        pass,
        kind === "beat" ? "beat" : "event",
      );
    },
    [loadStep, runPreRollTransition],
  );

  const stop = useCallback(() => {
    playSeqRef.current += 1;
    finishingRef.current = false;
    setPlayingState(false);
    pendingPlayRef.current = false;
    transitioningRef.current = false;
    preTransitionArmRef.current = false;
    setFadeOpaque(false);
    setInterstitial(null);
    stepIndexRef.current = -1;
    repeatPassRef.current = 0;
    stopSoundtrack();
    try {
      playerRef.current?.pauseVideo?.();
    } catch {
      /* ignore */
    }
  }, [setPlayingState, stopSoundtrack]);

  const finishReel = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const seq = playSeqRef.current;
    transitioningRef.current = true;
    preTransitionArmRef.current = true;

    const endCard = buildReelEndCard(sponsorsRef.current, {
      message: thankYouMessageRef.current,
    });
    setInterstitial(endCard);
    setFadeOpaque(true);
    try {
      playerRef.current?.pauseVideo?.();
    } catch {
      /* ignore */
    }

    try {
      await Promise.all([
        fadeSoundtrackOut(REEL_AUDIO_FADE_MS, seq),
        delayMs(REEL_END_HOLD_MS),
      ]);
    } finally {
      if (seq !== playSeqRef.current) {
        finishingRef.current = false;
        return;
      }
      finishingRef.current = false;
      transitioningRef.current = false;
      preTransitionArmRef.current = false;
      setPlayingState(false);
      stepIndexRef.current = -1;
      repeatPassRef.current = 0;
      // Leave the end card up; a later Stop / Play clears it.
      onEnded?.();
    }
  }, [fadeSoundtrackOut, onEnded, setPlayingState]);

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

  /** Shared watch page: start after Watch while player finishes becoming ready. */
  useEffect(() => {
    if (!autoPlay || playingRef.current) return;
    if (!ready || !playerRef.current) {
      pendingPlayRef.current = true;
      return;
    }
    play();
  }, [autoPlay, ready, play]);

  useEffect(() => {
    if (!ready || playingRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    const id = window.setTimeout(() => cueIdlePreview(player), 120);
    return () => window.clearTimeout(id);
  }, [steps, ready, cueIdlePreview]);

  useEffect(() => {
    if (!playing) {
      setKenBurnsScale(1);
      return;
    }
    let raf = 0;
    const tick = () => {
      if (!playingRef.current) {
        setKenBurnsScale(1);
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const step = stepsRef.current[stepIndexRef.current];
      const player = playerRef.current;
      if (
        !step?.kenBurns ||
        !player ||
        transitioningRef.current ||
        Date.now() < seekSettledAtRef.current
      ) {
        setKenBurnsScale(1);
      } else {
        try {
          const current = player.getCurrentTime?.() ?? step.sourceStartTime;
          const span = Math.max(
            0.001,
            step.sourceEndTime - step.sourceStartTime,
          );
          const progress = Math.min(
            1,
            Math.max(0, (current - step.sourceStartTime) / span),
          );
          setKenBurnsScale(computeKenBurnsScale(progress));
        } catch {
          setKenBurnsScale(1);
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !playingRef.current || transitioningRef.current || finishingRef.current) return;
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
      syncScoreboardFromPlayback(current, step);
      const pass = repeatPassRef.current;
      const nextIndex = stepIndexRef.current + 1;
      const hasNextStep = nextIndex < stepsRef.current.length;

      if (
        REEL_USE_BLACK_TRANSITIONS &&
        !transitioningRef.current &&
        !preTransitionArmRef.current &&
        pass + 1 >= step.repeat &&
        hasNextStep
      ) {
        const leadSec = reelTransitionLeadSec(step);
        if (leadSec > 0 && current >= step.sourceEndTime - leadSec) {
          transitionToNextStep(stepIndexRef.current, nextIndex, 0);
          return;
        }
      }

      if (current >= step.sourceEndTime - 0.05) {
        if (pass + 1 < step.repeat) {
          loadStep(stepIndexRef.current, pass + 1);
          return;
        }
        if (!hasNextStep) {
          void finishReel();
          return;
        }
        if (REEL_USE_BLACK_TRANSITIONS) {
          if (!transitioningRef.current && !preTransitionArmRef.current) {
            transitionToNextStep(stepIndexRef.current, nextIndex, 0);
          }
        } else {
          loadStep(nextIndex, 0);
        }
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [
    playing,
    loadStep,
    transitionToNextStep,
    finishReel,
    kickPlayback,
    syncScoreboardFromPlayback,
  ]);

  const handleYoutubeStateChange = useCallback(
    (event: { data: number; target: YouTubePlayer }) => {
      if (!playingRef.current || finishingRef.current) return;
      const state = event.data;
      if (
        state === YT_PAUSED ||
        state === YT_CUED ||
        state === YT_UNSTARTED
      ) {
        kickPlayback(event.target);
      }
      if (state === YT_ENDED) {
        if (transitioningRef.current || preTransitionArmRef.current) return;
        const pass = repeatPassRef.current;
        const step = stepsRef.current[stepIndexRef.current];
        if (!step) return;
        if (pass + 1 < step.repeat) {
          loadStep(stepIndexRef.current, pass + 1);
          return;
        }
        const nextIndex = stepIndexRef.current + 1;
        if (nextIndex >= stepsRef.current.length) {
          void finishReel();
          return;
        }
        transitionToNextStep(stepIndexRef.current, nextIndex, 0);
      }
    },
    [kickPlayback, loadStep, finishReel, transitionToNextStep],
  );

  return (
    <div
      className={`overflow-hidden bg-black ${
        hideChrome
          ? "h-full w-full"
          : "rounded-lg border border-white/[0.08]"
      }`}
    >      <audio ref={audioRef} preload="auto" className="hidden" />
      <div
        ref={setStageNode}
        data-reel-capture
        className={`relative overflow-hidden bg-black ${
          hideChrome ? "h-full w-full" : "aspect-video w-full"
        }`}
      >
        {firstVideoId ? (
          <YoutubeChromelessStage className="absolute inset-0 h-full w-full overflow-hidden bg-black">
            <div
              className="h-full w-full"
              style={{
                transform:
                  playing && kenBurnsScale !== 1
                    ? `scale(${kenBurnsScale})`
                    : undefined,
                transformOrigin: "center center",
              }}
            >
              <YouTube
                key={firstVideoId}
                videoId={firstVideoId}
                className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
                iframeClassName="h-full w-full"
                opts={youtubeOpts}
                onReady={(e) => {
                  playerRef.current = e.target;
                  loadedVideoIdRef.current = firstVideoId;
                  syncPlayerSize(e.target);
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
            </div>
          </YoutubeChromelessStage>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
            Add a segment to preview the reel.
          </div>
        )}

        {REEL_USE_BLACK_TRANSITIONS && interstitial && fadeOpaque ? (
          <div className="pointer-events-none absolute inset-0 z-[45] bg-black">
            <ReelInterstitial card={interstitial} />
          </div>
        ) : null}

        {REEL_USE_BLACK_TRANSITIONS ? (
          <div
            className="pointer-events-none absolute inset-0 z-40 bg-black transition-opacity ease-in-out"
            style={{
              opacity: fadeOpaque ? 1 : 0,
              transitionDuration: `${fadeOpaque ? REEL_FADE_IN_MS : REEL_FADE_OUT_MS}ms`,
            }}
            aria-hidden
          />
        ) : null}

        {liveScore && !fadeOpaque ? (
          <MatchScoreboardOverlay score={liveScore} />
        ) : null}
      </div>

      {!hideChrome ? (
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
            {soundtrackUrl ? " · song bed" : ""}
            {!REEL_USE_BLACK_TRANSITIONS ? " · direct cuts (no black)" : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
});

export default HighlightReelPlayer;
