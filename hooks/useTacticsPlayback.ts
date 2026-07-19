"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createIdlePlaybackState,
  interpolateStepObjects,
  pausePlayback,
  resumePlayback,
  startPlayback,
  tickPlayback,
  type PlaybackSettings,
  type PlaybackState,
  type RenderableTacticsObject,
} from "@/lib/tactics-animation";
import type { TacticsBoardObject } from "@/lib/tactics-boards";

export type UseTacticsPlaybackArgs = {
  steps: Array<{ objects: TacticsBoardObject[]; durationMs?: number }>;
  selectedIndex: number;
  settings: PlaybackSettings;
  onDisplayIndexChange?: (index: number) => void;
};

export function useTacticsPlayback({
  steps,
  selectedIndex,
  settings,
  onDisplayIndexChange,
}: UseTacticsPlaybackArgs) {
  const [playback, setPlayback] = useState<PlaybackState>(() =>
    createIdlePlaybackState(selectedIndex),
  );
  const progressCarryRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<() => void>(() => {});
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      setReducedMotion(mq.matches);
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => () => stopRaf(), [stopRaf]);

  const tick = useCallback(() => {
    setPlayback((prev) => {
      if (prev.status !== "playing") return prev;
      const next = tickPlayback(
        prev,
        {
          ...settings,
          holdDurationMs:
            steps[prev.fromStepIndex]?.durationMs ??
            settings.holdDurationMs,
        },
        steps.length,
        performance.now(),
        progressCarryRef.current,
        { reducedMotion },
      );
      progressCarryRef.current = 0;
      if (next.fromStepIndex !== prev.fromStepIndex) {
        onDisplayIndexChange?.(next.fromStepIndex);
      }
      if (next.status === "idle") {
        onDisplayIndexChange?.(next.fromStepIndex);
      }
      return next;
    });
    rafRef.current = requestAnimationFrame(() => tickRef.current());
  }, [onDisplayIndexChange, reducedMotion, settings, steps]);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    if (playback.status === "playing") {
      stopRaf();
      rafRef.current = requestAnimationFrame(tick);
      return stopRaf;
    }
    stopRaf();
    return undefined;
  }, [playback.status, tick, stopRaf]);

  const play = useCallback(() => {
    setPlayback((prev) => {
      if (prev.status === "paused") {
        return resumePlayback(prev, performance.now());
      }
      progressCarryRef.current = 0;
      return startPlayback(selectedIndex, performance.now());
    });
  }, [selectedIndex]);

  const pause = useCallback(() => {
    setPlayback((prev) => {
      if (prev.status !== "playing") return prev;
      progressCarryRef.current = prev.progress;
      return pausePlayback(prev);
    });
  }, []);

  const togglePlay = useCallback(() => {
    setPlayback((prev) => {
      if (prev.status === "playing") {
        progressCarryRef.current = prev.progress;
        return pausePlayback(prev);
      }
      if (prev.status === "paused") {
        return resumePlayback(prev, performance.now());
      }
      progressCarryRef.current = 0;
      return startPlayback(selectedIndex, performance.now());
    });
  }, [selectedIndex]);

  const stop = useCallback(() => {
    progressCarryRef.current = 0;
    stopRaf();
    setPlayback(createIdlePlaybackState(selectedIndex));
  }, [selectedIndex, stopRaf]);

  const restart = useCallback(() => {
    progressCarryRef.current = 0;
    onDisplayIndexChange?.(0);
    setPlayback(startPlayback(0, performance.now()));
  }, [onDisplayIndexChange]);

  const goToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(steps.length - 1, index));
      progressCarryRef.current = 0;
      onDisplayIndexChange?.(clamped);
      setPlayback((prev) => {
        if (prev.status === "playing" || prev.status === "paused") {
          return {
            status: "paused",
            fromStepIndex: clamped,
            toStepIndex: null,
            progress: 0,
            phase: "hold",
            phaseStartedAt: null,
          };
        }
        return createIdlePlaybackState(clamped);
      });
    },
    [onDisplayIndexChange, steps.length],
  );

  const previous = useCallback(() => {
    goToIndex((playback.status === "idle" ? selectedIndex : playback.fromStepIndex) - 1);
  }, [goToIndex, playback.fromStepIndex, playback.status, selectedIndex]);

  const next = useCallback(() => {
    goToIndex((playback.status === "idle" ? selectedIndex : playback.fromStepIndex) + 1);
  }, [goToIndex, playback.fromStepIndex, playback.status, selectedIndex]);

  const isPlaybackActive =
    playback.status === "playing" || playback.status === "paused";

  const renderObjects: RenderableTacticsObject[] = useMemo(() => {
    if (!isPlaybackActive || playback.phase !== "transition" || playback.toStepIndex == null) {
      const idx = isPlaybackActive ? playback.fromStepIndex : selectedIndex;
      const objs = steps[idx]?.objects ?? [];
      return objs.map((o) => ({ ...o, opacity: 1 }));
    }
    const from = steps[playback.fromStepIndex]?.objects ?? [];
    const to = steps[playback.toStepIndex]?.objects ?? [];
    if (reducedMotion) {
      // Crossfade without movement: swap at midpoint.
      const src = playback.progress < 0.5 ? from : to;
      const opacity =
        playback.progress < 0.5
          ? 1 - playback.progress * 2
          : (playback.progress - 0.5) * 2;
      return src.map((o) => ({ ...o, opacity: Math.max(0.15, opacity) }));
    }
    return interpolateStepObjects(from, to, playback.progress);
  }, [isPlaybackActive, playback, reducedMotion, selectedIndex, steps]);

  const captionIndex = isPlaybackActive
    ? playback.phase === "transition" && playback.toStepIndex != null
      ? playback.progress >= 0.5
        ? playback.toStepIndex
        : playback.fromStepIndex
      : playback.fromStepIndex
    : selectedIndex;

  return {
    playback,
    isPlaybackActive,
    isPlaying: playback.status === "playing",
    renderObjects,
    captionIndex,
    play,
    pause,
    togglePlay,
    stop,
    restart,
    previous,
    next,
    goToIndex,
  };
}
