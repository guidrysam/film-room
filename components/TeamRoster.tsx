"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  canViewTeam,
  getTeam,
  listTeamPlayers,
  type Player,
  type Team,
} from "@/lib/teams";

export type TeamRosterProps = {
  teamId: string;
  currentUid: string;
};

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

export default function TeamRoster({ teamId, currentUid }: TeamRosterProps) {
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getTeam(teamId);
      if (!t || !canViewTeam(t, currentUid)) {
        setError("You do not have access to this team roster.");
        setTeam(null);
        setPlayers([]);
        return;
      }
      setTeam(t);
      setPlayers(await listTeamPlayers(teamId));
    } catch {
      setError("Could not load roster.");
    } finally {
      setLoading(false);
    }
  }, [teamId, currentUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className={panelClass}>
        <p className="text-sm text-zinc-400">Loading roster…</p>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className={panelClass}>
        <p className="text-sm text-rose-200">{error ?? "Team not found."}</p>
        <Link href="/game-cap" className={`${ghostBtn} mt-4 inline-block`}>
          ← Game Cap
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Team Roster
          </p>
          <h1 className="text-xl font-semibold text-white">{team.name}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Open a player profile to see highlights, tagged moments, and linked
            parents.
          </p>
        </div>

        <section className={panelClass}>
          {players.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No players yet. Import a roster CSV in Game Cap.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {players.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/team/${teamId}/player/${p.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2 transition hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">
                        {p.name}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {p.parentUids?.length
                          ? `${p.parentUids.length} linked parent${p.parentUids.length === 1 ? "" : "s"}`
                          : "No linked parents"}
                      </span>
                    </span>
                    {p.jerseyNumber ? (
                      <span className="shrink-0 font-mono text-sm text-zinc-400">
                        #{p.jerseyNumber}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link href="/game-cap" className={`${ghostBtn} mt-6 inline-block`}>
          ← Game Cap
        </Link>
      </div>
    </div>
  );
}
