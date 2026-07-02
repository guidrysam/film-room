import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSameReelEventBeat,
  reelStepTransitionKind,
} from "./highlight-reel-event";

describe("highlight reel event beats", () => {
  it("groups live and replay under the same timeline event", () => {
    const live = { timelineEventId: "evt-1" };
    const replay = { timelineEventId: "evt-1" };
    assert.equal(isSameReelEventBeat(live, replay), true);
    assert.equal(reelStepTransitionKind(live, replay), "beat");
  });

  it("treats different timeline events as separate reel events", () => {
    const a = { timelineEventId: "evt-1" };
    const b = { timelineEventId: "evt-2" };
    assert.equal(isSameReelEventBeat(a, b), false);
    assert.equal(reelStepTransitionKind(a, b), "event");
  });
});
