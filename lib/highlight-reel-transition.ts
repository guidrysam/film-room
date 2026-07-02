/** Fade-to-black between highlight reel segments (hides YouTube load/buffer). */
export const REEL_FADE_IN_MS = 280;
export const REEL_FADE_HOLD_MS = 420;
export const REEL_FADE_OUT_MS = 320;

export function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Run a segment change behind a black hold (caller drives overlay opacity). */
export async function runReelSegmentTransition(
  applyStep: () => void,
  setFadeOpaque: (opaque: boolean) => void,
): Promise<void> {
  setFadeOpaque(true);
  await delayMs(REEL_FADE_IN_MS);
  applyStep();
  await delayMs(REEL_FADE_HOLD_MS);
  setFadeOpaque(false);
  await delayMs(REEL_FADE_OUT_MS);
}
