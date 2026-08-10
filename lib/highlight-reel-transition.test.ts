import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REEL_CLIP_PREROLL_SEC,
  REEL_PRE_TRANSITION_SEC,
  REEL_SEGMENT_PREROLL_MS,
  reelClipPrerollSourceSec,
  reelPlaybackStartSec,
  reelPrerollWallMs,
  reelTransitionLeadSec,
} from "./highlight-reel-transition";

describe("reelTransitionLeadSec", () => {
  it("uses outbound black lead on normal clips", () => {
    assert.equal(
      reelTransitionLeadSec({ sourceStartTime: 10, sourceEndTime: 25 }),
      REEL_PRE_TRANSITION_SEC,
    );
    assert.equal(REEL_PRE_TRANSITION_SEC, 0.75);
    assert.equal(REEL_SEGMENT_PREROLL_MS, 4000);
  });

  it("skips end black on clips too short to trim", () => {
    const lead = reelTransitionLeadSec({ sourceStartTime: 10, sourceEndTime: 10.35 });
    assert.equal(lead, 0);
  });

  it("starts playback before the trim in-point to absorb black preroll", () => {
    assert.equal(reelPlaybackStartSec(100), 100 - REEL_CLIP_PREROLL_SEC);
    assert.equal(
      reelPlaybackStartSec(100, true, 0.5),
      100 - reelClipPrerollSourceSec(0.5),
    );
    assert.equal(reelClipPrerollSourceSec(0.5), REEL_CLIP_PREROLL_SEC * 0.5);
    assert.equal(reelPlaybackStartSec(2), 0);
    assert.equal(reelPlaybackStartSec(100, false), 100);
    assert.equal(reelPrerollWallMs(1), REEL_SEGMENT_PREROLL_MS);
    assert.equal(reelPrerollWallMs(0.5), REEL_SEGMENT_PREROLL_MS);
  });
});
