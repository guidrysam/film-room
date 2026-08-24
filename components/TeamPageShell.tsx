"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import TeamNav, { type TeamNavTab } from "@/components/TeamNav";
import {
  canViewTeam,
  fetchTeamClubContext,
  getTeam,
  type Team,
  type TeamClubContext,
} from "@/lib/teams";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

export type TeamPageShellProps = {
  teamId: string;
  currentUid: string;
  active: TeamNavTab;
  children: (team: Team, club: TeamClubContext | null) => ReactNode;
};

export default function TeamPageShell({
  teamId,
  currentUid,
  active,
  children,
}: TeamPageShellProps) {
  const [team, setTeam] = useState<Team | null>(null);
  const [club, setClub] = useState<TeamClubContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getTeam(teamId);
      if (!t) {
        setError("You do not have access to this team.");
        setTeam(null);
        setClub(null);
        return;
      }
      const clubCtx = await fetchTeamClubContext(t);
      if (!canViewTeam(t, currentUid, clubCtx)) {
        setError("You do not have access to this team.");
        setTeam(null);
        setClub(null);
        return;
      }
      setTeam(t);
      setClub(clubCtx);
    } catch {
      setError("Could not load this team.");
      setTeam(null);
      setClub(null);
    } finally {
      setLoading(false);
    }
  }, [teamId, currentUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        Loading team…
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-rose-200">{error ?? "Team not found."}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/app" className={ghostBtn}>
            ← Dashboard
          </Link>
          <Link href="/game-cap" className={ghostBtn}>
            Add video
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-2xl">
        <TeamNav
          team={team}
          currentUid={currentUid}
          active={active}
          club={club}
        />
        {children(team, club)}
      </div>
    </div>
  );
}
