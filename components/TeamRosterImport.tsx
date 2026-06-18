"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildRosterImportPreview,
  importRosterPreview,
  type RosterImportPreviewRow,
  type RosterImportResult,
} from "@/lib/roster-import";
import {
  guessRosterColumnMapping,
  isTeamLinktRosterExport,
  mapRosterRows,
  mappingHasPlayerIdentity,
  parseCsvText,
  parseTeamLinktRosterRows,
  ROSTER_CSV_FIELD_LABELS,
  suggestedTeamNameFromRows,
  TEAMLINKT_ROSTER_CSV_COLUMNS,
  trimTrailingEmptyCsvColumns,
  unmappedRequiredFields,
  type RosterColumnMapping,
  type RosterCsvField,
} from "@/lib/roster-csv";
import { canCoachTeam, listTeamPlayers, type Team } from "@/lib/teams";

export type TeamRosterImportProps = {
  team: Team;
  currentUid: string;
};

const inputClass =
  "w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50";

const primaryBtn =
  "rounded-md border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40";

const STATUS_BADGE: Record<RosterImportPreviewRow["status"], string> = {
  create: "border-emerald-500/40 bg-emerald-950/35 text-emerald-200",
  update: "border-amber-500/40 bg-amber-950/35 text-amber-200",
  skip: "border-zinc-600/40 bg-zinc-800/40 text-zinc-400",
  invalid: "border-rose-500/35 bg-rose-950/30 text-rose-200",
};

const MAPPING_OPTIONS: RosterCsvField[] = [
  "playerName",
  "playerFirstName",
  "playerLastName",
  "jerseyNumber",
  "position",
  "teamName",
  "isPlayer",
  "parentName",
  "parentEmail",
  "phone",
  "ignore",
];

function ImportResultSummary({ result }: { result: RosterImportResult }) {
  const items = [
    { label: "Players created", value: result.playersCreated },
    { label: "Players updated", value: result.playersUpdated },
    { label: "Parent contacts created", value: result.parentsSaved },
    { label: "Invalid rows skipped", value: result.skipped },
  ];

  return (
    <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-3">
      <p className="mb-2 text-[11px] font-semibold text-emerald-100">
        Import complete
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(({ label, value }) => (
          <li
            key={label}
            className="rounded-md border border-white/[0.06] bg-black/25 px-2 py-2 text-center"
          >
            <p className="text-lg font-semibold text-white">{value}</p>
            <p className="text-[9px] uppercase tracking-wide text-zinc-500">
              {label}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-snug text-emerald-200/90">
        Players appear on the team roster. Parent contacts appear in Parent
        onboarding below — copy invite links when you are ready.
      </p>
    </div>
  );
}

/**
 * Import a TeamLinkt-style roster CSV into team players and parent invite targets.
 */
export default function TeamRosterImport({
  team,
  currentUid,
}: TeamRosterImportProps) {
  const canImport = canCoachTeam(team, currentUid);

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<RosterColumnMapping>({});
  const [preview, setPreview] = useState<RosterImportPreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<RosterImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showColumnHelp, setShowColumnHelp] = useState(false);
  const [teamLinktMode, setTeamLinktMode] = useState(false);
  const [suggestedTeamName, setSuggestedTeamName] = useState<string | null>(null);

  const missingFields = useMemo(
    () => unmappedRequiredFields(mapping),
    [mapping],
  );
  const hasPlayerIdentity = useMemo(
    () => mappingHasPlayerIdentity(mapping),
    [mapping],
  );

  const reset = useCallback(() => {
    setFileName(null);
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError(null);
    setTeamLinktMode(false);
    setSuggestedTeamName(null);
  }, []);

  const handleFile = useCallback(
    async (file: File | null) => {
      reset();
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
        setError("Please upload a .csv file.");
        return;
      }
      try {
        const text = await file.text();
        const rows = trimTrailingEmptyCsvColumns(parseCsvText(text));
        if (rows.length < 2) {
          setError("CSV must include a header row and at least one player row.");
          return;
        }
        const headerRow = rows[0]!;
        const body = rows.slice(1);
        const teamLinkt = isTeamLinktRosterExport(headerRow);
        setFileName(file.name);
        setHeaders(headerRow);
        setDataRows(body);
        setTeamLinktMode(teamLinkt);
        if (teamLinkt) {
          const parsed = parseTeamLinktRosterRows(headerRow, body);
          setSuggestedTeamName(suggestedTeamNameFromRows(parsed) ?? null);
        } else {
          setMapping(guessRosterColumnMapping(headerRow));
          setSuggestedTeamName(null);
        }
      } catch {
        setError("Could not read this CSV file.");
      }
    },
    [reset],
  );

  const handleMappingChange = useCallback(
    (columnIndex: number, field: RosterCsvField) => {
      setMapping((prev) => ({ ...prev, [columnIndex]: field }));
      setPreview(null);
      setResult(null);
    },
    [],
  );

  const handlePreview = useCallback(async () => {
    if (!teamLinktMode && !hasPlayerIdentity) {
      setError("Map player name or first + last name before previewing.");
      return;
    }
    setPreviewLoading(true);
    setError(null);
    setResult(null);
    try {
      const parsed = teamLinktMode
        ? parseTeamLinktRosterRows(headers, dataRows)
        : mapRosterRows(dataRows, mapping);
      const existing = await listTeamPlayers(team.id);
      setPreview(buildRosterImportPreview(parsed, existing));
    } catch {
      setError("Could not build import preview.");
    } finally {
      setPreviewLoading(false);
    }
  }, [
    teamLinktMode,
    hasPlayerIdentity,
    headers,
    dataRows,
    mapping,
    team.id,
  ]);

  useEffect(() => {
    const ready = teamLinktMode
      ? dataRows.length > 0
      : hasPlayerIdentity && dataRows.length > 0;
    if (!ready) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void handlePreview();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [teamLinktMode, mapping, dataRows, hasPlayerIdentity, handlePreview]);

  const handleImport = useCallback(async () => {
    if (!preview?.length) return;
    setImporting(true);
    setError(null);
    try {
      const summary = await importRosterPreview(team.id, preview);
      setResult(summary);
      setPreview(null);
      setFileName(null);
      setHeaders([]);
      setDataRows([]);
      setMapping({});
      setTeamLinktMode(false);
      setSuggestedTeamName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [preview, team.id]);

  const importableCount = useMemo(
    () =>
      preview?.filter((r) => r.status === "create" || r.status === "update")
        .length ?? 0,
    [preview],
  );

  if (!canImport) {
    return (
      <p className="text-[10px] leading-snug text-zinc-500">
        Roster import is available to team admins and coaches.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        TeamLinkt / roster CSV import
      </p>
      <p className="mb-3 text-xs leading-relaxed text-zinc-400">
        Export your roster from TeamLinkt, then upload the CSV here. TeamLinkt
        exports are detected automatically; other CSVs can use manual column
        mapping below.
      </p>

      <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setShowColumnHelp((s) => !s)}
          className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-medium text-zinc-300"
          aria-expanded={showColumnHelp}
        >
          <span>Expected CSV columns</span>
          <span className="text-zinc-500">{showColumnHelp ? "▲" : "▼"}</span>
        </button>
        {showColumnHelp ? (
          <ul className="mt-2 space-y-1 border-t border-white/[0.06] pt-2 text-[10px] text-zinc-500">
            {TEAMLINKT_ROSTER_CSV_COLUMNS.map((col) => (
              <li key={col} className="flex items-center gap-2">
                <span className="font-mono text-zinc-400">{col}</span>
              </li>
            ))}
            <li className="pt-1 text-zinc-600">
              Rows with Is Player = Yes become roster players. Coach/manager rows
              are skipped. Parent invite targets come from Contact 1–3 when email
              is present and relationship is not Player.
            </li>
          </ul>
        ) : null}
      </div>

      {result ? <ImportResultSummary result={result} /> : null}

      {!fileName ? (
        <label className="mb-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-500/25 bg-blue-950/15 px-4 py-7 text-center transition hover:border-blue-500/40 hover:bg-blue-950/25">
          <span className="text-sm font-medium text-zinc-100">
            Upload TeamLinkt CSV
          </span>
          <span className="mt-1 text-[11px] text-zinc-400">
            .csv roster export from TeamLinkt or similar
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2">
          <div className="min-w-0">
            <span className="block truncate text-[11px] text-zinc-300">
              {fileName}
            </span>
            {teamLinktMode ? (
              <span className="text-[10px] text-blue-300">
                TeamLinkt export detected
                {suggestedTeamName && suggestedTeamName !== team.name
                  ? ` · CSV team: ${suggestedTeamName}`
                  : null}
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500">
                Generic CSV — map columns below
              </span>
            )}
          </div>
          <button type="button" onClick={reset} className={ghostBtn}>
            Clear
          </button>
        </div>
      )}

      {headers.length > 0 && !teamLinktMode ? (
        <div className="mb-3">
          <p className="mb-2 text-[10px] font-medium text-zinc-400">
            Column mapping
          </p>
          {missingFields.length > 0 ? (
            <p className="mb-2 text-[10px] leading-snug text-amber-200">
              Map{" "}
              {missingFields
                .map((f) => ROSTER_CSV_FIELD_LABELS[f])
                .join(" and ")}{" "}
              or a single Player name column.
            </p>
          ) : null}
          <ul className="space-y-1.5">
            {headers.map((header, index) => (
              <li
                key={`${index}-${header}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-white/[0.05] bg-black/20 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-400">
                  {header || `Column ${index + 1}`}
                </span>
                <select
                  value={mapping[index] ?? "ignore"}
                  onChange={(e) =>
                    handleMappingChange(index, e.target.value as RosterCsvField)
                  }
                  className={`${inputClass} max-w-[11rem]`}
                >
                  {MAPPING_OPTIONS.map((field) => (
                    <option key={field} value={field}>
                      {ROSTER_CSV_FIELD_LABELS[field]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={!hasPlayerIdentity || previewLoading}
            className={`${ghostBtn} mt-2`}
          >
            {previewLoading ? "Building preview…" : "Refresh preview"}
          </button>
        </div>
      ) : null}

      {preview && preview.length > 0 ? (
        <div className="mb-3">
          <p className="mb-2 text-[10px] font-medium text-zinc-400">
            Import preview ({importableCount} to import,{" "}
            {preview.filter((r) => r.status === "skip").length} skipped,{" "}
            {preview.filter((r) => r.status === "invalid").length} invalid)
          </p>
          <div className="max-h-56 overflow-auto rounded-md border border-white/[0.06]">
            <table className="w-full text-left text-[10px]">
              <thead className="sticky top-0 bg-zinc-900/95 text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Player</th>
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">Pos</th>
                  <th className="px-2 py-1.5 font-medium">Parents</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className="border-t border-white/[0.04] text-zinc-300"
                  >
                    <td className="px-2 py-1.5">{row.playerName || "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-500">
                      {row.jerseyNumber ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">{row.position ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {row.parentContacts?.length
                        ? `${row.parentContacts.length} contact${row.parentContacts.length === 1 ? "" : "s"}`
                        : row.parentName ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${STATUS_BADGE[row.status]}`}
                        title={row.message}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={importing || importableCount === 0}
            className={`${primaryBtn} mt-3`}
          >
            {importing
              ? "Importing…"
              : `Import ${importableCount} player${importableCount === 1 ? "" : "s"}`}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-[10px] leading-snug text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
