import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { HighlightMoment } from "./highlight-draft";
import {
  countReelEventGroups,
  groupHighlightMoments,
  moveReelMomentGroup,
  reelGroupStyleLabel,
  removeReelMomentGroup,
} from "./highlight-reel-groups";

function moment(
  id: string,
  extra: Partial<HighlightMoment> = {},
): HighlightMoment {
  return {
    id,
    gameTime: 100,
    startOffsetSec: -5,
    endOffsetSec: 10,
    activeSourceId: "s1",
    ...extra,
  };
}

describe("groupHighlightMoments", () => {
  it("combines live and replay beats from the same timeline event", () => {
    const moments = [
      moment("m1", { label: "Goal", timelineEventId: "evt-1", speed: 1 }),
      moment("m2", {
        label: "Slow-mo replay",
        timelineEventId: "evt-1",
        speed: 0.5,
        startOffsetSec: -2,
        endOffsetSec: 3,
      }),
      moment("m3", { label: "Corner", timelineEventId: "evt-2" }),
      moment("m4", {
        label: "Slow-mo replay",
        timelineEventId: "evt-2",
        speed: 0.5,
      }),
    ];
    const groups = groupHighlightMoments(moments);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]!.moments.length, 2);
    assert.equal(groups[1]!.moments.length, 2);
    assert.equal(countReelEventGroups(moments), 2);
    assert.equal(reelGroupStyleLabel(groups[0]!), "Live + replay");
  });

  it("keeps standalone segments as single-beat groups", () => {
    const groups = groupHighlightMoments([
      moment("m1", { label: "Quick clip" }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.moments.length, 1);
    assert.equal(reelGroupStyleLabel(groups[0]!), null);
  });

  it("moves and removes whole event groups", () => {
    const moments = [
      moment("a1", { timelineEventId: "evt-a" }),
      moment("a2", { timelineEventId: "evt-a", speed: 0.5 }),
      moment("b1", { timelineEventId: "evt-b" }),
    ];
    const moved = moveReelMomentGroup(moments, 0, 1);
    assert.deepEqual(
      moved?.map((m) => m.id),
      ["b1", "a1", "a2"],
    );
    const removed = removeReelMomentGroup(moments, groupHighlightMoments(moments)[0]!);
    assert.deepEqual(
      removed.map((m) => m.id),
      ["b1"],
    );
  });
});
