import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TEAMLINKT_ROSTER_FIXTURE_CSV } from "./roster-fixtures";
import {
  buildRosterImportPreview,
  summarizeRosterImportPreview,
} from "./roster-import";
import { parseRosterCsvText } from "./roster-csv-parse";
import {
  detectTeamNamesFromRows,
  parseCsvText,
  parseTeamLinktRosterRows,
  trimTrailingEmptyCsvColumns,
} from "./roster-csv";
import { normalizeCreateTeamInput } from "./teams";

describe("team name detection", () => {
  it("detects a single team name from CSV rows", () => {
    const rows = trimTrailingEmptyCsvColumns(
      parseCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV),
    );
    const [headers, ...dataRows] = rows;
    const parsed = parseTeamLinktRosterRows(headers!, dataRows);
    const detection = detectTeamNamesFromRows(parsed);
    assert.equal(detection.suggested, "U14 Wolves");
    assert.equal(detection.hasMultiple, false);
    assert.deepEqual(detection.names, ["U14 Wolves"]);
  });

  it("warns when multiple team names exist", () => {
    const detection = detectTeamNamesFromRows([
      { rowIndex: 2, teamName: "U14 Wolves" },
      { rowIndex: 3, teamName: "U15 Hawks" },
      { rowIndex: 4, teamName: "U14 Wolves" },
    ]);
    assert.equal(detection.hasMultiple, true);
    assert.deepEqual(detection.names, ["U14 Wolves", "U15 Hawks"]);
    assert.equal(detection.suggested, "U14 Wolves");
  });
});

describe("parseRosterCsvText", () => {
  it("parses TeamLinkt fixture with team name detection", () => {
    const parsed = parseRosterCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV);
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.equal(parsed.teamLinktMode, true);
    assert.equal(parsed.teamNameDetection.suggested, "U14 Wolves");
    assert.equal(parsed.parsedRows.length, 3);
  });
});

describe("manual team creation", () => {
  it("normalizes create team input", () => {
    const result = normalizeCreateTeamInput({
      name: "  U14 Wolves ",
      sport: " Soccer ",
      season: "2026 Spring",
    });
    assert.ok(!("error" in result));
    if ("error" in result) return;
    assert.deepEqual(result, {
      name: "U14 Wolves",
      sport: "Soccer",
      season: "2026 Spring",
    });
  });

  it("requires a team name", () => {
    const result = normalizeCreateTeamInput({ name: "   " });
    assert.equal("error" in result, true);
  });
});

describe("CSV team create import preview", () => {
  it("builds roster preview for a new team with no existing players", () => {
    const parsed = parseRosterCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV);
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;

    const preview = buildRosterImportPreview(parsed.parsedRows, []);
    const summary = summarizeRosterImportPreview(preview);

    assert.equal(summary.playerCount, 2);
    assert.equal(summary.parentContactCount, 3);
    assert.equal(summary.skippedCount, 1);
    assert.equal(summary.invalidCount, 0);
    assert.equal(preview.every((row) => row.status !== "update"), true);
  });
});

describe("existing team setup import", () => {
  it("still marks duplicate players as updates", () => {
    const parsed = parseRosterCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV);
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;

    const preview = buildRosterImportPreview(parsed.parsedRows, [
      {
        id: "p1",
        name: "Alex Smith",
        jerseyNumber: "7",
      },
    ]);

    assert.equal(preview[0]!.status, "update");
    assert.equal(preview[0]!.existingPlayerId, "p1");
    assert.equal(preview[2]!.status, "skip");
    assert.match(preview[2]!.message ?? "", /Staff contact/);
  });
});
