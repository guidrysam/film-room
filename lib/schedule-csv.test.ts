import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CMFC_SCHEDULE_FIXTURE_CSV } from "./schedule-fixtures";
import {
  buildScheduledStartAt,
  deriveOpponent,
  parseScheduleCsvText,
  parseScheduleDate,
  parseScheduleTime,
  scheduleTeamNames,
  type ParsedScheduleRow,
} from "./schedule-csv";

function parseOk(csv: string): ParsedScheduleRow[] {
  const result = parseScheduleCsvText(csv);
  assert.ok(result.ok, "expected parse to succeed");
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}

describe("parseScheduleDate", () => {
  it("parses weekday + month-name dates", () => {
    assert.equal(parseScheduleDate("Saturday, June 27, 2026"), "2026-06-27");
  });
  it("parses numeric dates", () => {
    assert.equal(parseScheduleDate("6/27/2026"), "2026-06-27");
    assert.equal(parseScheduleDate("06-27-26"), "2026-06-27");
  });
  it("passes through ISO dates", () => {
    assert.equal(parseScheduleDate("2026-06-27"), "2026-06-27");
  });
  it("returns undefined for junk", () => {
    assert.equal(parseScheduleDate("not a date"), undefined);
    assert.equal(parseScheduleDate(undefined), undefined);
  });
});

describe("parseScheduleTime", () => {
  it("parses 12-hour times with tz", () => {
    assert.deepEqual(parseScheduleTime("9:45 AM EDT"), {
      hour: 9,
      minute: 45,
      tz: "EDT",
    });
  });
  it("converts PM correctly", () => {
    assert.deepEqual(parseScheduleTime("12:45 PM EDT"), {
      hour: 12,
      minute: 45,
      tz: "EDT",
    });
    assert.deepEqual(parseScheduleTime("2:15 PM EDT"), {
      hour: 14,
      minute: 15,
      tz: "EDT",
    });
  });
  it("handles midnight/noon edge cases", () => {
    assert.deepEqual(parseScheduleTime("12:00 AM"), { hour: 0, minute: 0 });
    assert.deepEqual(parseScheduleTime("12:00 PM"), { hour: 12, minute: 0 });
  });
});

describe("buildScheduledStartAt", () => {
  it("combines date + time with tz offset", () => {
    assert.equal(
      buildScheduledStartAt("2026-06-27", { hour: 9, minute: 45, tz: "EDT" }),
      "2026-06-27T09:45:00-04:00",
    );
  });
  it("omits offset when tz unknown", () => {
    assert.equal(
      buildScheduledStartAt("2026-06-27", { hour: 14, minute: 0 }),
      "2026-06-27T14:00:00",
    );
  });
});

describe("deriveOpponent", () => {
  it("identifies opponent when team is home", () => {
    assert.deepEqual(
      deriveOpponent(
        "CMFC White",
        "Central Michigan Football Club CMFC White",
        "DSI",
      ),
      { opponent: "DSI", isHome: true },
    );
  });
  it("identifies opponent when team is away", () => {
    assert.deepEqual(
      deriveOpponent(
        "CMFC Girls 12U",
        "lakeshore 2015 girls",
        "Central Michigan Football Club CMFC Girls 12U",
      ),
      { opponent: "lakeshore 2015 girls", isHome: false },
    );
  });
});

describe("parseScheduleCsvText (CMFC fixture)", () => {
  const rows = parseOk(CMFC_SCHEDULE_FIXTURE_CSV);

  it("finds the header below the junk rows and parses every data row", () => {
    const result = parseScheduleCsvText(CMFC_SCHEDULE_FIXTURE_CSV);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.headerRowIndex, 4);
    assert.equal(rows.length, 5);
  });

  it("skips date-divider and section-header rows", () => {
    const result = parseScheduleCsvText(CMFC_SCHEDULE_FIXTURE_CSV);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.ok(result.skippedRows >= 2);
  });

  it("parses the first game end-to-end", () => {
    const first = rows[0]!;
    assert.equal(first.teamName, "CMFC White");
    assert.equal(first.matchNumber, "441");
    assert.equal(first.date, "2026-06-27");
    assert.equal(first.scheduledStartAt, "2026-06-27T09:45:00-04:00");
    assert.equal(first.opponent, "DSI");
    assert.equal(first.isHome, true);
    assert.equal(first.location, "Grand Haven State Beach - 17");
    assert.equal(first.division, "Sand Boys U20-22");
    assert.equal(first.title, "CMFC White vs DSI");
    assert.equal(first.usedFallbackTitle, false);
  });

  it("collapses multi-line placeholder matchups", () => {
    const champ = rows.find((r) => r.matchNumber === "382")!;
    assert.equal(champ.teamName, "CMFC 17U Brannan");
    assert.equal(champ.isHome, false);
    assert.equal(
      champ.opponent,
      "Semi-Final Placeholder Bracket A #1 vs Bracket B #2",
    );
  });

  it("lists distinct teams in encounter order", () => {
    assert.deepEqual(scheduleTeamNames(rows), [
      "CMFC White",
      "CMFC Purple",
      "CMFC Girls 12U",
      "CMFC 17U Brannan",
    ]);
  });
});

describe("parseScheduleCsvText (fallback titles)", () => {
  it("falls back to Game N when no matchup is present", () => {
    const csv = [
      "Team,Date,Time",
      "Falcons,2026-07-01,9:00 AM EDT",
      "Falcons,2026-07-01,11:00 AM EDT",
    ].join("\n");
    const rows = parseOk(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.title, "Falcons — Game 1");
    assert.equal(rows[0]!.usedFallbackTitle, true);
    assert.equal(rows[1]!.title, "Falcons — Game 2");
  });
});

describe("parseScheduleCsvText (errors)", () => {
  it("rejects empty input", () => {
    const result = parseScheduleCsvText("");
    assert.equal(result.ok, false);
  });
  it("rejects files with no recognizable header", () => {
    const result = parseScheduleCsvText("foo,bar,baz\n1,2,3");
    assert.equal(result.ok, false);
  });
});
