import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TEAMLINKT_ROSTER_FIXTURE_CSV } from "./roster-fixtures";
import {
  parseCsvText,
  parseTeamLinktRosterRows,
  trimTrailingEmptyCsvColumns,
} from "./roster-csv";
import { buildRosterImportPreview } from "./roster-import";
import { playerRosterKey } from "./teams";

function parseTeamLinktFixture() {
  const rows = trimTrailingEmptyCsvColumns(parseCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV));
  const [headers, ...dataRows] = rows;
  return parseTeamLinktRosterRows(headers!, dataRows);
}

describe("roster-import parent targets", () => {
  it("preview includes parent email for import", () => {
    const preview = buildRosterImportPreview(
      [
        {
          rowIndex: 2,
          playerName: "Alex Smith",
          jerseyNumber: "7",
          parentName: "Jane Smith",
          parentEmail: "jane@example.com",
        },
      ],
      [],
    );
    assert.equal(preview.length, 1);
    assert.equal(preview[0]!.status, "create");
    assert.equal(preview[0]!.parentEmail, "jane@example.com");
    assert.equal(preview[0]!.parentName, "Jane Smith");
  });

  it("duplicate player name + jersey marks update", () => {
    const preview = buildRosterImportPreview(
      [{ rowIndex: 3, playerName: "Alex Smith", jerseyNumber: "7" }],
      [
        {
          id: "p1",
          name: "Alex Smith",
          jerseyNumber: "7",
        },
      ],
    );
    assert.equal(preview[0]!.status, "update");
    assert.equal(preview[0]!.existingPlayerId, "p1");
    assert.equal(
      playerRosterKey("Alex Smith", "7"),
      playerRosterKey("Alex Smith", "7"),
    );
  });
});

describe("TeamLinkt roster import preview", () => {
  it("creates player rows with jersey, position, and parent contacts", () => {
    const parsed = parseTeamLinktFixture();
    const preview = buildRosterImportPreview(parsed, []);

    assert.equal(preview[0]!.status, "create");
    assert.equal(preview[0]!.playerName, "Alex Smith");
    assert.equal(preview[0]!.jerseyNumber, "7");
    assert.equal(preview[0]!.position, "Forward");
    assert.equal(preview[0]!.teamName, "U14 Wolves");
    assert.equal(preview[0]!.parentContacts?.length, 2);
  });

  it("skips staff rows and counts player self-contact separately", () => {
    const parsed = parseTeamLinktFixture();
    const preview = buildRosterImportPreview(parsed, []);

    assert.equal(preview[1]!.status, "create");
    assert.equal(preview[1]!.parentContacts?.length, 1);
    assert.equal(preview[2]!.status, "skip");
    assert.match(preview[2]!.message ?? "", /Staff contact/);
  });
});
