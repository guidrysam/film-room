import {
  detectTeamNamesFromRows,
  guessRosterColumnMapping,
  isTeamLinktRosterExport,
  mapRosterRows,
  parseCsvText,
  parseTeamLinktRosterRows,
  trimTrailingEmptyCsvColumns,
  type ParsedRosterRow,
  type RosterColumnMapping,
  type TeamNameDetection,
} from "@/lib/roster-csv";

export type ParsedRosterCsvBundle = {
  headers: string[];
  dataRows: string[][];
  teamLinktMode: boolean;
  mapping: RosterColumnMapping;
  parsedRows: ParsedRosterRow[];
  teamNameDetection: TeamNameDetection;
};

export function parseRosterRowsFromBundle(
  bundle: Pick<
    ParsedRosterCsvBundle,
    "headers" | "dataRows" | "teamLinktMode" | "mapping"
  >,
): ParsedRosterRow[] {
  return bundle.teamLinktMode
    ? parseTeamLinktRosterRows(bundle.headers, bundle.dataRows)
    : mapRosterRows(bundle.dataRows, bundle.mapping);
}

/** Parse roster CSV text into headers, rows, and TeamLinkt detection metadata. */
export function parseRosterCsvText(
  text: string,
): ParsedRosterCsvBundle | { error: string } {
  const rows = trimTrailingEmptyCsvColumns(parseCsvText(text));
  if (rows.length < 2) {
    return {
      error: "CSV must include a header row and at least one player row.",
    };
  }

  const headers = rows[0]!;
  const dataRows = rows.slice(1);
  const teamLinktMode = isTeamLinktRosterExport(headers);
  const mapping = teamLinktMode ? {} : guessRosterColumnMapping(headers);
  const parsedRows = parseRosterRowsFromBundle({
    headers,
    dataRows,
    teamLinktMode,
    mapping,
  });

  return {
    headers,
    dataRows,
    teamLinktMode,
    mapping,
    parsedRows,
    teamNameDetection: detectTeamNamesFromRows(parsedRows),
  };
}
