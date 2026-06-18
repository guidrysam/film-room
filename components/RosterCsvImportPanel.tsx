"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildRosterImportPreview,
  summarizeRosterImportPreview,
  type RosterImportPreviewRow,
  type RosterImportPreviewSummary,
} from "@/lib/roster-import";
import {
  parseRosterCsvText,
  parseRosterRowsFromBundle,
  type ParsedRosterCsvBundle,
} from "@/lib/roster-csv-parse";
import {
  mappingHasPlayerIdentity,
  ROSTER_CSV_FIELD_LABELS,
  TEAMLINKT_ROSTER_CSV_COLUMNS,
  unmappedRequiredFields,
  type RosterColumnMapping,
  type RosterCsvField,
} from "@/lib/roster-csv";
import { listTeamPlayers, type Player } from "@/lib/teams";

export type RosterCsvImportPanelProps = {
  existingPlayers?: Player[];
  teamId?: string;
  compareTeamName?: string;
  onPreviewChange?: (
    preview: RosterImportPreviewRow[] | null,
    summary: RosterImportPreviewSummary | null,
    bundle: ParsedRosterCsvBundle | null,
  ) => void;
  showColumnHelp?: boolean;
  compact?: boolean;
};

const inputClass =
  "w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50";

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

export default function RosterCsvImportPanel({
  existingPlayers: existingPlayersProp,
  teamId,
  compareTeamName,
  onPreviewChange,
  showColumnHelp = true,
  compact = false,
}: RosterCsvImportPanelProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ParsedRosterCsvBundle | null>(null);
  const [mapping, setMapping] = useState<RosterColumnMapping>({});
  const [preview, setPreview] = useState<RosterImportPreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const teamLinktMode = bundle?.teamLinktMode ?? false;
  const headers = bundle?.headers ?? [];
  const dataRows = bundle?.dataRows ?? [];
  const teamNameDetection = bundle?.teamNameDetection;

  const missingFields = useMemo(
    () => unmappedRequiredFields(mapping),
    [mapping],
  );
  const hasPlayerIdentity = useMemo(
    () => mappingHasPlayerIdentity(mapping),
    [mapping],
  );

  const previewSummary = useMemo(
    () => (preview ? summarizeRosterImportPreview(preview) : null),
    [preview],
  );

  const reset = useCallback(() => {
    setFileName(null);
    setBundle(null);
    setMapping({});
    setPreview(null);
    setError(null);
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
        const parsed = parseRosterCsvText(text);
        if ("error" in parsed) {
          setError(parsed.error);
          return;
        }
        setFileName(file.name);
        setBundle(parsed);
        setMapping(parsed.mapping);
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
    },
    [],
  );

  const buildPreview = useCallback(async () => {
    if (!bundle) return;
    if (!teamLinktMode && !hasPlayerIdentity) {
      setError("Map player name or first + last name before previewing.");
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const parsedRows = parseRosterRowsFromBundle({
        ...bundle,
        mapping,
      });
      const existing =
        existingPlayersProp ??
        (teamId ? await listTeamPlayers(teamId) : []);
      const nextPreview = buildRosterImportPreview(parsedRows, existing);
      setPreview(nextPreview);
    } catch {
      setError("Could not build import preview.");
    } finally {
      setPreviewLoading(false);
    }
  }, [
    bundle,
    teamLinktMode,
    hasPlayerIdentity,
    mapping,
    existingPlayersProp,
    teamId,
  ]);

  useEffect(() => {
    const ready = bundle
      ? teamLinktMode
        ? dataRows.length > 0
        : hasPlayerIdentity && dataRows.length > 0
      : false;
    if (!ready) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void buildPreview();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bundle, teamLinktMode, mapping, dataRows.length, hasPlayerIdentity, buildPreview]);

  useEffect(() => {
    onPreviewChange?.(preview, previewSummary, bundle);
  }, [preview, previewSummary, bundle, onPreviewChange]);

  const importableCount = useMemo(
    () =>
      preview?.filter((row) => row.status === "create" || row.status === "update")
        .length ?? 0,
    [preview],
  );

  return (
    <div>
      {showColumnHelp ? (
        <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setShowHelp((value) => !value)}
            className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-medium text-zinc-300"
            aria-expanded={showHelp}
          >
            <span>Expected CSV columns</span>
            <span className="text-zinc-500">{showHelp ? "▲" : "▼"}</span>
          </button>
          {showHelp ? (
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
      ) : null}

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
                {teamNameDetection?.suggested &&
                compareTeamName &&
                teamNameDetection.suggested !== compareTeamName
                  ? ` · CSV team: ${teamNameDetection.suggested}`
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
                .map((field) => ROSTER_CSV_FIELD_LABELS[field])
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
            onClick={() => void buildPreview()}
            disabled={!hasPlayerIdentity || previewLoading}
            className={`${ghostBtn} mt-2`}
          >
            {previewLoading ? "Building preview…" : "Refresh preview"}
          </button>
        </div>
      ) : null}

      {previewSummary && !compact ? (
        <div className="mb-3 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[10px] text-zinc-400">
          <p>
            <span className="font-medium text-zinc-300">
              {importableCount} player{importableCount === 1 ? "" : "s"}
            </span>{" "}
            to import ·{" "}
            <span className="font-medium text-zinc-300">
              {previewSummary.parentContactCount} parent contact
              {previewSummary.parentContactCount === 1 ? "" : "s"}
            </span>{" "}
            · {previewSummary.skippedCount} skipped ·{" "}
            {previewSummary.invalidCount} invalid
          </p>
        </div>
      ) : null}

      {preview && preview.length > 0 && !compact ? (
        <div className="mb-3">
          <p className="mb-2 text-[10px] font-medium text-zinc-400">
            Import preview ({importableCount} to import,{" "}
            {preview.filter((row) => row.status === "skip").length} skipped,{" "}
            {preview.filter((row) => row.status === "invalid").length} invalid)
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
        </div>
      ) : null}

      {error ? (
        <p className="text-[10px] leading-snug text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}

export function useRosterCsvImportPreview() {
  const [preview, setPreview] = useState<RosterImportPreviewRow[] | null>(null);
  const [summary, setSummary] = useState<RosterImportPreviewSummary | null>(null);
  const [bundle, setBundle] = useState<ParsedRosterCsvBundle | null>(null);

  const onPreviewChange = useCallback(
    (
      nextPreview: RosterImportPreviewRow[] | null,
      nextSummary: RosterImportPreviewSummary | null,
      nextBundle: ParsedRosterCsvBundle | null,
    ) => {
      setPreview(nextPreview);
      setSummary(nextSummary);
      setBundle(nextBundle);
    },
    [],
  );

  return { preview, summary, bundle, onPreviewChange };
}
