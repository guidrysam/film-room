import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyTrimHandleDrag,
  clipDurationSec,
  clipTrimContext,
  selectionRatios,
} from "./reel-clip-trim";

describe("reel-clip-trim", () => {
  it("builds a padded context around the clip", () => {
    const ctx = clipTrimContext(100, -5, 10);
    assert.ok(ctx.start < 95);
    assert.ok(ctx.end > 110);
  });

  it("maps offsets to bar ratios", () => {
    const ctx = { start: 80, end: 130 };
    const { left, width } = selectionRatios(100, -5, 10, ctx);
    assert.ok(left > 0);
    assert.ok(width > 0);
    assert.ok(left + width <= 1.01);
  });

  it("drags start/end handles independently with a minimum clip length", () => {
    const endDrag = applyTrimHandleDrag(100, -5, 10, "end", 120);
    assert.equal(endDrag.endOffsetSec, 20);
    assert.equal(endDrag.startOffsetSec, -5);

    const startDrag = applyTrimHandleDrag(100, -5, 10, "start", 90);
    assert.equal(startDrag.startOffsetSec, -10);
    assert.equal(startDrag.endOffsetSec, 10);

    assert.equal(clipDurationSec(-5, 10), 15);
  });
});
