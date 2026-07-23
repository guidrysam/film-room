import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SYNC_CREDITS_PER_ANGLE,
  syncCreditsForAngleCount,
  tagCreditsForDurationSec,
} from "@/lib/billing/pricing";

describe("billing pricing", () => {
  it("tags by ceil minutes with min 5", () => {
    assert.equal(tagCreditsForDurationSec(0), 5);
    assert.equal(tagCreditsForDurationSec(60), 5);
    assert.equal(tagCreditsForDurationSec(61), 5);
    assert.equal(tagCreditsForDurationSec(300), 5);
    assert.equal(tagCreditsForDurationSec(301), 6);
    assert.equal(tagCreditsForDurationSec(5400), 90);
  });

  it("syncs flat per angle", () => {
    assert.equal(SYNC_CREDITS_PER_ANGLE, 15);
    assert.equal(syncCreditsForAngleCount(0), 0);
    assert.equal(syncCreditsForAngleCount(3), 45);
  });
});
