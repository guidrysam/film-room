import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTeamLinktRosterExport,
  parseCsvText,
  parseTeamLinktRosterRows,
  suggestedTeamNameFromRows,
  trimTrailingEmptyCsvColumns,
} from "./roster-csv";

import { TEAMLINKT_ROSTER_FIXTURE_CSV } from "./roster-fixtures";

describe("TeamLinkt roster CSV shape", () => {
  it("detects TeamLinkt export headers", () => {
    const [headers] = trimTrailingEmptyCsvColumns(
      parseCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV),
    );
    assert.ok(headers);
    assert.equal(isTeamLinktRosterExport(headers!), true);
  });

  it("trims trailing blank columns from export rows", () => {
    const rows = trimTrailingEmptyCsvColumns(
      parseCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV),
    );
    assert.equal(rows[0]!.length, 17);
    assert.equal(rows[1]!.length, 17);
  });

  it("parses player row with jersey, position, and parent contacts", () => {
    const rows = trimTrailingEmptyCsvColumns(
      parseCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV),
    );
    const [headers, ...dataRows] = rows;
    const parsed = parseTeamLinktRosterRows(headers!, dataRows);

    assert.equal(parsed[0]!.playerName, "Alex Smith");
    assert.equal(parsed[0]!.teamName, "U14 Wolves");
    assert.equal(parsed[0]!.jerseyNumber, "7");
    assert.equal(parsed[0]!.position, "Forward");
    assert.equal(parsed[0]!.isPlayer, true);
    assert.equal(parsed[0]!.parentContacts?.length, 2);
    assert.equal(parsed[0]!.parentContacts?.[0]!.email, "jane@example.com");
    assert.equal(parsed[0]!.parentContacts?.[1]!.email, "john@example.com");
  });

  it("ignores player self-contact and keeps other parent targets", () => {
    const rows = trimTrailingEmptyCsvColumns(
      parseCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV),
    );
    const [headers, ...dataRows] = rows;
    const parsed = parseTeamLinktRosterRows(headers!, dataRows);

    assert.equal(parsed[1]!.parentContacts?.length, 1);
    assert.equal(parsed[1]!.parentContacts?.[0]!.email, "sue@example.com");
    assert.equal(parsed[1]!.parentContacts?.[0]!.name, "Sue Smith");
  });

  it("marks staff rows as not players", () => {
    const rows = trimTrailingEmptyCsvColumns(
      parseCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV),
    );
    const [headers, ...dataRows] = rows;
    const parsed = parseTeamLinktRosterRows(headers!, dataRows);

    assert.equal(parsed[2]!.playerName, "Coach Bob");
    assert.equal(parsed[2]!.isPlayer, false);
    assert.equal(parsed[2]!.position, "Coach");
  });

  it("suggests team name from export rows", () => {
    const rows = trimTrailingEmptyCsvColumns(
      parseCsvText(TEAMLINKT_ROSTER_FIXTURE_CSV),
    );
    const [headers, ...dataRows] = rows;
    const parsed = parseTeamLinktRosterRows(headers!, dataRows);
    assert.equal(suggestedTeamNameFromRows(parsed), "U14 Wolves");
  });
});
