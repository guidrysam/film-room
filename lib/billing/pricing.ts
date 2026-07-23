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
