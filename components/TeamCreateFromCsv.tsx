"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import RosterCsvImportPanel, {
  useRosterCsvImportPreview,
} from "@/components/RosterCsvImportPanel";
import type { ParsedRosterCsvBundle } from "@/lib/roster-csv-parse";
import {
  classifyTeamSync,
  groupPreviewRowsByTeam,
  importClubRoster,
  type ClubImportResult,
  type TeamSyncClassification,
} from "@/lib/roster-club-import";
import { createImportBatch, formatEventTeamName } from "@/lib/import-batches";
import type {
  RosterImportPreviewRow,
  RosterImportPreviewSummary,
} from "@/lib/roster-import";
import { teamSetupUrl } from "@/lib/team-routes";

export type TeamCreateFromCsvProps = {
  uid: string;
};

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "inline-flex items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

function SyncCounts({
  label,
  counts,
}: {
  label: string;
  counts: { new: number; updated: number; unchanged: number };
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-14 shrink-0 text-zinc-400">{label}</span>
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

export default function TeamCreateFromCsv({ uid }: TeamCreateFromCsvProps) {
  const { preview, bundle, onPreviewChange: syncPreview } =
    useRosterCsvImportPreview();
  const [nameOverrides, setNameOverrides] = useState<Record<number, string>>({});
  const [fallbackName, setFallbackName] = useState("");
  const [eventLabel, setEventLabel] = useState("");
  const [sport, setSport] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClubImportResult | null>(null);

  const onPreviewChange = useCallback(
    (
      nextPreview: RosterImportPreviewRow[] | null,
      nextSummary: RosterImportPreviewSummary | null,
      nextBundle: ParsedRosterCsvBundle | null,
    ) => {
      syncPreview(nextPreview, nextSummary, nextBundle);
      setNameOverrides({});
      setResult(null);
      setError(null);
    },
    [syncPreview],
  );

  const baseGroups = useMemo(
    () => (preview ? groupPreviewRowsByTeam(preview, fallbackName) : []),
    [preview, fallbackName],
  );

  const hasUnassigned = useMemo(
    () => baseGroups.some((group) => group.sourceTeamName === ""),
    [baseGroups],
  );

  const groups = useMemo(
    () =>
      baseGroups.map((group, index) => {
        const programName = nameOverrides[index] ?? group.teamName;
        const displayName = eventLabel.trim()
          ? formatEventTeamName(programName, eventLabel.trim())
          : programName;
        return {
          ...group,
          programName,
          teamName: displayName,
        };
      }),
    [baseGroups, nameOverrides, eventLabel],
  );

  const plan = useMemo(
    () =>
      groups.map((group) => {
        const sync: TeamSyncClassification = classifyTeamSync(
          group.rows,
          [],
          [],
        );
        return {
          ...group,
          matchesExistingTeam: false,
          loadingExisting: false,
          sync,
        };
      }),
    [groups],
  );

  const importableTeams = useMemo(
    () =>
      plan.filter(
        (item) =>
          item.sync.players.new +
            item.sync.players.updated +
            item.sync.players.unchanged >
          0,
      ),
    [plan],
  );

  const totalPlayers = useMemo(
    () =>
      importableTeams.reduce(
        (sum, item) =>
          sum +
          item.sync.players.new +
          item.sync.players.updated +
          item.sync.players.unchanged,
        0,
      ),
    [importableTeams],
  );

  const everyTeamNamed = useMemo(
    () => importableTeams.every((item) => item.programName.trim().length > 0),
    [importableTeams],
  );

  const handleImport = useCallback(async () => {
    if (importableTeams.length === 0) return;
    if (!eventLabel.trim()) {
      setError("Name this event or season (e.g. Fall 2026, Labor Day Cup).");
      return;
    }
    if (!everyTeamNamed) {
      setError("Give every team a program name before importing.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const batchId = await createImportBatch(uid, {
        label: eventLabel.trim(),
        ...(sport.trim() ? { sport: sport.trim() } : {}),
      });
      const clubResult = await importClubRoster(
        uid,
        importableTeams.map((item) => ({
          teamName: item.programName.trim(),
          rows: item.rows,
          ...(sport.trim() ? { sport: sport.trim() } : {}),
        })),
        {
          mode: "new_event",
          importBatchId: batchId,
          importBatchLabel: eventLabel.trim(),
          linkPersons: true,
        },
      );
      setResult(clubResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import roster.");
    } finally {
      setImporting(false);
    }
  }, [uid, importableTeams, everyTeamNamed, eventLabel, sport]);

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-5">
          <p className="text-sm font-semibold text-emerald-100">
            Roster import complete
          </p>
          <p className="mt-1 text-xs text-emerald-200/90">
            {result.teamsCreated} new team{result.teamsCreated === 1 ? "" : "s"}{" "}
            for this event · {result.playersCreated} player
            {result.playersCreated === 1 ? "" : "s"} added
          </p>
          <p className="mt-1 text-xs text-emerald-200/90">
            {result.parentsCreated} parent contact
            {result.parentsCreated === 1 ? "" : "s"} added · players linked to
            your club roster for cross-event stats
          </p>
          <p className="mt-2 text-[11px] text-zinc-400">
            Each import creates a fresh set of event-specific teams. Re-upload
            the same CSV into the same event to update roster rows — nothing is
            removed automatically.
          </p>
        </div>

        <ul className="space-y-2">
          {result.teams.map((team) => (
            <li
              key={team.teamId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-zinc-950/45 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {team.teamName}
                  <span
                    className={`ml-2 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase border-emerald-500/40 bg-emerald-950/35 text-emerald-200`}
                  >
                    new for event
                  </span>
                </p>
                <p className="text-[11px] text-zinc-400">
                  Players +{team.playersCreated} ~{team.playersUpdated} ={" "}
                  {team.playersUnchanged} · Parents +{team.parentsCreated} ~
                  {team.parentsUpdated} ={team.parentsUnchanged}
                </p>
              </div>
              <Link href={teamSetupUrl(team.teamId)} className={ghostBtn}>
                Open team setup
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-400">
        Upload a TeamLinkt roster export for a{" "}
        <span className="font-medium text-zinc-200">new event or season</span>.
        Film Room creates a fresh team for each program in the CSV — past
        tournaments and seasons stay separate. Players are linked by name so
        stats can follow them across events.
      </p>

      <RosterCsvImportPanel
        existingPlayers={[]}
        onPreviewChange={onPreviewChange}
        compact
      />

      {bundle && plan.length > 0 ? (
        <div className="mt-4 space-y-3 rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white">
              Review before import
            </p>
            <p className="text-[11px] text-zinc-400">
              {plan.length} team{plan.length === 1 ? "" : "s"} · {totalPlayers}{" "}
              player{totalPlayers === 1 ? "" : "s"}
            </p>
          </div>

          {hasUnassigned ? (
            <label className="block text-[11px] text-zinc-400">
              Team name for rows without a Team Name
              <input
                type="text"
                value={fallbackName}
                onChange={(e) => setFallbackName(e.target.value)}
                placeholder="Unassigned"
                className={`${inputClass} mt-1`}
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-zinc-400">
              Event or season name <span className="text-rose-300">*</span>
            </span>
            <input
              type="text"
              value={eventLabel}
              onChange={(e) => setEventLabel(e.target.value)}
              placeholder="e.g. Fall 2026, Labor Day Cup"
              className={inputClass}
            />
            <span className="mt-1 block text-[10px] text-zinc-500">
              Teams are named “Program · Event” (e.g. CMFC U12 Girls · Fall 2026).
            </span>
          </label>

          <ul className="space-y-2">
            {plan.map((item, index) => (
              <li
                key={`${item.sourceTeamName}-${index}`}
                className="space-y-2 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-950/35 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-200">
                    new team
                  </span>
                </div>

                <label className="block text-[10px] text-zinc-500">
                  Program name (from CSV)
                  <input
                    type="text"
                    value={item.programName}
                    onChange={(e) =>
                      setNameOverrides((prev) => ({
                        ...prev,
                        [index]: e.target.value,
                      }))
                    }
                    placeholder="Team name"
                    className={`${inputClass} mt-1`}
                  />
                </label>

                {eventLabel.trim() ? (
                  <p className="text-[10px] text-zinc-500">
                    Will import as:{" "}
                    <span className="font-medium text-zinc-300">
                      {item.teamName}
                    </span>
                  </p>
                ) : null}

                <div className="space-y-1.5">
                  <SyncCounts label="Players" counts={item.sync.players} />
                  <SyncCounts label="Parents" counts={item.sync.parents} />
                </div>
              </li>
            ))}
          </ul>

          <input
            type="text"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            placeholder="Sport (optional)"
            className={inputClass}
          />

          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={
              importing ||
              importableTeams.length === 0 ||
              !everyTeamNamed ||
              !eventLabel.trim()
            }
            className={`${primaryBtn} w-full`}
          >
            {importing
              ? "Importing roster…"
              : importableTeams.length === 1
                ? "Create event & import 1 team"
                : `Create event & import ${importableTeams.length} teams`}
          </button>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
