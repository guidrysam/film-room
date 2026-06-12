"use client";

import { useEffect, useRef } from "react";
import {
  resolveDirectorTrackState,
  type DirectorTrackEvent,
} from "@/lib/director-track";

const APPLY_INTERVAL_MS = 400;

export type CutPlayerProps = {
  /** The cut's ordered viewing instructions. */
  track: DirectorTrackEvent[];
  /** Whether playback application is active. */
  active: boolean;
  /** Reads the current playback game time (seconds). */
  getTime: () => Promise<number> | number;
  /** Apply a layout change (e.g. "single" | "multi"). */
  onLayout?: (layout: string) => void;
  /** Apply an active camera/source change. */
  onActiveSource?: (sourceId: string) => void;
  /** Apply a player-view focus change. */
  onPlayerView?: (sourceId: string) => void;
};

/**
 * Headless: while `active`, it polls `getTime`, resolves the cut's view state
 * at that time, and applies only the dimensions that changed since the last
 * application (so it never re-fires the same instruction every tick). It
 * recomputes from scratch on seeks and tolerates apply callbacks that no-op on
 * missing sources.
 */
export default function CutPlayer({
  track,
  active,
  getTime,
  onLayout,
  onActiveSource,
  onPlayerView,
}: CutPlayerProps) {
  const lastApplied = useRef<{
    layout?: string;
    activeSource?: string;
    playerView?: string;
  }>({});
  const tickInFlight = useRef(false);

  // Keep latest callbacks/track without restarting the interval each render.
  const trackRef = useRef(track);
  trackRef.current = track;
  const getTimeRef = useRef(getTime);
  getTimeRef.current = getTime;
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  const onActiveSourceRef = useRef(onActiveSource);
  onActiveSourceRef.current = onActiveSource;
  const onPlayerViewRef = useRef(onPlayerView);
  onPlayerViewRef.current = onPlayerView;

  useEffect(() => {
    if (!active) {
      lastApplied.current = {};
      return;
    }

    const tick = async () => {
      if (tickInFlight.current) return;
      tickInFlight.current = true;
      try {
        const t = await getTimeRef.current();
        if (typeof t !== "number" || !Number.isFinite(t)) return;
        const desired = resolveDirectorTrackState(trackRef.current, t);
        const prev = lastApplied.current;

        if (desired.layout && desired.layout !== prev.layout) {
          onLayoutRef.current?.(desired.layout);
        }
        if (desired.activeSource && desired.activeSource !== prev.activeSource) {
          onActiveSourceRef.current?.(desired.activeSource);
        }
        if (desired.playerView && desired.playerView !== prev.playerView) {
          onPlayerViewRef.current?.(desired.playerView);
        }
        lastApplied.current = {
          layout: desired.layout ?? prev.layout,
          activeSource: desired.activeSource ?? prev.activeSource,
          playerView: desired.playerView ?? prev.playerView,
        };
      } catch {
        /* Time read failed — retry next tick. */
      } finally {
        tickInFlight.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), APPLY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return null;
}
