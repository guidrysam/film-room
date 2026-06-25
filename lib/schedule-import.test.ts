import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CMFC_SCHEDULE_FIXTURE_CSV } from "./schedule-fixtures";
import { parseScheduleCsvText, type ParsedScheduleRow } from "./schedule-csv";
import {
  classifyScheduleRows,
  diffGameFields,
  existingGameKey,
  groupScheduleRowsByTeam,
  scheduleRowKey,
} from "./schedule-import";
import type { Game } from "./games";

function rows(): ParsedScheduleRow[] {
  const result = parseScheduleCsvText(CMFC_SCHEDULE_FIXTURE_CSV);
  assert.ok(result.ok);
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}

/** Build a Game that exactly mirrors a parsed row (no diff expected). */
function gameFromRow(row: ParsedScheduleRow, id: string): Game {
  return {
    id,
    title: row.title,
    ownerId: "owner",
    contributors: { owner: "owner" },
    memberUids: ["owner"],
    visibility: "private",
    createdAt: null,
    updatedAt: null,
    ...(row.date ? { date: row.date } : {}),
    ...(row.homeTeam ? { homeTeam: row.homeTeam } : {}),
    ...(row.awayTeam ? { awayTeam: row.awayTeam } : {}),
    ...(row.opponent ? { opponent: row.opponent } : {}),
    ...(row.scheduledStartAt ? { scheduledStartAt: row.scheduledStartAt } : {}),
    ...(row.location ? { location: row.location } : {}),
    ...(row.matchNumber ? { matchNumber: row.matchNumber } : {}),
    ...(row.division ? { division: row.division } : {}),
  };
}

describe("groupScheduleRowsByTeam", () => {
  it("groups rows by team in encounter order", () => {
    const groups = groupScheduleRowsByTeam(rows());
    assert.deepEqual(
      groups.map((g) => g.teamName),
      ["CMFC White", "CMFC Purple", "CMFC Girls 12U", "CMFC 17U Brannan"],
    );
    const white = groups.find((g) => g.teamName === "CMFC White")!;
    assert.equal(white.rows.length, 2);
  });
});

describe("scheduleRowKey / existingGameKey", () => {
  it("prefers the match number and stays stable across row<->game", () => {
    const row = rows()[0]!;
    const game = gameFromRow(row, "g1");
    assert.equal(scheduleRowKey(row), "m:441");
    assert.equal(existingGameKey(game), "m:441");
  });
});

describe("classifyScheduleRows", () => {
  it("marks everything new against an empty team", () => {
    const classified = classifyScheduleRows(rows(), []);
    assert.ok(classified.every((c) => c.status === "new"));
  });

  it("is idempotent: re-import of identical games is all unchanged", () => {
    const all = rows();
    const existing = all.map((r, i) => gameFromRow(r, `g${i}`));
    const classified = classifyScheduleRows(all, existing);
    assert.ok(
      classified.every((c) => c.status === "unchanged"),
      "expected all rows unchanged on re-import",
    );
  });

  it("marks a row updated when a field changed, with a minimal patch", () => {
    const all = rows();
    const target = all[0]!;
    const existing = all.map((r, i) => gameFromRow(r, `g${i}`));
    // Mutate the stored game so the CSV row differs by location only.
    const stored = existing[0]!;
    existing[0] = { ...stored, location: "Old Field 1" };

    const classified = classifyScheduleRows(all, existing);
    const updated = classified.find((c) => c.row.matchNumber === target.matchNumber)!;
    assert.equal(updated.status, "updated");
    assert.equal(updated.matchedGameId, "g0");
    assert.deepEqual(updated.patch, { location: target.location });
  });
});

describe("diffGameFields (non-destructive)", () => {
  it("never clears fields the CSV omits", () => {
    const row: ParsedScheduleRow = {
      rowIndex: 1,
      teamName: "Falcons",
      matchNumber: "10",
      title: "Falcons vs Eagles",
      opponent: "Eagles",
      usedFallbackTitle: false,
    };
    const game = gameFromRow(row, "g1");
    // Game has extra data (location/division) the CSV does not provide.
    game.location = "Field 5";
    game.division = "U12";
    const patch = diffGameFields(row, game);
    assert.deepEqual(patch, {});
  });
});
