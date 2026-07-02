/** Fade-to-black between highlight reel segments (hides YouTube load/buffer). */
export const REEL_FADE_IN_MS = 450;
export const REEL_FADE_HOLD_MS = 650;
export const REEL_FADE_OUT_MS = 500;
/** Extra black hold after playback resumes (YouTube chrome can linger briefly). */
export const REEL_FADE_POST_READY_MS = 400;

/** Start fading to black this many seconds before a clip ends. */
export const REEL_PRE_TRANSITION_SEC = 2.5;
/** Play the incoming clip under black for this long after the previous clip ends. */
export const REEL_SEGMENT_PREROLL_MS = 2500;

export function reelTransitionLeadSec(step: {
  sourceStartTime: number;
  sourceEndTime: number;
}): number {
  const duration = Math.max(0, step.sourceEndTime - step.sourceStartTime);
  if (duration <= 0.6) return 0;
  return Math.min(REEL_PRE_TRANSITION_SEC, duration * 0.45);
}

export function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Run a segment change behind a black hold (caller drives overlay opacity). */
export async function runReelSegmentTransition(
  applyStep: () => void,
  setFadeOpaque: (opaque: boolean) => void,
  waitUntilPresentable?: () => Promise<void>,
  holdMs?: number,
): Promise<void> {
  setFadeOpaque(true);
  await delayMs(REEL_FADE_IN_MS);
  applyStep();
  await waitUntilPresentable?.();
  await delayMs(holdMs ?? REEL_FADE_HOLD_MS);
  await delayMs(REEL_FADE_POST_READY_MS);
  setFadeOpaque(false);
  await delayMs(REEL_FADE_OUT_MS);
}
