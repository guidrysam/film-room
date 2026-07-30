import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAngleSlot,
  labelForAngleSlot,
  ANGLE_SLOTS,
} from "@/lib/drive/angle-slots";
import { gameFolderDisplayName } from "@/lib/drive/naming";

describe("angle slots", () => {
  it("labels kit slots", () => {
    assert.equal(ANGLE_SLOTS.length, 5);
    assert.equal(labelForAngleSlot("main"), "Main");
    assert.equal(isAngleSlot("goal_a"), true);
    assert.equal(isAngleSlot("parent"), false);
  });
});

describe("gameFolderDisplayName", () => {
  it("prefers date vs opponent", () => {
    assert.equal(
      gameFolderDisplayName({
        id: "abc12345",
        date: "2026-04-12",
        opponent: "Hawks",
        title: "U12",
      }),
      "2026-04-12 vs Hawks",
    );
  });
});
