import type { ReelStep } from "@/lib/highlight-draft";

type ReelStepEventRef = Pick<ReelStep, "timelineEventId">;

/** Consecutive beats from the same coach-mark / game event (e.g. live then replay). */
export function isSameReelEventBeat(
  prev: ReelStepEventRef | undefined,
  next: ReelStepEventRef | undefined,
): boolean {
  const id = prev?.timelineEventId?.trim();
  if (!id) return false;
  return id === next?.timelineEventId?.trim();
}

export type ReelStepTransitionKind = "none" | "event" | "beat";

export function reelStepTransitionKind(
  from: ReelStepEventRef | undefined,
  to: ReelStepEventRef | undefined,
): ReelStepTransitionKind {
  if (isSameReelEventBeat(from, to)) return "beat";
  return "event";
}
