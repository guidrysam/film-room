import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REEL_CLIP_PREROLL_SEC,
  REEL_PRE_TRANSITION_SEC,
  REEL_SEGMENT_PREROLL_MS,
  reelPlaybackStartSec,
  reelPrerollWallMs,
  reelTransitionLeadSec,
} from "./highlight-reel-transition";

describe("reelTransitionLeadSec", () => {
  it("uses a quarter-second lead on normal clips", () => {
    assert.equal(
      reelTransitionLeadSec({ sourceStartTime: 10, sourceEndTime: 25 }),
      REEL_PRE_TRANSITION_SEC,
    );
    assert.equal(REEL_PRE_TRANSITION_SEC, 0.25);
    assert.equal(REEL_SEGMENT_PREROLL_MS, 3000);
  });

  it("skips end black on clips too short to trim", () => {
    const lead = reelTransitionLeadSec({ sourceStartTime: 10, sourceEndTime: 10.35 });
    assert.equal(lead, 0);
  });

  it("starts playback before the trim in-point to absorb black preroll", () => {
    assert.equal(reelPlaybackStartSec(100), 97);
    assert.equal(reelPlaybackStartSec(2), 0);
    assert.equal(reelPlaybackStartSec(100, false), 100);
    assert.equal(reelPrerollWallMs(1), REEL_CLIP_PREROLL_SEC * 1000);
    assert.equal(reelPrerollWallMs(0.5), REEL_CLIP_PREROLL_SEC * 2000);
  });
});
