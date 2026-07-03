import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeKenBurnsScale,
  KEN_BURNS_ZOOM_END_SCALE,
} from "./highlight-ken-burns";

describe("computeKenBurnsScale", () => {
  it("starts at 1 and ends at 50% zoom in", () => {
    assert.equal(computeKenBurnsScale(0), 1);
    assert.equal(computeKenBurnsScale(1), KEN_BURNS_ZOOM_END_SCALE);
    assert.equal(computeKenBurnsScale(0.5), 1.25);
  });
});
