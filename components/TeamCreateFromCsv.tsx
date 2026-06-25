"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RosterCsvImportPanel, {
  useRosterCsvImportPreview,
} from "@/components/RosterCsvImportPanel";
import type { ParsedRosterCsvBundle } from "@/lib/roster-csv-parse";
import {
  classifyTeamSync,
  groupPreviewRowsByTeam,
  importClubRoster,
  loadTeamRosterData,
  type ClubImportResult,
  type TeamSyncClassification,
} from "@/lib/roster-club-import";
import type {
  RosterImportPreviewRow,
  RosterImportPreviewSummary,
} from "@/lib/roster-import";
import type { ParentInviteTarget } from "@/lib/parent-invite-targets";
import { findTeamByName, listMyTeams, type Player, type Team } from "@/lib/teams";
import { teamSetupUrl } from "@/lib/team-routes";

export type TeamCreateFromCsvProps = {
  uid: string;
};

type TeamRosterData = { players: Player[]; parents: ParentInviteTarget[] };

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
  const [existingTeams, setExistingTeams] = useState<Team[]>([]);
  const [teamData, setTeamData] = useState<Record<string, TeamRosterData>>({});
  const requestedTeamIds = useRef<Set<string>>(new Set());
  const [nameOverrides, setNameOverrides] = useState<Record<number, string>>({});
  const [fallbackName, setFallbackName] = useState("");
  const [sport, setSport] = useState("");
  const [season, setSeason] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClubImportResult | null>(null);

  useEffect(() => {
    let active = true;
    listMyTeams(uid)
      .then((teams) => {
        if (active) setExistingTeams(teams);
      })
      .catch(() => {
        // Matching against existing teams is best-effort; the import re-checks.
      });
    return () => {
      active = false;
    };
  }, [uid]);

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
      baseGroups.map((group, index) => ({
        ...group,
        teamName: nameOverrides[index] ?? group.teamName,
      })),
    [baseGroups, nameOverrides],
  );

  const plan = useMemo(
    () =>
      groups.map((group) => {
        const existing = findTeamByName(existingTeams, group.teamName);
        const data = existing ? teamData[existing.id] : undefined;
        const sync: TeamSyncClassification = classifyTeamSync(
          group.rows,
          data?.players ?? [],
          data?.parents ?? [],
        );
        return {
          ...group,
          matchesExistingTeam: Boolean(existing),
          existingTeamId: existing?.id,
          loadingExisting: Boolean(existing) && !data,
          sync,
        };
      }),
    [groups, existingTeams, teamData],
  );

  // Lazily fetch existing rosters for any matched team so the preview can show
  // accurate new/updated/unchanged counts.
  useEffect(() => {
    for (const item of plan) {
      const teamId = item.existingTeamId;
      if (!teamId || requestedTeamIds.current.has(teamId)) continue;
      requestedTeamIds.current.add(teamId);
      loadTeamRosterData(teamId)
        .then((data) => setTeamData((prev) => ({ ...prev, [teamId]: data })))
        .catch(() => {
          requestedTeamIds.current.delete(teamId);
        });
    }
  }, [plan]);

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
    () => importableTeams.every((item) => item.teamName.trim().length > 0),
    [importableTeams],
  );

  const handleImport = useCallback(async () => {
    if (importableTeams.length === 0) return;
    if (!everyTeamNamed) {
      setError("Give every team a name before importing.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const clubResult = await importClubRoster(
        uid,
        importableTeams.map((item) => ({
          teamName: item.teamName.trim(),
          rows: item.rows,
          ...(sport.trim() ? { sport: sport.trim() } : {}),
          ...(season.trim() ? { season: season.trim() } : {}),
        })),
      );
      setResult(clubResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import roster.");
    } finally {
      setImporting(false);
    }
  }, [uid, importableTeams, everyTeamNamed, sport, season]);

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-5">
          <p className="text-sm font-semibold text-emerald-100">
            Roster import complete
          </p>
          <p className="mt-1 text-xs text-emerald-200/90">
            {result.teamsCreated} team{result.teamsCreated === 1 ? "" : "s"} created
            {" · "}
            {result.teamsUpdated} updated · {result.playersCreated} player
            {result.playersCreated === 1 ? "" : "s"} added ·{" "}
            {result.playersUpdated} updated · {result.playersUnchanged} unchanged
          </p>
          <p className="mt-1 text-xs text-emerald-200/90">
            {result.parentsCreated} parent contact
            {result.parentsCreated === 1 ? "" : "s"} added ·{" "}
            {result.parentsUpdated} updated · {result.parentsUnchanged} unchanged
          </p>
          <p className="mt-2 text-[11px] text-zinc-400">
            Imports are additive: existing players, parents, games, stats, and
            highlights are preserved. Remove roster members manually from each
            team when needed.
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
                    className={`ml-2 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                      team.teamCreated
                        ? "border-emerald-500/40 bg-emerald-950/35 text-emerald-200"
                        : "border-amber-500/40 bg-amber-950/35 text-amber-200"
                    }`}
                  >
                    {team.teamCreated ? "created" : "updated"}
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
        Upload a TeamLinkt roster export. Players are grouped by their{" "}
        <span className="font-medium text-zinc-200">Team Name</span>. Re-uploading
        an updated export is safe — it creates and updates records but never
        removes players or parents.
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

          <ul className="space-y-2">
            {plan.map((item, index) => (
              <li
                key={`${item.sourceTeamName}-${index}`}
                className="space-y-2 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                      item.matchesExistingTeam
                        ? "border-amber-500/40 bg-amber-950/35 text-amber-200"
                        : "border-emerald-500/40 bg-emerald-950/35 text-emerald-200"
                    }`}
                  >
                    {item.matchesExistingTeam ? "update existing" : "new team"}
                  </span>
                  {item.loadingExisting ? (
                    <span className="text-[10px] text-zinc-500">
                      Checking existing roster…
                    </span>
                  ) : null}
                </div>

                <input
                  type="text"
                  value={item.teamName}
                  onChange={(e) =>
                    setNameOverrides((prev) => ({
                      ...prev,
                      [index]: e.target.value,
                    }))
                  }
                  placeholder="Team name"
                  className={inputClass}
                />

                <div className="space-y-1.5">
                  <SyncCounts label="Players" counts={item.sync.players} />
                  <SyncCounts label="Parents" counts={item.sync.parents} />
                </div>

                {item.sync.missingPlayers.length > 0 ? (
                  <p className="rounded-md border border-sky-500/25 bg-sky-950/20 px-2 py-1.5 text-[10px] leading-snug text-sky-200">
                    {item.sync.missingPlayers.length} player
                    {item.sync.missingPlayers.length === 1 ? "" : "s"} currently
                    exist in Film Room but were not found in this import. No
                    automatic action is taken — remove them manually if needed.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              placeholder="Sport (optional, new teams)"
              className={inputClass}
            />
            <input
              type="text"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="Season (optional, new teams)"
              className={inputClass}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={importing || importableTeams.length === 0 || !everyTeamNamed}
            className={`${primaryBtn} w-full`}
          >
            {importing
              ? "Importing roster…"
              : importableTeams.length === 1
                ? "Create / update 1 team and import"
                : `Create / update ${importableTeams.length} teams and import`}
          </button>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
