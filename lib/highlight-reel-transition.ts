/** Fade-to-black between highlight reel segments (hides YouTube load/buffer). */
export const REEL_FADE_IN_MS = 450;
export const REEL_FADE_HOLD_MS = 650;
export const REEL_FADE_OUT_MS = 500;
/** Extra black hold after playback resumes (YouTube chrome can linger briefly). */
export const REEL_FADE_POST_READY_MS = 550;

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
