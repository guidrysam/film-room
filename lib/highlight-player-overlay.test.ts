import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  enrichReelStepsWithPlayerOverlays,
  formatReelPlayerOverlay,
} from "./highlight-player-overlay";
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

describe("enrichReelStepsWithPlayerOverlays", () => {
  const goalMoment = {
    label: "Goal + Assist",
    playerIds: ["p1", "p2"],
    goalPlayerIds: ["p1"],
    assistPlayerIds: ["p2"],
    timelineEventId: "evt-1",
  } satisfies Pick<
    HighlightMoment,
    "label" | "playerIds" | "goalPlayerIds" | "assistPlayerIds" | "timelineEventId"
  >;

  it("shows stat interstitial only on the first live+replay beat", () => {
    const steps = [
      {
        momentId: "m1",
        sourceId: "s1",
        sourceStartTime: 10,
        sourceEndTime: 20,
        speed: 1,
        repeat: 1,
        label: "Live",
      },
      {
        momentId: "m2",
        sourceId: "s1",
        sourceStartTime: 12,
        sourceEndTime: 17,
        speed: 0.5,
        repeat: 1,
        label: "Slow-mo replay",
      },
    ];
    const moments = [
      { id: "m1", activeSourceId: "s1", gameTime: 100, ...goalMoment },
      { id: "m2", activeSourceId: "s1", gameTime: 100, ...goalMoment },
    ] as HighlightMoment[];

    const enriched = enrichReelStepsWithPlayerOverlays(steps, moments, nameForId);
    assert.ok(enriched[0]!.playerOverlay);
    assert.equal(enriched[1]!.playerOverlay, undefined);
  });
});
