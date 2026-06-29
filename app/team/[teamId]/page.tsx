"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import TeamPageShell from "@/components/TeamPageShell";
import TeamGameOverview from "@/components/TeamGameOverview";
import { signInWithGoogle } from "@/lib/auth-google";
import { canCoachTeam, listTeamPlayers, type Player, type Team } from "@/lib/teams";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

function TeamRosterContent({ team, teamId, currentUid }: {
  team: Team;
  teamId: string;
  currentUid: string;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPlayers(await listTeamPlayers(teamId));
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
  <>
    <TeamGameOverview team={team} currentUid={currentUid} />
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Roster
      </p>
    </div>
    <p className="mb-3 text-sm text-zinc-400">
      Open a player profile to see highlights, tagged moments, and linked parents.
    </p>
    <section className={panelClass}>
      {loading ? (
        <p className="text-sm text-zinc-400">Loading roster…</p>
      ) : players.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No players yet.{" "}
          {canCoachTeam(team, currentUid) ? (
            <Link
              href={`/team/${teamId}/setup`}
              className="text-blue-300 hover:underline"
            >
              Import a roster in Team Settings
            </Link>
          ) : (
            "Ask a coach to import the roster."
          )}
          .
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
  </>
  );
}

export default function TeamRosterPage() {
  const params = useParams();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
        <button
          type="button"
          onClick={() => void signInWithGoogle().catch(() => {})}
          className="mb-6 rounded-xl border border-white/10 bg-white px-6 py-3 text-sm font-semibold text-zinc-950"
        >
          Sign in with Google
        </button>
        <Link href="/game-cap" className="text-sm text-zinc-400 hover:text-zinc-100">
          + Add video
        </Link>
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-rose-200">
        Missing team id.
      </div>
    );
  }

  return (
    <TeamPageShell teamId={teamId} currentUid={user.uid} active="roster">
      {(team) => (
        <TeamRosterContent team={team} teamId={teamId} currentUid={user.uid} />
      )}
    </TeamPageShell>
  );
}
