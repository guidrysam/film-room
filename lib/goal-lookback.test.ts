import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyGoalLookback,
  filterAiDraftsAgainstKnownGoals,
  GOAL_MARK_LOOKBACK_SEC,
} from "@/lib/goal-lookback";

describe("applyGoalLookback", () => {
  it("moves timeline t back by 10s", () => {
    const r = applyGoalLookback(120);
    assert.equal(r.lookbackSec, GOAL_MARK_LOOKBACK_SEC);
    assert.equal(r.markedAtSec, 120);
    assert.equal(r.t, 110);
  });

  it("clamps at zero", () => {
    const r = applyGoalLookback(4);
    assert.equal(r.t, 0);
    assert.equal(r.markedAtSec, 4);
  });
});

describe("filterAiDraftsAgainstKnownGoals", () => {
  it("drops AI goals near known marks", () => {
    const out = filterAiDraftsAgainstKnownGoals(
      [
        { tSec: 100, kind: "goal", label: "AI" },
        { tSec: 200, kind: "shot", label: "shot" },
        { tSec: 400, kind: "goal", label: "far" },
      ],
      [{ tSec: 102, kind: "goal" }],
    );
    assert.equal(out.length, 2);
    assert.equal(out[0]!.kind, "shot");
    assert.equal(out[1]!.tSec, 400);
  });
});
