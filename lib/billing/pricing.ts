/** Tag: 1 credit per minute of primary source (ceil), min 5. */
export function tagCreditsForDurationSec(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 5;
  return Math.max(5, Math.ceil(durationSec / 60));
}

/** Sync skim: flat 15 credits per secondary angle. */
export const SYNC_CREDITS_PER_ANGLE = 15;

export function syncCreditsForAngleCount(angleCount: number): number {
  const n = Math.max(0, Math.floor(angleCount));
  return n * SYNC_CREDITS_PER_ANGLE;
}

/** Propose-cut: 2 credits per mark window, min 5. */
export const PROPOSE_CUT_CREDITS_PER_MARK = 2;

export function proposeCutCreditsForMarkCount(markCount: number): number {
  const n = Math.max(0, Math.floor(markCount));
  return Math.max(5, n * PROPOSE_CUT_CREDITS_PER_MARK);
}
