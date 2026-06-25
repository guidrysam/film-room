/**
 * Flexible game-schedule CSV parser.
 *
 * Schedule exports vary widely between providers (TeamLinkt, GotSport,
 * tournament spreadsheets, etc.). Rather than hard-coding one layout we detect
 * the header row and map columns by alias, prioritising the fields that matter
 * most for linking a stream to a game:
 *
 *   1. time   2. team   3. game / match number   4. matchup (home / away)
 *
 * Anything else we can parse cleanly (location, division, status) is captured
 * too. When a row has no usable matchup we fall back to a generated title
 * ("<Team> — Game N") so every row still produces a linkable game.
 *
 * This module is pure (no Firestore) so it is fully unit-testable.
 */

import { parseCsvText, trimTrailingEmptyCsvColumns } from "@/lib/roster-csv";

/** Known schedule fields we try to map columns onto. */
export type ScheduleField =
  | "team"
  | "matchNumber"
  | "date"
  | "time"
  | "homeTeam"
  | "awayTeam"
  | "matchup"
  | "opponent"
  | "location"
  | "division"
  | "status";

export type ScheduleColumnMapping = Partial<Record<ScheduleField, number>>;

export type ParsedScheduleRow = {
  /** 1-based index of the source CSV row (for display/debugging). */
  rowIndex: number;
  /** Team column value — used to group rows into Film Room teams. */
  teamName: string;
  matchNumber?: string;
  /** Normalized ISO date (YYYY-MM-DD) when parseable. */
  date?: string;
  /** Raw time string as it appeared (e.g. "9:45 AM EDT"). */
  time?: string;
  /** ISO-8601 kickoff with timezone offset when derivable. */
  scheduledStartAt?: string;
  homeTeam?: string;
  awayTeam?: string;
  /** The non-team side of the matchup, when derivable. */
  opponent?: string;
  /** True when the team is the home side, false when away, undefined if unknown. */
  isHome?: boolean;
  location?: string;
  division?: string;
  status?: string;
  /** Final display title (always set; uses fallback when no matchup). */
  title: string;
  /** True when the title came from the "Game N" fallback. */
  usedFallbackTitle: boolean;
};

export type ScheduleParseResult =
  | {
      ok: true;
      rows: ParsedScheduleRow[];
      mapping: ScheduleColumnMapping;
      headerRowIndex: number;
      /** Count of non-empty rows skipped (section headers, date dividers, blanks). */
      skippedRows: number;
    }
  | { ok: false; error: string };

const FIELD_ALIASES: Record<ScheduleField, string[]> = {
  team: ["team", "team name", "club", "our team", "my team"],
  matchNumber: [
    "match #",
    "match#",
    "match number",
    "match no",
    "game #",
    "game#",
    "game number",
    "game no",
    "game id",
    "match id",
    "#",
  ],
  date: ["date", "game date", "match date", "day"],
  time: ["time", "start time", "kickoff", "kick off", "kick-off"],
  homeTeam: ["home team", "home", "home side"],
  awayTeam: ["away team", "away", "away side", "visitor", "visitors"],
  matchup: ["matchup", "match up", "fixture", "game", "match", "vs", "versus"],
  opponent: ["opponent", "opp", "against"],
  location: ["location", "venue", "field", "pitch", "site", "facility"],
  division: ["division", "div", "age group", "bracket", "pool", "group", "flight"],
  status: ["status", "result", "state"],
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Map header cells to known schedule fields by fuzzy alias match. */
export function mapScheduleColumns(headers: string[]): ScheduleColumnMapping {
  const mapping: ScheduleColumnMapping = {};
  headers.forEach((rawHeader, index) => {
    const header = norm(rawHeader);
    if (!header) return;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
      ScheduleField,
      string[],
    ][]) {
      if (mapping[field] !== undefined) continue;
      if (aliases.some((alias) => header === alias || header === `${alias}s`)) {
        mapping[field] = index;
        return;
      }
    }
  });
  // Second pass: looser "includes" match for anything still unmapped.
  headers.forEach((rawHeader, index) => {
    const header = norm(rawHeader);
    if (!header) return;
    if (Object.values(mapping).includes(index)) return;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
      ScheduleField,
      string[],
    ][]) {
      if (mapping[field] !== undefined) continue;
      if (aliases.some((alias) => header.includes(alias))) {
        mapping[field] = index;
        return;
      }
    }
  });
  return mapping;
}

/** A mapping is usable when we can at least name a team for each row. */
function mappingIsUsable(mapping: ScheduleColumnMapping): boolean {
  if (mapping.team === undefined) return false;
  const hasWhen = mapping.date !== undefined || mapping.time !== undefined;
  const hasWho =
    mapping.matchup !== undefined ||
    mapping.opponent !== undefined ||
    mapping.homeTeam !== undefined ||
    mapping.awayTeam !== undefined ||
    mapping.matchNumber !== undefined;
  return hasWhen || hasWho;
}

/** Find the header row by scanning for the first row that yields a usable map. */
export function detectScheduleHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const mapping = mapScheduleColumns(rows[i]!);
    if (mappingIsUsable(mapping)) return i;
  }
  return -1;
}

/** A row is a section/date divider when only one cell carries content. */
function isDividerRow(row: string[]): boolean {
  const nonEmpty = row.filter((cell) => cell.trim() !== "");
  return nonEmpty.length <= 1;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse a human date ("Saturday, June 27, 2026", "6/27/2026", "2026-06-27"). */
export function parseScheduleDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;

  // ISO already.
  const iso = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`;
  }

  // Month-name form, optional leading weekday.
  const named = raw.match(/([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (named) {
    const month = MONTHS[named[1]!.toLowerCase()];
    if (month) {
      return `${named[3]}-${pad2(month)}-${pad2(Number(named[2]))}`;
    }
  }

  // Numeric M/D/Y or M-D-Y.
  const numeric = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (numeric) {
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    return `${year}-${pad2(Number(numeric[1]))}-${pad2(Number(numeric[2]))}`;
  }

  return undefined;
}

const TZ_OFFSETS: Record<string, string> = {
  EDT: "-04:00", EST: "-05:00",
  CDT: "-05:00", CST: "-06:00",
  MDT: "-06:00", MST: "-07:00",
  PDT: "-07:00", PST: "-08:00",
  UTC: "+00:00", GMT: "+00:00",
};

export type ParsedTime = { hour: number; minute: number; tz?: string };

/** Parse "9:45 AM EDT", "13:30", "7 PM" into 24h components + optional tz. */
export function parseScheduleTime(input: string | undefined): ParsedTime | undefined {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;

  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*([a-z]{2,4})?/i);
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  const tzRaw = m[4]?.toUpperCase();

  if (Number.isNaN(hour) || hour > 23 || minute > 59) return undefined;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  const tz = tzRaw && TZ_OFFSETS[tzRaw] ? tzRaw : undefined;
  return { hour, minute, ...(tz ? { tz } : {}) };
}

/** Combine a date + time into an ISO-8601 string (with tz offset when known). */
export function buildScheduledStartAt(
  date: string | undefined,
  time: ParsedTime | undefined,
): string | undefined {
  if (!date) return undefined;
  if (!time) return undefined;
  const clock = `${pad2(time.hour)}:${pad2(time.minute)}:00`;
  const offset = time.tz ? TZ_OFFSETS[time.tz] : undefined;
  return `${date}T${clock}${offset ?? ""}`;
}

function cleanSide(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed || undefined;
}

function sideMatchesTeam(side: string, teamName: string): boolean {
  const s = norm(side);
  const t = norm(teamName);
  if (!s || !t) return false;
  return s.includes(t) || t.includes(s);
}

/** Decide which side is the opponent given the team's own name. */
export function deriveOpponent(
  teamName: string,
  home: string | undefined,
  away: string | undefined,
): { opponent?: string; isHome?: boolean } {
  const h = cleanSide(home);
  const a = cleanSide(away);
  if (!h && !a) return {};
  const homeMatch = h ? sideMatchesTeam(h, teamName) : false;
  const awayMatch = a ? sideMatchesTeam(a, teamName) : false;

  if (homeMatch && !awayMatch) return { opponent: a, isHome: true };
  if (awayMatch && !homeMatch) return { opponent: h, isHome: false };
  // Ambiguous (both or neither matched): best-effort, no home/away flag.
  return { opponent: a ?? h };
}

/** Split a "A vs B" style matchup cell into two sides. */
function splitMatchup(value: string): { home?: string; away?: string } {
  const parts = value.split(/\s+(?:vs\.?|v\.?|@|x)\s+/i);
  if (parts.length >= 2) {
    return { home: cleanSide(parts[0]), away: cleanSide(parts[1]) };
  }
  return {};
}

function cell(row: string[], index: number | undefined): string | undefined {
  if (index === undefined) return undefined;
  const v = row[index];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/** Parse raw schedule CSV text into normalized rows grouped-ready by team. */
export function parseScheduleCsvText(text: string): ScheduleParseResult {
  if (!text || !text.trim()) {
    return { ok: false, error: "The file is empty." };
  }

  const rows = trimTrailingEmptyCsvColumns(parseCsvText(text));
  if (rows.length === 0) {
    return { ok: false, error: "No rows found in the file." };
  }

  const headerRowIndex = detectScheduleHeaderRow(rows);
  if (headerRowIndex < 0) {
    return {
      ok: false,
      error:
        "Could not find a schedule header row. Expected columns like Team, Date, Time, and Home/Away or Matchup.",
    };
  }

  const mapping = mapScheduleColumns(rows[headerRowIndex]!);
  const parsed: ParsedScheduleRow[] = [];
  let skippedRows = 0;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (isDividerRow(row)) {
      skippedRows++;
      continue;
    }

    const teamName = cell(row, mapping.team);
    if (!teamName) {
      skippedRows++;
      continue;
    }

    const matchNumber = cell(row, mapping.matchNumber);
    const date = parseScheduleDate(cell(row, mapping.date));
    const timeRaw = cell(row, mapping.time);
    const time = parseScheduleTime(timeRaw);
    const scheduledStartAt = buildScheduledStartAt(date, time);

    let homeTeam = cleanSide(cell(row, mapping.homeTeam));
    let awayTeam = cleanSide(cell(row, mapping.awayTeam));
    const matchupRaw = cell(row, mapping.matchup);
    if ((!homeTeam || !awayTeam) && matchupRaw) {
      const split = splitMatchup(matchupRaw);
      homeTeam = homeTeam ?? split.home;
      awayTeam = awayTeam ?? split.away;
    }

    const explicitOpponent = cleanSide(cell(row, mapping.opponent));
    const derived = deriveOpponent(teamName, homeTeam, awayTeam);
    const opponent = explicitOpponent ?? derived.opponent;
    const isHome = derived.isHome;

    parsed.push({
      rowIndex: i + 1,
      teamName,
      ...(matchNumber ? { matchNumber } : {}),
      ...(date ? { date } : {}),
      ...(timeRaw ? { time: timeRaw } : {}),
      ...(scheduledStartAt ? { scheduledStartAt } : {}),
      ...(homeTeam ? { homeTeam } : {}),
      ...(awayTeam ? { awayTeam } : {}),
      ...(opponent ? { opponent } : {}),
      ...(isHome !== undefined ? { isHome } : {}),
      ...(cell(row, mapping.location)
        ? { location: cleanSide(cell(row, mapping.location)) }
        : {}),
      ...(cell(row, mapping.division) ? { division: cell(row, mapping.division) } : {}),
      ...(cell(row, mapping.status) ? { status: cell(row, mapping.status) } : {}),
      // Placeholder; finalized by assignTitles below.
      title: "",
      usedFallbackTitle: false,
    });
  }

  if (parsed.length === 0) {
    return {
      ok: false,
      error: "No schedule rows found below the header.",
    };
  }

  assignTitles(parsed);

  return { ok: true, rows: parsed, mapping, headerRowIndex, skippedRows };
}

/** Build the final title for each row, with per-team "Game N" fallback. */
function assignTitles(rows: ParsedScheduleRow[]): void {
  const perTeamSeq = new Map<string, number>();
  for (const row of rows) {
    const key = norm(row.teamName);
    const seq = (perTeamSeq.get(key) ?? 0) + 1;
    perTeamSeq.set(key, seq);

    if (row.opponent) {
      row.title = `${row.teamName} vs ${row.opponent}`;
      row.usedFallbackTitle = false;
    } else {
      row.title = `${row.teamName} — Game ${seq}`;
      row.usedFallbackTitle = true;
    }
  }
}

/** Distinct team names in encounter order. */
export function scheduleTeamNames(rows: ParsedScheduleRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const key = norm(row.teamName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.teamName);
  }
  return out;
}
