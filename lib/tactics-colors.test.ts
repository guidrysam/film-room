import assert from "node:assert/strict";
import test from "node:test";
import { zoneFillColor, zoneStrokeColor } from "@/lib/tactics-colors";

test("zoneFillColor appends alpha only for opaque hex colors", () => {
  assert.equal(zoneFillColor("#3b82f6"), "#3b82f633");
  assert.equal(zoneFillColor("#3b82f628"), "#3b82f628");
  assert.equal(zoneFillColor("#abc"), "#aabbcc33");
});

test("zoneStrokeColor strips embedded alpha for borders", () => {
  assert.equal(zoneStrokeColor("#3b82f628"), "#3b82f6");
  assert.equal(zoneStrokeColor("#3b82f6"), "#3b82f6");
});
