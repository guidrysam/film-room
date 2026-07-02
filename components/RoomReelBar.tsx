"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReelStep } from "@/lib/highlight-draft";
import { reelStepTransitionKind } from "@/lib/highlight-reel-event";
import {
  REEL_FADE_HOLD_MS,
  REEL_FADE_IN_MS,
  REEL_FADE_OUT_MS,
  runReelSegmentTransition,
} from "@/lib/highlight-reel-transition";

const POLL_MS = 200;
/** Ignore end-of-segment detection briefly after a seek so we don't skip. */
const SETTLE_MS = 900;

export type RoomReelBarProps = {
  steps: ReelStep[];
  reelName?: string;
  labelForSource?: (sourceId: string) => string | undefined;
  /** Read the active angle's current source-time (seconds). */
  getActiveTime: () => Promise<number> | number;
  /** Switch angle + seek + set rate + play for this step (host transport). */
  applyStep: (step: ReelStep) => void;
  /** Pause shared playback (called at the end / on stop). */
  onStop: () => void;
};

/**
 * Host-only control that plays a saved highlight reel through the synced room so
 * every viewer sees it. It sequences the reel by calling {@link applyStep}
 * (which switches the shown angle + seeks + sets speed via the room's existing
 * host transport) and watches the active angle's time to handle repeats and
 * advance. Because a reel shows one angle at a time and the active angle is
 * always seeked to the anchor exactly, this rides on proven primitives without
 * touching the room's multi-angle offset math.
 */
export default function RoomReelBar({
  steps,
  reelName,
  labelForSource,
  getActiveTime,
  applyStep,
  onStop,
}: RoomReelBarProps) {
  const [playing, setPlaying] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [repeatPass, setRepeatPass] = useState(0);
  const [fadeOpaque, setFadeOpaque] = useState(false);

  const playingRef = useRef(false);
  const stepIndexRef = useRef(-1);
  const repeatPassRef = useRef(0);
  const settleUntilRef = useRef(0);
  const transitioningRef = useRef(false);
  const stepsRef = useRef(steps);
  const applyStepRef = useRef(applyStep);
  const getTimeRef = useRef(getActiveTime);
  const onStopRef = useRef(onStop);
  useEffect(() => {
    stepsRef.current = steps;
    applyStepRef.current = applyStep;
    getTimeRef.current = getActiveTime;
    onStopRef.current = onStop;
  });

  const goToStep = useCallback((index: number, pass: number) => {
    const step = stepsRef.current[index];
    if (!step) return;
    stepIndexRef.current = index;
    repeatPassRef.current = pass;
    setStepIndex(index);
    setRepeatPass(pass);
    settleUntilRef.current = Date.now() + SETTLE_MS;
    applyStepRef.current(step);
  }, []);

  const stop = useCallback(() => {
    playingRef.current = false;
    transitioningRef.current = false;
    setFadeOpaque(false);
    setPlaying(false);
    stepIndexRef.current = -1;
    repeatPassRef.current = 0;
    setStepIndex(-1);
    setRepeatPass(0);
    onStopRef.current();
  }, []);

  const advanceToStep = useCallback(
    (
      index: number,
      pass: number,
      transition: ReturnType<typeof reelStepTransitionKind> | "none",
    ) => {
      if (transitioningRef.current) return;
      const run = () => goToStep(index, pass);
      if (transition === "none") {
        run();
        return;
      }
      transitioningRef.current = true;
      const holdMs =
        transition === "beat" ? REEL_FADE_HOLD_MS : undefined;
      void runReelSegmentTransition(
        run,
        setFadeOpaque,
        undefined,
        holdMs,
      ).finally(() => {
        transitioningRef.current = false;
      });
    },
    [goToStep],
  );

  const play = useCallback(() => {
    if (stepsRef.current.length === 0) return;
    playingRef.current = true;
    setPlaying(true);
    goToStep(0, 0);
  }, [goToStep]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      if (!playingRef.current) return;
      if (Date.now() < settleUntilRef.current) return;
      const step = stepsRef.current[stepIndexRef.current];
      if (!step) return;
      void (async () => {
        let t = 0;
        try {
          t = await getTimeRef.current();
        } catch {
          return;
        }
        if (typeof t !== "number" || !Number.isFinite(t)) return;
        if (t < step.sourceEndTime - 0.1) return;
        const pass = repeatPassRef.current;
        if (pass + 1 < step.repeat) {
          advanceToStep(stepIndexRef.current, pass + 1, "none");
          return;
        }
        const next = stepIndexRef.current + 1;
        if (next >= stepsRef.current.length) {
          stop();
          return;
        }
        const cur = stepsRef.current[stepIndexRef.current];
        const nextStep = stepsRef.current[next];
        advanceToStep(next, 0, reelStepTransitionKind(cur, nextStep));
      })();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [playing, advanceToStep, stop]);

  if (steps.length === 0) return null;

  const activeStep = stepIndex >= 0 ? steps[stepIndex] : null;
  const activeLabel = activeStep
    ? activeStep.label || labelForSource?.(activeStep.sourceId) || "Segment"
    : null;

  return (
    <>
    <div className="rounded-lg border border-fuchsia-500/25 bg-fuchsia-950/20 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-200">
            Highlight reel{reelName ? ` · ${reelName}` : ""}
          </p>
          <p className="text-[10px] text-fuchsia-300/70">
            Plays for everyone in this room.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (playing ? stop() : play())}
          className={`rounded-md border px-3 py-1 text-[11px] font-semibold transition ${
            playing
              ? "border-amber-500/45 bg-amber-950/45 text-amber-100 hover:bg-amber-900/55"
              : "border-fuchsia-500/45 bg-fuchsia-900/40 text-fuchsia-50 hover:bg-fuchsia-800/55"
          }`}
        >
          {playing ? "Stop reel" : "▶ Play reel for room"}
        </button>
      </div>

      {activeStep ? (
        <p className="mt-1.5 truncate text-[10px] text-fuchsia-100/90">
          {activeLabel} · {stepIndex + 1}/{steps.length}
          {activeStep.repeat > 1
            ? ` · loop ${repeatPass + 1}/${activeStep.repeat}`
            : ""}
          {activeStep.speed !== 1 ? ` · ${activeStep.speed}×` : ""}
        </p>
      ) : null}
    </div>
    <div
      className="pointer-events-none fixed inset-0 z-[100] bg-black transition-opacity ease-in-out"
      style={{
        opacity: fadeOpaque ? 1 : 0,
        transitionDuration: `${fadeOpaque ? REEL_FADE_IN_MS : REEL_FADE_OUT_MS}ms`,
      }}
      aria-hidden
    />
  </>
  );
}
