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
  delayMs,
  reelPlaybackStartSec,
  reelPrerollWallMs,
} from "@/lib/highlight-reel-transition";
import {
  REEL_USE_STACKED_PLAYERS,
  reelDeckAtInPoint,
  reelDeckMinPrerollWallMs,
  reelStackStageLeadSec,
} from "@/lib/highlight-reel-stack";
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

type DeckTarget = {
  index: number;
  pass: number;
  videoId: string;
  startedAt: number;
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
  /** Sponsor logos cycled on cuts between clips. */
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
  const [readySlots, setReadySlots] = useState<[boolean, boolean]>([
    false,
    false,
  ]);
  const [frontSlot, setFrontSlot] = useState(0);
  const [fadeOpaque, setFadeOpaque] = useState(false);
  const [interstitial, setInterstitial] = useState<ReelInterstitialCard | null>(
    null,
  );
  const [kenBurnsScale, setKenBurnsScale] = useState(1);
  const [liveScore, setLiveScore] = useState<ScoreboardState | null>(null);

  const playersRef = useRef<[YouTubePlayer | null, YouTubePlayer | null]>([
    null,
    null,
  ]);
  const loadedVideoIdsRef = useRef<[string | null, string | null]>([
    null,
    null,
  ]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stepsRef = useRef(steps);
  const titleCardRef = useRef(titleCard);
  const scoreboardRef = useRef(scoreboard);
  const soundtrackUrlRef = useRef(soundtrackUrl);
  const sponsorsRef = useRef(sponsors);
  const thankYouMessageRef = useRef(thankYouMessage);
  const cutIndexRef = useRef(0);
  const frontSlotRef = useRef(0);
  const videoIdForSourceRef = useRef(videoIdForSource);

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
  useEffect(() => {
    videoIdForSourceRef.current = videoIdForSource;
  });
  useEffect(() => {
    frontSlotRef.current = frontSlot;
  }, [frontSlot]);

  const playingRef = useRef(false);
  const stepIndexRef = useRef(-1);
  const repeatPassRef = useRef(0);
  const pendingPlayRef = useRef(false);
  const transitioningRef = useRef(false);
  const finishingRef = useRef(false);
  const playSeqRef = useRef(0);
  const seekSettledAtRef = useRef(0);
  const lastPlayKickAtRef = useRef(0);
  const lastObservedTimeRef = useRef(0);
  const lastTimeAdvanceAtRef = useRef(0);
  const deckTargetRef = useRef<DeckTarget | null>(null);
  const deckReadyRef = useRef<DeckTarget | null>(null);
  const stagingRef = useRef(false);

  const bothReady = readySlots[0] && readySlots[1];
  const ready = REEL_USE_STACKED_PLAYERS ? bothReady : readySlots[0];

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

  const deckSlotOf = useCallback((front: number) => (front === 0 ? 1 : 0), []);

  const syncPlayerSize = useCallback((player?: YouTubePlayer | null) => {
    const el = stageRef.current;
    if (!el) return;
    const w = Math.round(el.clientWidth);
    const h = Math.round(el.clientHeight);
    if (w < 2 || h < 2) return;
    const targets = player
      ? [player]
      : playersRef.current.filter(Boolean);
    for (const pl of targets) {
      try {
        pl?.setSize?.(w, h);
      } catch {
        /* player not ready */
      }
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

  const mutePlayer = useCallback((player: YouTubePlayer | null | undefined) => {
    if (!player) return;
    try {
      player.mute?.();
      player.setVolume?.(0);
    } catch {
      /* ignore */
    }
  }, []);

  const applyFrontAudio = useCallback(
    (player?: YouTubePlayer | null) => {
      const pl =
        player ?? playersRef.current[frontSlotRef.current] ?? null;
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
    },
    [],
  );

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
    const n = 24;
    const dt = Math.max(16, ms / n);
    for (let i = 1; i <= n; i += 1) {
      if (seq !== playSeqRef.current) return;
      try {
        audio.volume = Math.max(0, startVol * (1 - i / n));
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
    applyFrontAudio();
  }, [soundtrackUrl, ready, frontSlot, applyFrontAudio]);

  const loadOnSlot = useCallback(
    (
      slot: number,
      index: number,
      pass: number,
      opts: { preroll: boolean; play: boolean; mute: boolean },
    ) => {
      const player = playersRef.current[slot];
      const step = stepsRef.current[index];
      if (!player || !step) return;
      const videoId = videoIdForSourceRef.current(step.sourceId);
      if (!videoId) return;

      const playbackStart = reelPlaybackStartSec(
        step.sourceStartTime,
        opts.preroll,
        step.speed,
      );
      seekSettledAtRef.current = Date.now() + SEEK_SETTLE_MS;
      lastObservedTimeRef.current = Math.max(0, playbackStart);
      lastTimeAdvanceAtRef.current = Date.now();

      try {
        if (opts.mute) mutePlayer(player);
        if (loadedVideoIdsRef.current[slot] === videoId) {
          player.seekTo?.(playbackStart, true);
          if (opts.play) player.playVideo?.();
        } else {
          loadedVideoIdsRef.current[slot] = videoId;
          if (opts.play) {
            (player as YouTubePlayerWithCue).loadVideoById?.({
              videoId,
              startSeconds: playbackStart,
            });
            window.setTimeout(() => kickPlayback(player), 180);
          } else {
            (player as YouTubePlayerWithCue).cueVideoById?.({
              videoId,
              startSeconds: playbackStart,
            });
          }
        }
        window.setTimeout(() => {
          try {
            player.setPlaybackRate?.(step.speed);
            if (opts.mute) mutePlayer(player);
            else if (slot === frontSlotRef.current) applyFrontAudio(player);
            if (opts.play) kickPlayback(player);
          } catch {
            /* unsupported rate */
          }
        }, 120);
      } catch {
        /* player not ready */
      }
    },
    [applyFrontAudio, kickPlayback, mutePlayer],
  );

  const cueIdlePreview = useCallback(
    (player: YouTubePlayer, slot = 0) => {
      if (playingRef.current) return;
      const step = stepsRef.current[0];
      if (!step) return;
      const videoId = videoIdForSourceRef.current(step.sourceId);
      if (!videoId) return;
      const start = Math.max(0, step.sourceStartTime);
      try {
        if (loadedVideoIdsRef.current[slot] === videoId) {
          player.seekTo?.(start, true);
          applyFrontAudio(player);
          return;
        }
        (player as YouTubePlayerWithCue).cueVideoById?.({
          videoId,
          startSeconds: start,
        });
        loadedVideoIdsRef.current[slot] = videoId;
        applyFrontAudio(player);
      } catch {
        /* player not ready */
      }
    },
    [applyFrontAudio],
  );

  const waitForSlotPlaying = useCallback(
    (slot: number, index: number, usePreroll: boolean): Promise<void> => {
      return new Promise((resolve) => {
        const step = stepsRef.current[index];
        if (!step) {
          resolve();
          return;
        }
        const deadline = Date.now() + 10000;
        const playbackStart = reelPlaybackStartSec(
          step.sourceStartTime,
          usePreroll,
          step.speed,
        );
        const check = () => {
          const player = playersRef.current[slot];
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

  const clearDeck = useCallback(() => {
    deckTargetRef.current = null;
    deckReadyRef.current = null;
    stagingRef.current = false;
  }, []);

  const pauseSlot = useCallback((slot: number) => {
    try {
      playersRef.current[slot]?.pauseVideo?.();
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * Load next clip on the hidden deck, preroll muted through YouTube chrome,
   * then pause at the highlight in-point until swap.
   */
  const stageOnDeck = useCallback(
    async (index: number, pass: number, seq: number) => {
      if (!REEL_USE_STACKED_PLAYERS) return;
      if (!playingRef.current || seq !== playSeqRef.current) return;
      const step = stepsRef.current[index];
      if (!step) return;
      const videoId = videoIdForSourceRef.current(step.sourceId);
      if (!videoId) return;

      const ready = deckReadyRef.current;
      if (ready && ready.index === index && ready.pass === pass) return;
      const target = deckTargetRef.current;
      if (
        stagingRef.current &&
        target &&
        target.index === index &&
        target.pass === pass
      ) {
        return;
      }

      stagingRef.current = true;
      deckReadyRef.current = null;
      const front = frontSlotRef.current;
      const deck = deckSlotOf(front);
      const startedAt = Date.now();
      deckTargetRef.current = { index, pass, videoId, startedAt };

      mutePlayer(playersRef.current[deck]);
      loadOnSlot(deck, index, pass, {
        preroll: true,
        play: true,
        mute: true,
      });

      await waitForSlotPlaying(deck, index, true);
      if (seq !== playSeqRef.current || !playingRef.current) {
        stagingRef.current = false;
        return;
      }
      if (
        !deckTargetRef.current ||
        deckTargetRef.current.index !== index ||
        deckTargetRef.current.pass !== pass
      ) {
        stagingRef.current = false;
        return;
      }

      const minWall = reelDeckMinPrerollWallMs();
      const deadline = startedAt + minWall + 4000;
      await new Promise<void>((resolve) => {
        const check = () => {
          if (seq !== playSeqRef.current || !playingRef.current) {
            resolve();
            return;
          }
          if (
            !deckTargetRef.current ||
            deckTargetRef.current.index !== index ||
            deckTargetRef.current.pass !== pass
          ) {
            resolve();
            return;
          }
          const player = playersRef.current[deck];
          if (!player) {
            resolve();
            return;
          }
          try {
            const current = player.getCurrentTime?.() ?? 0;
            const state = player.getPlayerState?.();
            if (
              state === YT_PAUSED ||
              state === YT_CUED ||
              state === YT_UNSTARTED ||
              state === YT_BUFFERING
            ) {
              kickPlayback(player);
            }
            const wallOk = Date.now() - startedAt >= minWall;
            if (wallOk && reelDeckAtInPoint(current, step.sourceStartTime)) {
              resolve();
              return;
            }
            if (Date.now() >= deadline) {
              resolve();
              return;
            }
          } catch {
            resolve();
            return;
          }
          window.setTimeout(check, 80);
        };
        check();
      });

      if (seq !== playSeqRef.current || !playingRef.current) {
        stagingRef.current = false;
        return;
      }
      if (
        !deckTargetRef.current ||
        deckTargetRef.current.index !== index ||
        deckTargetRef.current.pass !== pass
      ) {
        stagingRef.current = false;
        return;
      }

      const player = playersRef.current[deck];
      try {
        // Park exactly on the in-point so the swap is frame-accurate.
        player?.seekTo?.(step.sourceStartTime, true);
        player?.pauseVideo?.();
        mutePlayer(player);
        player?.setPlaybackRate?.(step.speed);
      } catch {
        /* ignore */
      }

      deckReadyRef.current = { index, pass, videoId, startedAt };
      stagingRef.current = false;
    },
    [deckSlotOf, kickPlayback, loadOnSlot, mutePlayer, waitForSlotPlaying],
  );

  const maybeStageNext = useCallback(
    (seq: number) => {
      if (!REEL_USE_STACKED_PLAYERS) return;
      if (!playingRef.current || finishingRef.current) return;
      const cur = stepIndexRef.current;
      if (cur < 0) return;
      const step = stepsRef.current[cur];
      if (!step) return;
      const pass = repeatPassRef.current;
      if (pass + 1 < step.repeat) {
        void stageOnDeck(cur, pass + 1, seq);
        return;
      }
      const next = cur + 1;
      if (next >= stepsRef.current.length) return;
      void stageOnDeck(next, 0, seq);
    },
    [stageOnDeck],
  );

  const promoteDeck = useCallback(
    (index: number, pass: number) => {
      const front = frontSlotRef.current;
      const deck = deckSlotOf(front);
      const nextFront = deck;

      stepIndexRef.current = index;
      repeatPassRef.current = pass;
      seekSettledAtRef.current = Date.now() + 250;
      lastObservedTimeRef.current =
        stepsRef.current[index]?.sourceStartTime ?? 0;
      lastTimeAdvanceAtRef.current = Date.now();

      frontSlotRef.current = nextFront;
      setFrontSlot(nextFront);

      const newFront = playersRef.current[nextFront];
      applyFrontAudio(newFront);
      try {
        newFront?.playVideo?.();
        if (newFront) kickPlayback(newFront);
      } catch {
        /* ignore */
      }

      pauseSlot(front);
      mutePlayer(playersRef.current[front]);
      clearDeck();
    },
    [applyFrontAudio, clearDeck, deckSlotOf, kickPlayback, mutePlayer, pauseSlot],
  );

  const presentFirstUnderCover = useCallback(
    async (seq: number, options?: { alreadyBlack?: boolean }) => {
      const { alreadyBlack = false } = options ?? {};
      const step = stepsRef.current[0];
      if (!step) {
        setInterstitial(null);
        setFadeOpaque(false);
        return;
      }
      if (!alreadyBlack) {
        setInterstitial(statInterstitialFromStep(step));
        setFadeOpaque(true);
      }

      const front = frontSlotRef.current;
      stepIndexRef.current = 0;
      repeatPassRef.current = 0;
      loadOnSlot(front, 0, 0, { preroll: true, play: true, mute: true });
      await waitForSlotPlaying(front, 0, true);
      if (seq !== playSeqRef.current || !playingRef.current) return;

      await delayMs(reelPrerollWallMs(step.speed));
      if (seq !== playSeqRef.current || !playingRef.current) return;

      try {
        const player = playersRef.current[front];
        player?.seekTo?.(step.sourceStartTime, true);
        applyFrontAudio(player);
        player?.playVideo?.();
        if (player) kickPlayback(player);
      } catch {
        /* ignore */
      }

      setInterstitial(null);
      setFadeOpaque(false);
      await delayMs(REEL_FADE_OUT_MS);
      maybeStageNext(seq);
    },
    [
      applyFrontAudio,
      kickPlayback,
      loadOnSlot,
      maybeStageNext,
      waitForSlotPlaying,
    ],
  );

  /**
   * Cut to the next segment via deck swap when ready; fall back to a short
   * black cover only if the deck missed its preroll window.
   */
  const cutToNext = useCallback(
    async (fromIndex: number, toIndex: number, toPass: number, seq: number) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      const fromStep = stepsRef.current[fromIndex];
      const toStep = stepsRef.current[toIndex];
      if (!fromStep || !toStep) {
        transitioningRef.current = false;
        return;
      }

      try {
        const kind = reelStepTransitionKind(fromStep, toStep);
        const cut = cutIndexRef.current++;
        const sponsorCard = sponsorInterstitialForCut(
          sponsorsRef.current,
          cut,
          { message: thankYouMessageRef.current },
        );

        const readyDeck =
          deckReadyRef.current &&
          deckReadyRef.current.index === toIndex &&
          deckReadyRef.current.pass === toPass
            ? deckReadyRef.current
            : null;

        if (sponsorCard) {
          setInterstitial(sponsorCard);
          setFadeOpaque(true);
          await delayMs(REEL_FADE_IN_MS + 400);
          if (seq !== playSeqRef.current || !playingRef.current) return;
        }

        if (REEL_USE_STACKED_PLAYERS && readyDeck) {
          promoteDeck(toIndex, toPass);
          if (sponsorCard) {
            setInterstitial(null);
            setFadeOpaque(false);
            await delayMs(REEL_FADE_OUT_MS);
          }
          maybeStageNext(seq);
          return;
        }

        // Fallback: deck not ready — brief black while we load on front.
        if (!sponsorCard) {
          if (kind === "event") {
            setInterstitial(statInterstitialFromStep(toStep));
          }
          setFadeOpaque(true);
          await delayMs(REEL_FADE_IN_MS);
        }
        if (seq !== playSeqRef.current || !playingRef.current) return;

        if (REEL_USE_STACKED_PLAYERS) {
          // Still try to finish staging then swap.
          await stageOnDeck(toIndex, toPass, seq);
          if (seq !== playSeqRef.current || !playingRef.current) return;
          if (
            deckReadyRef.current &&
            deckReadyRef.current.index === toIndex &&
            deckReadyRef.current.pass === toPass
          ) {
            promoteDeck(toIndex, toPass);
          } else {
            const front = frontSlotRef.current;
            stepIndexRef.current = toIndex;
            repeatPassRef.current = toPass;
            loadOnSlot(front, toIndex, toPass, {
              preroll: true,
              play: true,
              mute: true,
            });
            await waitForSlotPlaying(front, toIndex, true);
            if (seq !== playSeqRef.current || !playingRef.current) return;
            await delayMs(reelPrerollWallMs(toStep.speed));
            if (seq !== playSeqRef.current || !playingRef.current) return;
            try {
              const player = playersRef.current[front];
              player?.seekTo?.(toStep.sourceStartTime, true);
              applyFrontAudio(player);
              player?.playVideo?.();
              if (player) kickPlayback(player);
            } catch {
              /* ignore */
            }
            clearDeck();
          }
        } else {
          const front = frontSlotRef.current;
          stepIndexRef.current = toIndex;
          repeatPassRef.current = toPass;
          loadOnSlot(front, toIndex, toPass, {
            preroll: true,
            play: true,
            mute: true,
          });
          await waitForSlotPlaying(front, toIndex, true);
          if (seq !== playSeqRef.current || !playingRef.current) return;
          await delayMs(reelPrerollWallMs(toStep.speed));
          applyFrontAudio(playersRef.current[front]);
        }

        setInterstitial(null);
        setFadeOpaque(false);
        await delayMs(REEL_FADE_OUT_MS);
        maybeStageNext(seq);
      } finally {
        transitioningRef.current = false;
        if (seq !== playSeqRef.current || !playingRef.current) {
          setInterstitial(null);
          setFadeOpaque(false);
        }
      }
    },
    [
      applyFrontAudio,
      clearDeck,
      kickPlayback,
      loadOnSlot,
      maybeStageNext,
      promoteDeck,
      stageOnDeck,
      waitForSlotPlaying,
    ],
  );

  const beginPlayback = useCallback(async () => {
    const seq = ++playSeqRef.current;
    cutIndexRef.current = 0;
    finishingRef.current = false;
    clearDeck();
    setPlayingState(true);
    void startSoundtrack();

    const title = titleCardRef.current;
    try {
      if (title) {
        setInterstitial({ kind: "title", ...title });
        setFadeOpaque(true);
        const front = frontSlotRef.current;
        stepIndexRef.current = 0;
        repeatPassRef.current = 0;
        loadOnSlot(front, 0, 0, { preroll: true, play: true, mute: true });
        await delayMs(REEL_FADE_IN_MS);
        await delayMs(REEL_TITLE_HOLD_MS);
        if (seq !== playSeqRef.current) return;
        if (!playingRef.current) {
          setInterstitial(null);
          setFadeOpaque(false);
          return;
        }
        await presentFirstUnderCover(seq, { alreadyBlack: true });
        return;
      }

      await presentFirstUnderCover(seq);
    } catch {
      if (seq === playSeqRef.current) {
        setInterstitial(null);
        setFadeOpaque(false);
      }
    }
  }, [
    clearDeck,
    loadOnSlot,
    presentFirstUnderCover,
    setPlayingState,
    startSoundtrack,
  ]);

  const stop = useCallback(() => {
    playSeqRef.current += 1;
    finishingRef.current = false;
    setPlayingState(false);
    pendingPlayRef.current = false;
    transitioningRef.current = false;
    clearDeck();
    setFadeOpaque(false);
    setInterstitial(null);
    stepIndexRef.current = -1;
    repeatPassRef.current = 0;
    stopSoundtrack();
    for (const pl of playersRef.current) {
      try {
        pl?.pauseVideo?.();
      } catch {
        /* ignore */
      }
    }
  }, [clearDeck, setPlayingState, stopSoundtrack]);

  const finishReel = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const seq = playSeqRef.current;
    transitioningRef.current = true;

    const endCard = buildReelEndCard(sponsorsRef.current, {
      message: thankYouMessageRef.current,
    });
    setInterstitial(endCard);
    setFadeOpaque(true);
    for (const pl of playersRef.current) {
      try {
        pl?.pauseVideo?.();
      } catch {
        /* ignore */
      }
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
      clearDeck();
      setPlayingState(false);
      stepIndexRef.current = -1;
      repeatPassRef.current = 0;
      onEnded?.();
    }
  }, [clearDeck, fadeSoundtrackOut, onEnded, setPlayingState]);

  const play = useCallback(() => {
    if (stepsRef.current.length === 0) return;
    if (!ready) {
      pendingPlayRef.current = true;
      setPlayingState(true);
      return;
    }
    void beginPlayback();
  }, [beginPlayback, ready, setPlayingState]);

  useImperativeHandle(ref, () => ({ play, stop }), [play, stop]);

  useEffect(() => {
    if (!autoPlay || playingRef.current) return;
    if (!ready) {
      pendingPlayRef.current = true;
      return;
    }
    play();
  }, [autoPlay, ready, play]);

  useEffect(() => {
    if (!ready || playingRef.current) return;
    const player = playersRef.current[0];
    if (!player) return;
    const id = window.setTimeout(() => cueIdlePreview(player, 0), 120);
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
      const player = playersRef.current[frontSlotRef.current];
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
      if (
        !playingRef.current ||
        transitioningRef.current ||
        finishingRef.current
      ) {
        return;
      }
      const front = frontSlotRef.current;
      const player = playersRef.current[front];
      const step = stepsRef.current[stepIndexRef.current];
      if (!player || !step) return;
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

      const seq = playSeqRef.current;
      const pass = repeatPassRef.current;
      const nextIndex = stepIndexRef.current + 1;
      const hasNextStep = nextIndex < stepsRef.current.length;
      const hasNextPass = pass + 1 < step.repeat;

      // Eagerly stage the next on-deck clip while this one runs.
      if (REEL_USE_STACKED_PLAYERS) {
        const lead = reelStackStageLeadSec(step, step.speed);
        const shouldStage =
          lead <= 0
            ? current >= step.sourceStartTime + 0.35
            : current >= step.sourceEndTime - lead;
        if (shouldStage) maybeStageNext(seq);
      }

      if (current >= step.sourceEndTime - 0.05) {
        if (hasNextPass) {
          void cutToNext(stepIndexRef.current, stepIndexRef.current, pass + 1, seq);
          return;
        }
        if (!hasNextStep) {
          void finishReel();
          return;
        }
        void cutToNext(stepIndexRef.current, nextIndex, 0, seq);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [
    playing,
    cutToNext,
    finishReel,
    kickPlayback,
    maybeStageNext,
    syncScoreboardFromPlayback,
  ]);

  const handleSlotStateChange = useCallback(
    (slot: number, event: { data: number; target: YouTubePlayer }) => {
      if (!playingRef.current || finishingRef.current) return;
      // Only nudge the front player; deck is intentionally paused when ready.
      if (slot !== frontSlotRef.current) return;
      if (transitioningRef.current) return;
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
        const seq = playSeqRef.current;
        if (pass + 1 < step.repeat) {
          void cutToNext(stepIndexRef.current, stepIndexRef.current, pass + 1, seq);
          return;
        }
        const nextIndex = stepIndexRef.current + 1;
        if (nextIndex >= stepsRef.current.length) {
          void finishReel();
          return;
        }
        void cutToNext(stepIndexRef.current, nextIndex, 0, seq);
      }
    },
    [cutToNext, finishReel, kickPlayback],
  );

  const markSlotReady = useCallback(
    (slot: number, player: YouTubePlayer) => {
      playersRef.current[slot] = player;
      syncPlayerSize(player);
      setReadySlots((prev) => {
        if (prev[slot]) return prev;
        const next: [boolean, boolean] = [...prev];
        next[slot] = true;
        return next;
      });
      if (slot === 0 && loadedVideoIdsRef.current[0] == null && firstVideoId) {
        loadedVideoIdsRef.current[0] = firstVideoId;
      }
    },
    [firstVideoId, syncPlayerSize],
  );

  useEffect(() => {
    if (!ready || !pendingPlayRef.current) return;
    pendingPlayRef.current = false;
    void beginPlayback();
  }, [ready, beginPlayback]);

  const slotIds = REEL_USE_STACKED_PLAYERS ? [0, 1] : [0];

  return (
    <div
      className={`overflow-hidden bg-black ${
        hideChrome
          ? "h-full w-full"
          : "rounded-lg border border-white/[0.08]"
      }`}
    >
      <audio ref={audioRef} preload="auto" className="hidden" />
      <div
        ref={setStageNode}
        data-reel-capture
        className={`relative overflow-hidden bg-black ${
          hideChrome ? "h-full w-full" : "aspect-video w-full"
        }`}
      >
        {firstVideoId ? (
          <YoutubeChromelessStage className="absolute inset-0 h-full w-full overflow-hidden bg-black">
            {slotIds.map((slot) => {
              const isFront = frontSlot === slot;
              return (
                <div
                  key={slot}
                  className="absolute inset-0 h-full w-full overflow-hidden"
                  style={{
                    zIndex: isFront ? 20 : 10,
                    opacity: isFront ? 1 : 0.01,
                    transform:
                      isFront && playing && kenBurnsScale !== 1
                        ? `scale(${kenBurnsScale})`
                        : undefined,
                    transformOrigin: "center center",
                  }}
                  aria-hidden={!isFront}
                >
                  <YouTube
                    videoId={firstVideoId}
                    className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
                    iframeClassName="h-full w-full"
                    opts={youtubeOpts}
                    onReady={(e) => {
                      markSlotReady(slot, e.target);
                      if (slot === 0) cueIdlePreview(e.target, 0);
                    }}
                    onStateChange={(e) => handleSlotStateChange(slot, e)}
                  />
                </div>
              );
            })}
          </YoutubeChromelessStage>
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
            {REEL_USE_STACKED_PLAYERS ? " · stacked cuts" : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
});

export default HighlightReelPlayer;
