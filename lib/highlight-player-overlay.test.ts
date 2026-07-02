import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatReelPlayerOverlay } from "./highlight-player-overlay";
import type { HighlightMoment } from "./highlight-draft";

const names: Record<string, string> = {
  p1: "Alex Smith",
  p2: "Jordan Lee",
};

function nameForId(id: string): string | undefined {
  return names[id];
}

describe("formatReelPlayerOverlay", () => {
  it("formats merged goal and assist with separate player ids", () => {
    const moment: Pick<
      HighlightMoment,
      "label" | "playerIds" | "goalPlayerIds" | "assistPlayerIds"
    > = {
      label: "Goal + Assist",
      playerIds: ["p1", "p2"],
      goalPlayerIds: ["p1"],
      assistPlayerIds: ["p2"],
    };
    assert.equal(
      formatReelPlayerOverlay(moment, nameForId),
      "Goal — Alex Smith · Assist — Jordan Lee",
    );
  });

  it("formats a lone goal stat", () => {
    assert.equal(
      formatReelPlayerOverlay(
        { label: "Goal", playerIds: ["p1"] },
        nameForId,
      ),
      "Goal — Alex Smith",
    );
  });

  it("returns null when names are unknown", () => {
    assert.equal(
      formatReelPlayerOverlay(
        { label: "Goal", playerIds: ["missing"] },
        nameForId,
      ),
      null,
    );
  });
});
