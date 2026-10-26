import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REEL_USE_STACKED_PLAYERS,
  reelDeckAtInPoint,
  reelDeckMinPrerollWallMs,
  reelStackStageLeadSec,
} from "./highlight-reel-stack";
import { REEL_CLIP_PREROLL_SEC } from "./highlight-reel-transition";

describe("highlight reel stack staging", () => {
  it("enables stacked players by default", () => {
    assert.equal(REEL_USE_STACKED_PLAYERS, true);
  });

  it("stages early enough to cover YouTube preroll on normal clips", () => {
    const lead = reelStackStageLeadSec(
      { sourceStartTime: 10, sourceEndTime: 30 },
      1,
    );
    assert.ok(lead >= REEL_CLIP_PREROLL_SEC);
    assert.ok(lead < 20);
  });

  it("shrinks stage lead on short clips", () => {
    const lead = reelStackStageLeadSec(
      { sourceStartTime: 10, sourceEndTime: 12 },
      1,
    );
    assert.ok(lead > 0);
    assert.ok(lead < 2);
  });

  it("detects deck arrival at the highlight in-point", () => {
    assert.equal(reelDeckAtInPoint(9.95, 10), true);
    assert.equal(reelDeckAtInPoint(9.5, 10), false);
    assert.equal(reelDeckMinPrerollWallMs(), REEL_CLIP_PREROLL_SEC * 1000);
  });
});
