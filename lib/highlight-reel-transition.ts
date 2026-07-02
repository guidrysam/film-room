/** When false, segments play back-to-back with no black (overlay diagnostics). */
export const REEL_USE_BLACK_TRANSITIONS = true;

/** Fade-to-black between highlight reel segments (hides YouTube load/buffer). */
export const REEL_FADE_IN_MS = 450;
export const REEL_FADE_HOLD_MS = 650;
export const REEL_FADE_OUT_MS = 500;

/** Black over the tail of the outgoing clip before the cut. */
export const REEL_PRE_TRANSITION_SEC = 0.25;
/** Source seconds to start playback before the trim in-point (hidden under black). */
export const REEL_CLIP_PREROLL_SEC = 3;
/** Incoming clip plays under black this long before it is revealed (1× speed). */
export const REEL_SEGMENT_PREROLL_MS = REEL_CLIP_PREROLL_SEC * 1000;

export function reelPlaybackStartSec(
  sourceStartTime: number,
  usePreroll = true,
): number {
  if (!usePreroll) return Math.max(0, sourceStartTime);
  return Math.max(0, sourceStartTime - REEL_CLIP_PREROLL_SEC);
}

/** Wall-clock black hold while the preroll portion of the clip plays. */
export function reelPrerollWallMs(speed: number): number {
  const rate = speed > 0 ? speed : 1;
  return (REEL_CLIP_PREROLL_SEC / rate) * 1000;
}

export function reelTransitionLeadSec(step: {
  sourceStartTime: number;
  sourceEndTime: number;
}): number {
  const duration = Math.max(0, step.sourceEndTime - step.sourceStartTime);
  if (duration <= REEL_PRE_TRANSITION_SEC + 0.15) return 0;
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
  setFadeOpaque(false);
  await delayMs(REEL_FADE_OUT_MS);
}
