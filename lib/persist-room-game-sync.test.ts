import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roundSyncOffsetSeconds } from "./persist-room-game-sync";

describe("roundSyncOffsetSeconds", () => {
  it("rounds to centiseconds", () => {
    assert.equal(roundSyncOffsetSeconds(1.234567), 1.23);
    assert.equal(roundSyncOffsetSeconds(-0.005), -0.01);
  });
});
