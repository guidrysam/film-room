import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REEL_PRE_TRANSITION_SEC,
  reelTransitionLeadSec,
} from "./highlight-reel-transition";

describe("reelTransitionLeadSec", () => {
  it("uses up to two and a half seconds of lead time on normal clips", () => {
    assert.equal(
      reelTransitionLeadSec({ sourceStartTime: 10, sourceEndTime: 25 }),
      REEL_PRE_TRANSITION_SEC,
    );
  });

  it("shortens lead time for very short clips", () => {
    const lead = reelTransitionLeadSec({ sourceStartTime: 10, sourceEndTime: 11 });
    assert.ok(lead > 0);
    assert.ok(lead < REEL_PRE_TRANSITION_SEC);
  });
});
