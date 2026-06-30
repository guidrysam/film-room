import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eventTagsPlayer,
  getEventPlayerIds,
  personIdsForRosterPlayers,
  withEventPlayerIds,
} from "./timeline-players";
import type { GameTimelineEvent } from "./games";

describe("timeline-players", () => {
  it("getEventPlayerIds reads payload.playerIds", () => {
    const event = {
      id: "e1",
      type: "coach_mark",
      t: 0,
      payload: { playerIds: ["p1", "p2"] },
    } as GameTimelineEvent;
    assert.deepEqual(getEventPlayerIds(event), ["p1", "p2"]);
  });

  it("eventTagsPlayer matches player id", () => {
    const event = {
      id: "e1",
      type: "coach_mark",
      t: 0,
      payload: { playerIds: ["p9"] },
    } as GameTimelineEvent;
    assert.equal(eventTagsPlayer(event, "p9"), true);
    assert.equal(eventTagsPlayer(event, "p1"), false);
  });

  it("withEventPlayerIds merges into payload", () => {
    const out = withEventPlayerIds({ videoId: "abc" }, ["p1"]);
    assert.deepEqual(out, { videoId: "abc", playerIds: ["p1"] });
  });
});

describe("personIdsForRosterPlayers", () => {
  it("maps roster player ids to person ids", () => {
    const players = [
      { id: "p1", personId: "person-a" },
      { id: "p2", personId: "person-b" },
      { id: "p3" },
    ];
    assert.deepEqual(
      personIdsForRosterPlayers(players, ["p1", "p2", "p3", "p1"]),
      ["person-a", "person-b"],
    );
  });
});
