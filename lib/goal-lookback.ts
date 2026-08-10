/** Seconds to shift a goal mark earlier for review/highlights. */
export const GOAL_MARK_LOOKBACK_SEC = 10;

/** Drop AI goal drafts within this many seconds of a known goal mark. */
export const AI_GOAL_DEDUP_WINDOW_SEC = 12;

const GOAL_GAMECAP_TYPES = new Set([
  "goal",
  "ownGoal",
  "madeBasket",
  "threePointer",
]);

const GOAL_AI_KINDS = new Set([
  "goal",
  "field_goal",
  "three_pointer",
]);

export function isGameCapGoalType(type: string): boolean {
  return GOAL_GAMECAP_TYPES.has(type.trim());
}

export function isAiGoalKind(kind: string): boolean {
  return GOAL_AI_KINDS.has(kind.trim());
}

/** Whether a timeline event is a goal (AI/stat/Game Cap). */
export function isGoalTimelineEvent(ev: {
  label?: string;
  type?: string;
  payload?: Record<string, unknown> | null;
}): boolean {
  const payload =
    ev.payload && typeof ev.payload === "object" ? ev.payload : {};
  if (typeof payload.gameCapType === "string" && isGameCapGoalType(payload.gameCapType)) {
    return true;
  }
  if (typeof payload.aiKind === "string" && isAiGoalKind(payload.aiKind)) {
    return true;
  }
  if (
    typeof payload.statType === "string" &&
    /^(goal|field_goal|three_pointer|madebasket)$/i.test(payload.statType.trim())
  ) {
    return true;
  }
  const label = typeof ev.label === "string" ? ev.label.toLowerCase() : "";
  return /\bgoal\b|\bbucket\b|\b3pt\b|field goal/i.test(label);
}

/**
 * Clip start = press/mark time − lookback.
 * Returns timeline `t` and original `markedAtSec` for payload.
 */
export function applyGoalLookback(markSec: number): {
  t: number;
  markedAtSec: number;
  lookbackSec: number;
} {
  const markedAtSec = Math.max(0, markSec);
  return {
    t: Math.max(0, Math.round((markedAtSec - GOAL_MARK_LOOKBACK_SEC) * 10) / 10),
    markedAtSec: Math.round(markedAtSec * 10) / 10,
    lookbackSec: GOAL_MARK_LOOKBACK_SEC,
  };
}

export type GoalLikeAnchor = { tSec: number; kind: string };

/** Remove AI scoring drafts that duplicate known Game Cap / coach goals. */
export function filterAiDraftsAgainstKnownGoals<
  T extends { tSec: number; kind: string },
>(drafts: T[], known: GoalLikeAnchor[]): T[] {
  const goalMarks = known.filter((k) => isAiGoalKind(k.kind) || k.kind === "goal");
  if (goalMarks.length === 0) return drafts;
  return drafts.filter((d) => {
    if (!isAiGoalKind(d.kind)) return true;
    const dup = goalMarks.some(
      (m) => Math.abs(m.tSec - d.tSec) <= AI_GOAL_DEDUP_WINDOW_SEC,
    );
    return !dup;
  });
}
