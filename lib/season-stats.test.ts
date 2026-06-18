import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Game } from "./games";
import {
  buildSeasonPlayerTableRows,
  buildSeasonStatSummaryCsvRows,
  buildTeamGameStatRecords,
  customOrOtherStatCount,
  filterTeamGameStats,
  filterTeamStatGames,
  seasonStatsToCsv,
  summarizeSeasonStatsByPlayerFromRecords,
  summarizeSeasonStatsByTeamFromRecords,
} from "./season-stats";
import type { GameStatRecord } from "./game-stats";

const games: Game[] = [
  {
    id: "g1",
    title: "vs Rangers",
    date: "2026-03-01",
    season: "2026 Spring",
    opponent: "Rangers",
    contributors: {},
    memberUids: [],
    visibility: "private",
  },
  {
    id: "g2",
    title: "vs Hawks",
    date: "2026-04-10",
    season: "2026 Spring",
    opponent: "Hawks",
    contributors: {},
    memberUids: [],
    visibility: "private",
  },
  {
    id: "g3",
    title: "vs Lions",
    date: "2025-11-02",
    season: "2025 Fall",
    opponent: "Lions",
    contributors: {},
    memberUids: [],
    visibility: "private",
  },
];

const players = [
  { id: "p1", name: "Alex Smith", jerseyNumber: "7" },
  { id: "p2", name: "Jamie Lee", jerseyNumber: "10" },
];

function statsMap(): Map<string, GameStatRecord[]> {
  return new Map([
    [
      "g1",
      [
        {
          eventId: "e1",
          t: 10,
          statType: "goal",
          playerIds: ["p1"],
        },
        {
          eventId: "e2",
          t: 20,
          statType: "assist",
          playerIds: ["p1"],
        },
      ],
    ],
    [
      "g2",
      [
        {
          eventId: "e3",
          t: 30,
          statType: "goal",
          playerIds: ["p2"],
        },
        {
          eventId: "e4",
          t: 40,
          statType: "pk_goal",
          playerIds: ["p1"],
        },
      ],
    ],
    [
      "g3",
      [
        {
          eventId: "e5",
          t: 50,
          statType: "shot",
          playerIds: ["p1"],
        },
      ],
    ],
  ]);
}

describe("season-stats", () => {
  it("filters games by season", () => {
    const spring = filterTeamStatGames(games, { season: "2026 Spring" });
    assert.equal(spring.length, 2);
    assert.deepEqual(spring.map((g) => g.id), ["g1", "g2"]);
  });

  it("filters games by date range", () => {
    const filtered = filterTeamStatGames(games, {
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
    assert.equal(filtered.length, 2);
  });

  it("aggregates stats by player across games", () => {
    const records = buildTeamGameStatRecords(games, statsMap());
    const summaries = summarizeSeasonStatsByPlayerFromRecords(records, players);
    const alex = summaries.find((s) => s.playerId === "p1");
    const jamie = summaries.find((s) => s.playerId === "p2");
    assert.equal(alex?.counts.goal, 1);
    assert.equal(alex?.counts.assist, 1);
    assert.equal(alex?.counts.pk_goal, 1);
    assert.equal(alex?.total, 4);
    assert.equal(jamie?.counts.goal, 1);
  });

  it("aggregates stats by team", () => {
    const records = buildTeamGameStatsRecordsSpring();
    const team = summarizeSeasonStatsByTeamFromRecords(
      records,
      players,
      "U14 Wolves",
    );
    assert.equal(team.totalStats, 4);
    assert.equal(team.byType.goal, 2);
    assert.equal(team.players.length, 2);
  });

  it("filters stat rows by player and stat type", () => {
    const records = buildTeamGameStatRecords(games, statsMap());
    const goals = filterTeamGameStats(records, {
      playerId: "p1",
      statType: "goal",
    });
    assert.equal(goals.length, 1);
    assert.equal(goals[0]!.eventId, "e1");
  });

  it("builds player table rows with custom/other counts", () => {
    const records = buildTeamGameStatRecords(games, statsMap());
    const summaries = summarizeSeasonStatsByPlayerFromRecords(records, players);
    const alex = summaries.find((s) => s.playerId === "p1")!;
    assert.equal(customOrOtherStatCount(alex), 1);
    const rows = buildSeasonPlayerTableRows(summaries, players);
    const alexRow = rows.find((r) => r.playerId === "p1");
    assert.equal(alexRow?.goals, 1);
    assert.equal(alexRow?.customOther, 1);
    assert.equal(alexRow?.total, 4);
  });

  it("exports season summary CSV", () => {
    const records = buildTeamGameStatsRecordsSpring();
    const summaries = summarizeSeasonStatsByPlayerFromRecords(records, players);
    const csv = seasonStatsToCsv(
      buildSeasonStatSummaryCsvRows({
        teamName: "U14 Wolves",
        seasonLabel: "2026 Spring",
        summaries,
        players,
      }),
    );
    const lines = csv.split("\n");
    assert.equal(
      lines[0],
      "Team,Season,Player,Jersey,Stat Type,Count",
    );
    assert.ok(
      lines.some((line) =>
        /U14 Wolves,2026 Spring,Alex Smith,7,Goal,1/.test(line),
      ),
    );
  });
});

function buildTeamGameStatsRecordsSpring() {
  const springGames = filterTeamStatGames(games, { season: "2026 Spring" });
  return buildTeamGameStatRecords(springGames, statsMap());
}
