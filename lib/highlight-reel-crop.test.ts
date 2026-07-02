import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeDisplayCropRect } from "./highlight-reel-crop";

describe("computeDisplayCropRect", () => {
  it("maps viewport element bounds into video pixels", () => {
    const rect = {
      left: 100,
      top: 50,
      width: 800,
      height: 450,
      right: 900,
      bottom: 500,
      x: 100,
      y: 50,
      toJSON() {
        return {};
      },
    };
    const out = computeDisplayCropRect(rect, 1920, 1080, 1920, 1080);
    assert.equal(out.sx, 100);
    assert.equal(out.sy, 50);
    assert.equal(out.sw, 800);
    assert.equal(out.sh, 450);
  });
});
