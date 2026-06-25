"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  parseScheduleCsvText,
  type ParsedScheduleRow,
} from "@/lib/schedule-csv";
import {
  importSchedulePlan,
  loadScheduleImportPlan,
  type ScheduleImportResult,
  type ScheduleTeamPlan,
} from "@/lib/schedule-import";
import { listMyTeams, type Team } from "@/lib/teams";
import { teamSetupUrl } from "@/lib/team-routes";

export type ScheduleCsvImportProps = { uid: string };

const ghostBtn =
  "inline-flex items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

function SyncCounts({
  counts,
}: {
  counts: { new: number; updated: number; unchanged: number };
}) {
  return (
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
  );
}

export default function ScheduleCsvImport({ uid }: ScheduleCsvImportProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedScheduleRow[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [plans, setPlans] = useState<ScheduleTeamPlan[] | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ScheduleImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMyTeams(uid)
      .then((t) => active && setTeams(t))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [uid]);

  const reset = useCallback(() => {
    setFileName(null);
    setRows(null);
    setPlans(null);
    setResult(null);
    setError(null);
  }, []);

  const ingestText = useCallback((text: string, name: string | null) => {
    setResult(null);
    setError(null);
    const parsed = parseScheduleCsvText(text);
    if (!parsed.ok) {
      setRows(null);
      setPlans(null);
      setError(parsed.error);
      return;
    }
    setFileName(name);
    setRows(parsed.rows);
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
        ingestText(text, file.name);
      } catch {
        setError("Could not read this CSV file.");
      }
    },
    [reset, ingestText],
  );

  // Build the per-team plan whenever rows or teams change.
  useEffect(() => {
    if (!rows) {
      setPlans(null);
      return;
    }
    let active = true;
    setPlanLoading(true);
    loadScheduleImportPlan(uid, rows, teams)
      .then((p) => {
        if (active) setPlans(p);
      })
      .catch(() => {
        if (active) setError("Could not build the import plan.");
      })
      .finally(() => {
        if (active) setPlanLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rows, teams, uid]);

  const matchedPlans = plans?.filter((p) => !p.unmatched) ?? [];
  const unmatchedPlans = plans?.filter((p) => p.unmatched) ?? [];
  const totalToWrite = matchedPlans.reduce(
    (n, p) => n + p.counts.new + p.counts.updated,
    0,
  );

  const runImport = useCallback(async () => {
    if (!plans) return;
    setImporting(true);
    setError(null);
    try {
      const res = await importSchedulePlan(uid, plans);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [plans, uid]);

  return (
    <div>
      {!fileName ? (
        <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-500/25 bg-blue-950/15 px-4 py-8 text-center transition hover:border-blue-500/40 hover:bg-blue-950/25">
          <span className="text-sm font-medium text-zinc-100">
            Upload schedule CSV
          </span>
          <span className="mt-1 text-[11px] text-zinc-400">
            Any schedule export with Team, Date/Time, and Home/Away or Matchup
            columns
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2">
          <span className="min-w-0 truncate text-[11px] text-zinc-300">
            {fileName}
            {rows ? ` · ${rows.length} games` : ""}
          </span>
          <button type="button" onClick={reset} className={ghostBtn}>
            Clear
          </button>
        </div>
      )}

      {planLoading ? (
        <p className="mb-3 text-[11px] text-zinc-400">Matching teams…</p>
      ) : null}

      {result ? (
        <div className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-3 text-[12px] text-emerald-100">
          <p className="font-semibold text-emerald-200">Import complete</p>
          <p className="mt-1 text-emerald-100/90">
            {result.gamesCreated} created · {result.gamesUpdated} updated ·{" "}
            {result.gamesUnchanged} unchanged across {result.teamsTouched} team
            {result.teamsTouched === 1 ? "" : "s"}.
          </p>
          {result.unmatchedTeams.length > 0 ? (
            <p className="mt-1 text-amber-200/90">
              Skipped (no matching Film Room team):{" "}
              {result.unmatchedTeams.join(", ")}
            </p>
          ) : null}
          {result.errors.length > 0 ? (
            <p className="mt-1 text-rose-300">
              {result.errors.length} row(s) failed — see console for details.
            </p>
          ) : null}
        </div>
      ) : null}

      {plans && plans.length > 0 && !result ? (
        <div className="space-y-3">
          {matchedPlans.map((plan) => (
            <div
              key={plan.teamName}
              className="rounded-lg border border-white/[0.07] bg-zinc-950/40 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {plan.matchedTeam?.name ?? plan.teamName}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {plan.rows.length} game{plan.rows.length === 1 ? "" : "s"} in
                    CSV
                  </p>
                </div>
                <SyncCounts counts={plan.counts} />
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
                    {plan.rows.map((item, i) => (
                      <tr
                        key={`${plan.teamName}-${item.row.rowIndex}-${i}`}
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
          ))}

          {unmatchedPlans.length > 0 ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-950/15 px-3 py-3 text-[11px] text-amber-100">
              <p className="font-semibold text-amber-200">
                No matching Film Room team
              </p>
              <p className="mt-1 text-amber-100/90">
                These schedule teams will be skipped. Create or rename a team so
                the name matches, then re-import:
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {unmatchedPlans.map((p) => (
                  <li key={p.teamName} className="flex items-center gap-2">
                    <span className="text-amber-200">{p.teamName}</span>
                    <span className="text-amber-100/60">
                      ({p.rows.length} game{p.rows.length === 1 ? "" : "s"})
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/team/new"
                className={`${ghostBtn} mt-2 border-amber-400/30 text-amber-100`}
              >
                Create a team
              </Link>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-zinc-400">
              {totalToWrite} game{totalToWrite === 1 ? "" : "s"} to create/update
              {matchedPlans.length > 0
                ? ` · ${matchedPlans.length} team${matchedPlans.length === 1 ? "" : "s"}`
                : ""}
            </p>
            <button
              type="button"
              onClick={() => void runImport()}
              disabled={importing || totalToWrite === 0}
              className={primaryBtn}
            >
              {importing ? "Importing…" : `Import ${totalToWrite} games`}
            </button>
          </div>
        </div>
      ) : null}

      {result && matchedPlans.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {matchedPlans.map((plan) =>
            plan.matchedTeam ? (
              <Link
                key={plan.matchedTeam.id}
                href={teamSetupUrl(plan.matchedTeam.id)}
                className={ghostBtn}
              >
                {plan.matchedTeam.name} →
              </Link>
            ) : null,
          )}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-[11px] leading-snug text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
