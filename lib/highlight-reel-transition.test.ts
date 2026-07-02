import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REEL_PRE_TRANSITION_SEC,
  REEL_SEGMENT_PREROLL_MS,
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
});
