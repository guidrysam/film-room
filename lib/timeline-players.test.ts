import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eventTagsPlayer,
  getEventPlayerIds,
  withEventPlayerIds,
} from "./timeline-players";
import type { GameTimelineEvent } from "./games";

function event(
  partial: Partial<GameTimelineEvent> & Pick<GameTimelineEvent, "id" | "type" | "t">,
): GameTimelineEvent {
  return {
    ...partial,
  };
}

describe("timeline-players", () => {
  it("getEventPlayerIds reads payload.playerIds", () => {
    const ev = event({
      id: "e1",
      type: "coach_mark",
      t: 10,
      payload: { playerIds: ["p1", "p2"] },
    });
    assert.deepEqual(getEventPlayerIds(ev), ["p1", "p2"]);
  });

  it("eventTagsPlayer matches player id", () => {
    const ev = event({
      id: "e2",
      type: "tag",
      t: 5,
      payload: { playerIds: ["p9"] },
    });
    assert.equal(eventTagsPlayer(ev, "p9"), true);
    assert.equal(eventTagsPlayer(ev, "p1"), false);
  });

  it("withEventPlayerIds merges into payload", () => {
    const out = withEventPlayerIds({ videoId: "abc" }, ["p1"]);
    assert.deepEqual(out, { videoId: "abc", playerIds: ["p1"] });
  });
});
