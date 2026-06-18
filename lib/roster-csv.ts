/**
 * TeamLinkt-style roster CSV parsing and column mapping (no API integration).
 */

export type RosterCsvField =
  | "playerFirstName"
  | "playerLastName"
  | "playerName"
  | "jerseyNumber"
  | "position"
  | "teamName"
  | "isPlayer"
  | "parentName"
  | "parentEmail"
  | "phone"
  | "ignore";

export const ROSTER_CSV_FIELD_LABELS: Record<RosterCsvField, string> = {
  playerFirstName: "Player first name",
  playerLastName: "Player last name",
  playerName: "Player name",
  jerseyNumber: "Jersey number",
  position: "Position",
  teamName: "Team name",
  isPlayer: "Is player",
  parentName: "Parent / guardian name",
  parentEmail: "Parent email",
  phone: "Phone (optional)",
  ignore: "Ignore column",
};

/** Headers from TeamLinkt roster member exports (team_roster_members_*.csv). */
export const TEAMLINKT_ROSTER_CSV_COLUMNS = [
  "Player Name",
  "Team Name",
  "Jersey Number",
  "Position",
  "Is Player",
  "Contact 1 Name",
  "Contact 1 Relationship",
  "Contact 1 Email",
  "Contact 1 Phone",
  "Contact 2 Name",
  "Contact 2 Relationship",
  "Contact 2 Email",
  "Contact 2 Phone",
  "Contact 3 Name",
  "Contact 3 Relationship",
  "Contact 3 Email",
  "Contact 3 Phone",
] as const;

const TEAMLINKT_REQUIRED_HEADERS = new Set([
  "player name",
  "team name",
  "jersey number",
  "position",
  "is player",
]);

export type RosterColumnMapping = Record<number, RosterCsvField>;

export type RosterParentContact = {
  name: string;
  email: string;
  phone?: string;
  relationship?: string;
};

export type ParsedRosterRow = {
  rowIndex: number;
  playerFirstName?: string;
  playerLastName?: string;
  playerName?: string;
  jerseyNumber?: string;
  position?: string;
  teamName?: string;
  /** true/false when present; null for legacy/generic CSV rows. */
  isPlayer?: boolean | null;
  parentName?: string;
  parentEmail?: string;
  phone?: string;
  parentContacts?: RosterParentContact[];
};

const HEADER_ALIASES: Record<Exclude<RosterCsvField, "ignore">, string[]> = {
  playerFirstName: [
    "first name",
    "firstname",
    "first",
    "player first",
    "player first name",
    "player_first_name",
    "fname",
  ],
  playerLastName: [
    "last name",
    "lastname",
    "last",
    "player last",
    "player last name",
    "player_last_name",
    "lname",
    "surname",
  ],
  playerName: [
    "name",
    "player",
    "player name",
    "player_name",
    "athlete",
    "athlete name",
    "full name",
  ],
  jerseyNumber: [
    "jersey",
    "jersey number",
    "jersey #",
    "jersey_number",
    "number",
    "#",
    "no",
    "no.",
  ],
  position: ["position", "pos", "player position"],
  teamName: ["team", "team name", "team_name"],
  isPlayer: ["is player", "is_player", "player row"],
  parentName: [
    "parent",
    "parent name",
    "parent/guardian",
    "parent guardian",
    "guardian",
    "guardian name",
    "parent_name",
    "contact 1 name",
  ],
  parentEmail: [
    "email",
    "parent email",
    "parent e-mail",
    "e-mail",
    "parent_email",
    "guardian email",
    "contact 1 email",
  ],
  phone: [
    "phone",
    "mobile",
    "cell",
    "phone number",
    "parent phone",
    "contact 1 phone",
  ],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function trimCell(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Parse CSV text into rows (handles quoted fields and commas). */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || (c === "\r" && next === "\n")) {
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row.map((cell) => cell.trim()));
      }
      row = [];
      field = "";
      if (c === "\r") i++;
    } else if (c !== "\r") {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row.map((cell) => cell.trim()));
    }
  }

  return rows;
}

/** Drop trailing empty header/cells so extra commas do not break parsing. */
export function trimTrailingEmptyCsvColumns(rows: string[][]): string[][] {
  if (rows.length === 0) return rows;

  let width = rows[0]!.length;
  while (width > 0) {
    const headerEmpty = !trimCell(rows[0]![width - 1]);
    const allRowsEmpty = rows.every((row) => !trimCell(row[width - 1]));
    if (headerEmpty && allRowsEmpty) {
      width--;
      continue;
    }
    break;
  }

  if (width === 0) return rows;

  return rows.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push("");
    return next;
  });
}

export function normalizeIsPlayer(value: string | undefined): boolean | null {
  const norm = trimCell(value)?.toLowerCase();
  if (!norm) return null;
  if (["yes", "y", "true", "1"].includes(norm)) return true;
  if (["no", "n", "false", "0"].includes(norm)) return false;
  return null;
}

export function isStaffPosition(position: string | undefined): boolean {
  const norm = normalizeHeader(position ?? "");
  if (!norm) return false;
  return norm.includes("coach") || norm.includes("manager");
}

export function isPlayerRelationship(relationship: string | undefined): boolean {
  return normalizeHeader(relationship ?? "") === "player";
}

export function isTeamLinktRosterExport(headers: string[]): boolean {
  const normalized = headers.map(normalizeHeader).filter(Boolean);
  for (const required of TEAMLINKT_REQUIRED_HEADERS) {
    if (!normalized.includes(required)) return false;
  }
  return normalized.includes("contact 1 name");
}

function headerIndexMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const norm = normalizeHeader(header);
    if (norm && !map.has(norm)) map.set(norm, index);
  });
  return map;
}

function cellAt(
  cells: string[],
  indexByHeader: Map<string, number>,
  header: string,
): string | undefined {
  const index = indexByHeader.get(header);
  if (index == null) return undefined;
  return trimCell(cells[index]);
}

function parseTeamLinktContacts(
  cells: string[],
  indexByHeader: Map<string, number>,
): RosterParentContact[] {
  const contacts: RosterParentContact[] = [];

  for (const slot of [1, 2, 3] as const) {
    const prefix = `contact ${slot}`;
    const name = cellAt(cells, indexByHeader, `${prefix} name`);
    const relationship = cellAt(cells, indexByHeader, `${prefix} relationship`);
    const email = normalizeEmail(cellAt(cells, indexByHeader, `${prefix} email`));
    const phone = cellAt(cells, indexByHeader, `${prefix} phone`);

    if (!email) continue;
    if (isPlayerRelationship(relationship)) continue;
    if (!name) continue;

    contacts.push({
      name,
      email,
      ...(phone ? { phone } : {}),
      ...(relationship ? { relationship } : {}),
    });
  }

  return contacts;
}

/** Parse TeamLinkt roster member export rows into normalized import rows. */
export function parseTeamLinktRosterRows(
  headers: string[],
  dataRows: string[][],
  headerRowIndex = 0,
): ParsedRosterRow[] {
  const indexByHeader = headerIndexMap(headers);

  return dataRows.map((cells, offset) => {
    const rowIndex = headerRowIndex + 1 + offset;
    const playerName = cellAt(cells, indexByHeader, "player name");
    const isPlayer = normalizeIsPlayer(
      cellAt(cells, indexByHeader, "is player"),
    );

    return {
      rowIndex,
      ...(playerName ? { playerName } : {}),
      ...(cellAt(cells, indexByHeader, "team name")
        ? { teamName: cellAt(cells, indexByHeader, "team name") }
        : {}),
      ...(cellAt(cells, indexByHeader, "jersey number")
        ? { jerseyNumber: cellAt(cells, indexByHeader, "jersey number") }
        : {}),
      ...(cellAt(cells, indexByHeader, "position")
        ? { position: cellAt(cells, indexByHeader, "position") }
        : {}),
      isPlayer,
      parentContacts: parseTeamLinktContacts(cells, indexByHeader),
    };
  });
}

function matchHeaderField(header: string): RosterCsvField | null {
  const norm = normalizeHeader(header);
  if (!norm) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    Exclude<RosterCsvField, "ignore">,
    string[],
  ][]) {
    if (aliases.includes(norm)) return field;
    if (norm === field.replace(/([A-Z])/g, " $1").toLowerCase().trim()) {
      return field;
    }
  }
  return null;
}

/** Guess column mapping from header row. Unmatched columns default to ignore. */
export function guessRosterColumnMapping(headers: string[]): RosterColumnMapping {
  const mapping: RosterColumnMapping = {};
  const used = new Set<RosterCsvField>();

  headers.forEach((header, index) => {
    const guessed = matchHeaderField(header);
    if (guessed && !used.has(guessed)) {
      mapping[index] = guessed;
      used.add(guessed);
    } else {
      mapping[index] = "ignore";
    }
  });

  return mapping;
}

export function mappingHasPlayerIdentity(mapping: RosterColumnMapping): boolean {
  const fields = new Set(Object.values(mapping));
  if (fields.has("playerName")) return true;
  return fields.has("playerFirstName") && fields.has("playerLastName");
}

export function unmappedRequiredFields(
  mapping: RosterColumnMapping,
): RosterCsvField[] {
  const fields = new Set(Object.values(mapping));
  const missing: RosterCsvField[] = [];
  if (!fields.has("playerName")) {
    if (!fields.has("playerFirstName")) missing.push("playerFirstName");
    if (!fields.has("playerLastName")) missing.push("playerLastName");
  }
  return missing;
}

export function resolvePlayerName(row: ParsedRosterRow): string | null {
  const full = trimCell(row.playerName);
  if (full) return full;
  const first = trimCell(row.playerFirstName);
  const last = trimCell(row.playerLastName);
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return null;
}

/** Apply column mapping to raw CSV data rows (excluding header). */
export function mapRosterRows(
  dataRows: string[][],
  mapping: RosterColumnMapping,
  headerRowIndex = 0,
): ParsedRosterRow[] {
  const out: ParsedRosterRow[] = [];

  dataRows.forEach((cells, offset) => {
    const rowIndex = headerRowIndex + 1 + offset;
    const row: ParsedRosterRow = { rowIndex, isPlayer: null };
    for (const [indexStr, field] of Object.entries(mapping)) {
      if (field === "ignore") continue;
      const index = Number(indexStr);
      const value = trimCell(cells[index]);
      if (!value) continue;
      switch (field) {
        case "playerFirstName":
          row.playerFirstName = value;
          break;
        case "playerLastName":
          row.playerLastName = value;
          break;
        case "playerName":
          row.playerName = value;
          break;
        case "jerseyNumber":
          row.jerseyNumber = value;
          break;
        case "position":
          row.position = value;
          break;
        case "teamName":
          row.teamName = value;
          break;
        case "isPlayer":
          row.isPlayer = normalizeIsPlayer(value);
          break;
        case "parentName":
          row.parentName = value;
          break;
        case "parentEmail":
          row.parentEmail = value;
          break;
        case "phone":
          row.phone = value;
          break;
        default:
          break;
      }
    }
    out.push(row);
  });

  return out;
}

export function normalizeEmail(email: string | undefined): string | undefined {
  const t = trimCell(email)?.toLowerCase();
  if (!t || !t.includes("@")) return undefined;
  return t;
}

/** Suggested team name from the first non-empty Team Name cell in a TeamLinkt export. */
export function suggestedTeamNameFromRows(rows: ParsedRosterRow[]): string | undefined {
  for (const row of rows) {
    const name = trimCell(row.teamName);
    if (name) return name;
  }
  return undefined;
}
