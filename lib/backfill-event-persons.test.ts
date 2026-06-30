import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GameTimelineEvent } from "./games";
import { getEventPersonIds, getEventPlayerIds } from "./timeline-players";

function stubEvent(
  playerIds: string[],
  personIds?: string[],
): GameTimelineEvent {
  return {
    id: "e1",
    type: "stat",
    t: 10,
    payload: {
      playerIds,
      ...(personIds ? { personIds } : {}),
    },
  } as GameTimelineEvent;
}

describe("event person backfill needs", () => {
  it("detects missing personIds when roster map would add them", () => {
    const event = stubEvent(["p1"]);
    assert.deepEqual(getEventPlayerIds(event), ["p1"]);
    assert.deepEqual(getEventPersonIds(event), []);
  });

  it("reads existing personIds", () => {
    const event = stubEvent(["p1"], ["person-a"]);
    assert.deepEqual(getEventPersonIds(event), ["person-a"]);
  });
});
