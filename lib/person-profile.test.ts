import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  statRecordMatchesPerson,
  summarizePersonStats,
} from "./person-profile";
import type { GameStatRecord } from "./game-stats";

describe("statRecordMatchesPerson", () => {
  it("matches by personIds on the stat", () => {
    const stat: GameStatRecord = {
      eventId: "e1",
      t: 10,
      statType: "goal",
      playerIds: ["p1"],
      personIds: ["person-a"],
    };
    assert.equal(statRecordMatchesPerson(stat, "person-a", []), true);
  });

  it("falls back to roster player ids", () => {
    const stat: GameStatRecord = {
      eventId: "e1",
      t: 10,
      statType: "goal",
      playerIds: ["p1"],
    };
    assert.equal(statRecordMatchesPerson(stat, "person-a", ["p1"]), true);
    assert.equal(statRecordMatchesPerson(stat, "person-a", ["p2"]), false);
  });
});

describe("summarizePersonStats", () => {
  it("counts stat types", () => {
    const stats: GameStatRecord[] = [
      { eventId: "e1", t: 1, statType: "goal", playerIds: [] },
      { eventId: "e2", t: 2, statType: "goal", playerIds: [] },
      { eventId: "e3", t: 3, statType: "assist", playerIds: [] },
    ];
    const summary = summarizePersonStats(stats);
    assert.equal(summary.total, 3);
    assert.equal(summary.counts.goal, 2);
    assert.equal(summary.counts.assist, 1);
  });
});
