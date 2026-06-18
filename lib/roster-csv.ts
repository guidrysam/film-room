/**
 * TeamLinkt-style roster CSV parsing and column mapping (no API integration).
 */

export type RosterCsvField =
  | "playerFirstName"
  | "playerLastName"
  | "playerName"
  | "jerseyNumber"
  | "parentName"
  | "parentEmail"
  | "phone"
  | "ignore";

export const ROSTER_CSV_FIELD_LABELS: Record<RosterCsvField, string> = {
  playerFirstName: "Player first name",
  playerLastName: "Player last name",
  playerName: "Player name",
  jerseyNumber: "Jersey number",
  parentName: "Parent / guardian name",
  parentEmail: "Parent email",
  phone: "Phone (optional)",
  ignore: "Ignore column",
};

/** Columns commonly exported from TeamLinkt roster CSVs. */
export const TEAMLINKT_ROSTER_CSV_COLUMNS = [
  "Player First Name",
  "Player Last Name",
  "Player Name",
  "Jersey Number",
  "Parent Name",
  "Parent Email",
  "Phone",
] as const;

export type RosterColumnMapping = Record<number, RosterCsvField>;

export type ParsedRosterRow = {
  rowIndex: number;
  playerFirstName?: string;
  playerLastName?: string;
  playerName?: string;
  jerseyNumber?: string;
  parentName?: string;
  parentEmail?: string;
  phone?: string;
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
  parentName: [
    "parent",
    "parent name",
    "parent/guardian",
    "parent guardian",
    "guardian",
    "guardian name",
    "parent_name",
  ],
  parentEmail: [
    "email",
    "parent email",
    "parent e-mail",
    "e-mail",
    "parent_email",
    "guardian email",
  ],
  phone: ["phone", "mobile", "cell", "phone number", "parent phone"],
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
    const row: ParsedRosterRow = { rowIndex };
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
