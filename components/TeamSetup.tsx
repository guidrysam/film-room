"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  canCoachTeam,
  createTeam,
  listMyTeams,
  teamRoleFor,
  type Team,
} from "@/lib/teams";
import { teamRosterUrl, teamSetupUrl } from "@/lib/team-routes";

export type TeamSetupProps = {
  currentUid: string;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  onTeamsChanged?: () => void;
};

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const ROLE_BADGE: Record<string, string> = {
  admin: "border-violet-500/45 bg-violet-950/45 text-violet-200",
  coach: "border-emerald-600/45 bg-emerald-950/45 text-emerald-200",
  parent: "border-amber-500/40 bg-amber-950/40 text-amber-200",
  player: "border-blue-500/40 bg-blue-950/40 text-blue-200",
  viewer: "border-zinc-600/50 bg-zinc-800/50 text-zinc-300",
};

/**
 * Team picker: create a team, list the user's teams, select one, show role.
 */
export default function TeamSetup({
  currentUid,
  selectedTeamId,
  onSelectTeam,
  onTeamsChanged,
}: TeamSetupProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMyTeams(currentUid);
      setTeams(rows);
      if (rows.length === 1 && !selectedTeamId) {
        onSelectTeam(rows[0]!.id);
      }
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }, [currentUid, selectedTeamId, onSelectTeam]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setError("Give the team a name.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const id = await createTeam(currentUid, {
        name,
        ...(sport.trim() ? { sport } : {}),
      });
      setName("");
      setSport("");
      setShowCreate(false);
      await refresh();
      onSelectTeam(id);
      onTeamsChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create team.");
    } finally {
      setCreating(false);
    }
  }, [currentUid, name, sport, refresh, onSelectTeam, onTeamsChanged]);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const myRole = selectedTeam ? teamRoleFor(selectedTeam, currentUid) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Team</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refresh()} className={ghostBtn}>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className={ghostBtn}
          >
            {showCreate ? "Cancel" : "New Team"}
          </button>
        </div>
      </div>

      {showCreate ? (
        <div className="mb-4 rounded-lg border border-white/[0.08] bg-black/25 p-3">
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name (e.g. U14 Central Michigan)"
              className={inputClass}
            />
            <input
              type="text"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              placeholder="Sport (optional)"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className={primaryBtn}
            >
              {creating ? "Creating…" : "Create Team"}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-400">Loading teams…</p>
      ) : teams.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-zinc-400">
          No teams yet. Create one above to organize team games and video.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {teams.map((t) => {
            const active = t.id === selectedTeamId;
            const role = teamRoleFor(t, currentUid);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelectTeam(active ? null : t.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${
                    active
                      ? "border-blue-500/50 bg-blue-950/30"
                      : "border-white/[0.06] bg-zinc-950/50 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">
                      {t.name}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {t.sport || "Team"}
                    </span>
                  </span>
                  {role ? (
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${ROLE_BADGE[role] ?? ROLE_BADGE.viewer}`}
                    >
                      {role}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedTeam && myRole ? (
        <p className="mt-3 text-xs text-zinc-400">
          Your role on <span className="text-zinc-200">{selectedTeam.name}</span>:{" "}
          <span
            className={`inline rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_BADGE[myRole] ?? ROLE_BADGE.viewer}`}
          >
            {myRole}
          </span>
        </p>
      ) : null}

      {selectedTeam ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={teamRosterUrl(selectedTeam.id)} className={ghostBtn}>
            Team roster →
          </Link>
          {canCoachTeam(selectedTeam, currentUid) ? (
            <Link href={teamSetupUrl(selectedTeam.id)} className={ghostBtn}>
              Team Setup →
            </Link>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
