/**
 * Dual-player (play / on-deck) highlight reel staging.
 *
 * While the front clip plays, the deck player loads the next segment early,
 * runs muted through the YouTube title-overlay preroll, then pauses at the
 * real in-point. At the cut we swap z-order so the deck becomes front —
 * no full-screen black wait for chrome to clear.
 */

import {
  REEL_CLIP_PREROLL_SEC,
  reelClipPrerollSourceSec,
} from "@/lib/highlight-reel-transition";

/** Prefer stacked players over black holds between segments. */
export const REEL_USE_STACKED_PLAYERS = true;

/** Extra source seconds beyond preroll to start staging the next clip. */
const STAGE_LOAD_BUFFER_SEC = 2.5;

/**
 * How far before the current clip’s out-point we should start staging the
 * next clip on the deck (source-time seconds).
 */
export function reelStackStageLeadSec(
  step: { sourceStartTime: number; sourceEndTime: number },
  speed = 1,
): number {
  const duration = Math.max(0, step.sourceEndTime - step.sourceStartTime);
  const need = reelClipPrerollSourceSec(speed) + STAGE_LOAD_BUFFER_SEC;
  if (duration <= 0.35) return 0;
  if (duration <= need + 0.2) return Math.max(0.15, duration * 0.55);
  return Math.min(need, duration * 0.9);
}

/** True when deck playback has reached (or passed) the highlight in-point. */
export function reelDeckAtInPoint(
  currentTime: number,
  sourceStartTime: number,
  slackSec = 0.12,
): boolean {
  return currentTime + slackSec >= sourceStartTime;
}

/**
 * Minimum wall time the deck should stay covered while prerolling, even if
 * source time jumps (YouTube seek settle).
 */
export function reelDeckMinPrerollWallMs(): number {
  return Math.round(REEL_CLIP_PREROLL_SEC * 1000);
}
