"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parseScheduleCsvText,
  scheduleTeamNames,
  type ParsedScheduleRow,
} from "@/lib/schedule-csv";
import {
  buildTeamScopedPlan,
  classifyScheduleRows,
  importSchedulePlan,
  type ScheduleImportResult,
} from "@/lib/schedule-import";
import {
  listTeamGames,
  teamNameKey,
  teamNameSimilarity,
  type Team,
} from "@/lib/teams";
import type { Game } from "@/lib/games";

export type TeamScheduleImportProps = {
  team: Team;
  currentUid: string;
};

const ghostBtn =
  "inline-flex items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

/** Auto-select CSV team names at or above this fuzzy score. */
const AUTO_MATCH_THRESHOLD = 0.5;

function matchHint(score: number): { label: string; cls: string } {
  if (score >= 0.999)
    return {
      label: "exact match",
      cls: "border-emerald-500/40 bg-emerald-950/35 text-emerald-200",
    };
  if (score >= AUTO_MATCH_THRESHOLD)
    return {
      label: "likely match",
      cls: "border-emerald-500/30 bg-emerald-950/25 text-emerald-200/90",
    };
  if (score > 0)
    return {
      label: "low match",
      cls: "border-amber-500/30 bg-amber-950/25 text-amber-200/90",
    };
  return {
    label: "no match",
    cls: "border-white/10 bg-white/[0.04] text-zinc-400",
  };
}

export default function TeamScheduleImport({
  team,
  currentUid,
}: TeamScheduleImportProps) {
  const [expanded, setExpanded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedScheduleRow[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [existingGames, setExistingGames] = useState<Game[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ScheduleImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFileName(null);
    setRows(null);
    setSelectedKeys(new Set());
    setResult(null);
    setError(null);
  }, []);

  // Distinct CSV team names with their fuzzy score against THIS team.
  const csvTeams = useMemo(() => {
    if (!rows) return [];
    return scheduleTeamNames(rows).map((name) => ({
      name,
      key: teamNameKey(name),
      count: rows.filter((r) => teamNameKey(r.teamName) === teamNameKey(name))
        .length,
      score: teamNameSimilarity(team.name, name),
    }));
  }, [rows, team.name]);

  const handleFile = useCallback(
    async (file: File | null) => {
      reset();
      if (!file) return;
      if (
        !file.name.toLowerCase().endsWith(".csv") &&
        file.type !== "text/csv"
      ) {
        setError("Please upload a .csv file.");
        return;
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        setError("Could not read this CSV file.");
        return;
      }
      const parsed = parseScheduleCsvText(text);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      setFileName(file.name);
      setRows(parsed.rows);
      // Auto-select CSV team names that fuzzy-match this team.
      const auto = new Set<string>();
      for (const name of scheduleTeamNames(parsed.rows)) {
        if (teamNameSimilarity(team.name, name) >= AUTO_MATCH_THRESHOLD) {
          auto.add(teamNameKey(name));
        }
      }
      setSelectedKeys(auto);
    },
    [reset, team.name],
  );

  // Load this team's existing games once a CSV is parsed (drives the diff).
  useEffect(() => {
    if (!rows) {
      setExistingGames([]);
      return;
    }
    let active = true;
    listTeamGames(currentUid, team.id)
      .then((g) => active && setExistingGames(g))
      .catch(() => active && setExistingGames([]));
    return () => {
      active = false;
    };
  }, [rows, currentUid, team.id]);

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedRows = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => selectedKeys.has(teamNameKey(r.teamName)));
  }, [rows, selectedKeys]);

  const classified = useMemo(
    () => classifyScheduleRows(selectedRows, existingGames),
    [selectedRows, existingGames],
  );

  const counts = useMemo(
    () =>
      classified.reduce(
        (acc, r) => {
          acc[r.status]++;
          return acc;
        },
        { new: 0, updated: 0, unchanged: 0 } as Record<
          "new" | "updated" | "unchanged",
          number
        >,
      ),
    [classified],
  );

  const totalToWrite = counts.new + counts.updated;

  const runImport = useCallback(async () => {
    if (selectedRows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const plan = buildTeamScopedPlan(team, classified);
      const res = await importSchedulePlan(currentUid, [plan]);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [selectedRows.length, team, classified, currentUid]);

  return (
    <section className={`${panelClass} mb-6`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Import schedule (CSV)
          </span>
          <span className="mt-0.5 block text-[11px] text-zinc-500">
            Create games for {team.name} from a schedule export — names don&apos;t
            have to match exactly.
          </span>
        </span>
        <span className="shrink-0 text-zinc-400" aria-hidden>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded ? (
        <div className="mt-4">
          {!fileName ? (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-500/25 bg-blue-950/15 px-4 py-7 text-center transition hover:border-blue-500/40 hover:bg-blue-950/25">
              <span className="text-sm font-medium text-zinc-100">
                Upload schedule CSV
              </span>
              <span className="mt-1 text-[11px] text-zinc-400">
                Any export with Team, Date/Time, and Home/Away or Matchup columns
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
              <span className="min-w-0 truncate text-[11px] text-zinc-300">
                {fileName}
                {rows ? ` · ${rows.length} games` : ""}
              </span>
              <button type="button" onClick={reset} className={ghostBtn}>
                Clear
              </button>
            </div>
          )}

          {result ? (
            <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-3 text-[12px] text-emerald-100">
              <p className="font-semibold text-emerald-200">Import complete</p>
              <p className="mt-1 text-emerald-100/90">
                {result.gamesCreated} created · {result.gamesUpdated} updated ·{" "}
                {result.gamesUnchanged} unchanged.
              </p>
              {result.errors.length > 0 ? (
                <p className="mt-1 text-rose-300">
                  {result.errors.length} row(s) failed — see console for details.
                </p>
              ) : null}
            </div>
          ) : null}

          {rows && !result ? (
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-[11px] font-medium text-zinc-300">
                  Which schedule teams belong to{" "}
                  <span className="font-semibold text-white">{team.name}</span>?
                </p>
                <ul className="space-y-1.5">
                  {csvTeams.map((ct) => {
                    const hint = matchHint(ct.score);
                    const checked = selectedKeys.has(ct.key);
                    return (
                      <li key={ct.key}>
                        <label
                          className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-2 transition ${
                            checked
                              ? "border-blue-500/45 bg-blue-950/25"
                              : "border-white/[0.06] bg-black/25 hover:border-white/15"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleKey(ct.key)}
                              className="h-3.5 w-3.5 shrink-0 accent-blue-500"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-medium text-zinc-100">
                                {ct.name}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                {ct.count} game{ct.count === 1 ? "" : "s"}
                              </span>
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${hint.cls}`}
                          >
                            {hint.label}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {selectedRows.length > 0 ? (
                <div className="rounded-md border border-white/[0.06] bg-zinc-950/40 p-2.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-400">
                      {selectedRows.length} game
                      {selectedRows.length === 1 ? "" : "s"} selected
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-950/25 px-1.5 py-0.5 font-medium text-emerald-200">
                        + {counts.new} new
                      </span>
                      <span className="rounded-md border border-amber-500/30 bg-amber-950/25 px-1.5 py-0.5 font-medium text-amber-200">
                        ~ {counts.updated} updated
                      </span>
                      <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-medium text-zinc-300">
                        = {counts.unchanged} unchanged
                      </span>
                    </div>
                  </div>
                  <div className="max-h-44 overflow-auto rounded-md border border-white/[0.06]">
                    <table className="w-full text-left text-[10px]">
                      <thead className="sticky top-0 bg-zinc-900/95 text-zinc-500">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">#</th>
                          <th className="px-2 py-1.5 font-medium">Game</th>
                          <th className="px-2 py-1.5 font-medium">Date / Time</th>
                          <th className="px-2 py-1.5 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classified.map((item, i) => (
                          <tr
                            key={`${item.row.rowIndex}-${i}`}
                            className="border-t border-white/[0.04] text-zinc-300"
                          >
                            <td className="px-2 py-1.5 font-mono text-zinc-500">
                              {item.row.matchNumber ?? "—"}
                            </td>
                            <td className="px-2 py-1.5">
                              {item.row.title}
                              {item.row.usedFallbackTitle ? (
                                <span className="ml-1 text-[9px] text-amber-300/80">
                                  (auto)
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-1.5 text-zinc-400">
                              {item.row.date ?? "—"}
                              {item.row.time ? ` · ${item.row.time}` : ""}
                            </td>
                            <td className="px-2 py-1.5">
                              <span
                                className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                                  item.status === "new"
                                    ? "border-emerald-500/40 bg-emerald-950/35 text-emerald-200"
                                    : item.status === "updated"
                                      ? "border-amber-500/40 bg-amber-950/35 text-amber-200"
                                      : "border-zinc-600/40 bg-zinc-800/40 text-zinc-400"
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-center text-[11px] text-zinc-400">
                  Select at least one schedule team above to import its games into{" "}
                  {team.name}.
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void runImport()}
                  disabled={importing || totalToWrite === 0}
                  className={primaryBtn}
                >
                  {importing
                    ? "Importing…"
                    : `Import ${totalToWrite} game${totalToWrite === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-2 text-[11px] leading-snug text-rose-300">{error}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
