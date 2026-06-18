import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GameTimelineEvent } from "./games";
import {
  buildGameStatCsvRows,
  gameStatsToCsv,
  listGameStatsFromEvents,
  parseGameStat,
  statTypeLabel,
  summarizeGameStatsByPlayer,
} from "./game-stats";

function statEvent(
  partial: Partial<GameTimelineEvent> & Pick<GameTimelineEvent, "id" | "t">,
): GameTimelineEvent {
  return {
    type: "stat",
    ...partial,
  };
}

describe("game-stats", () => {
  it("parses stat events with playerIds and note", () => {
    const parsed = parseGameStat(
      statEvent({
        id: "e1",
        t: 92,
        label: "Goal",
        sourceId: "src1",
        payload: {
          statType: "goal",
          playerIds: ["p1"],
          note: "Header off corner",
        },
      }),
    );
    assert.ok(parsed);
    assert.equal(parsed!.statType, "goal");
    assert.deepEqual(parsed!.playerIds, ["p1"]);
    assert.equal(parsed!.note, "Header off corner");
    assert.equal(parsed!.sourceId, "src1");
  });

  it("parses unknown stat type as custom string", () => {
    const parsed = parseGameStat(
      statEvent({
        id: "e2",
        t: 10,
        payload: { statType: "pk_goal", playerIds: ["p2"] },
      }),
    );
    assert.ok(parsed);
    assert.equal(parsed!.statType, "pk_goal");
    assert.equal(statTypeLabel("pk_goal"), "pk goal");
  });

  it("summarizes stats by player", () => {
    const stats = listGameStatsFromEvents([
      statEvent({
        id: "e1",
        t: 10,
        payload: { statType: "goal", playerIds: ["p1"] },
      }),
      statEvent({
        id: "e2",
        t: 20,
        payload: { statType: "assist", playerIds: ["p1"] },
      }),
      statEvent({
        id: "e3",
        t: 30,
        payload: { statType: "goal", playerIds: ["p2"] },
      }),
    ]);

    const summary = summarizeGameStatsByPlayer(stats, [
      { id: "p1", name: "Alex Smith", jerseyNumber: "7" },
      { id: "p2", name: "Jamie Lee" },
    ]);

    assert.equal(summary.length, 2);
    assert.equal(summary[0]!.playerId, "p1");
    assert.equal(summary[0]!.counts.goal, 1);
    assert.equal(summary[0]!.counts.assist, 1);
    assert.equal(summary[0]!.total, 2);
  });

  it("exports game stats CSV with expected columns", () => {
    const csv = gameStatsToCsv(
      buildGameStatCsvRows({
        game: {
          id: "g1",
          title: "vs Rangers",
          date: "2026-06-18",
          opponent: "Rangers",
          contributors: {},
          memberUids: [],
          visibility: "private",
        },
        team: { id: "t1", name: "U14 Wolves", ownerId: "u1", members: {} },
        stats: listGameStatsFromEvents([
          statEvent({
            id: "e1",
            t: 65,
            payload: { statType: "goal", playerIds: ["p1"], note: "Near post" },
          }),
        ]),
        players: [{ id: "p1", name: "Alex Smith", jerseyNumber: "7" }],
      }),
    );

    const lines = csv.split("\n");
    assert.equal(
      lines[0],
      "Game,Date,Team,Opponent,Player,Jersey,Stat Type,Game Time,Note,Source ID,Event ID",
    );
    assert.match(lines[1]!, /vs Rangers,2026-06-18,U14 Wolves,Rangers,Alex Smith,7,Goal,1:05,Near post,,e1/);
  });
});
