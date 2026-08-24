"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import TeamNav from "@/components/TeamNav";
import TacticsBoardEditor from "@/components/TacticsBoardEditor";
import {
  canEditTacticsBoard,
  canViewTacticsBoard,
  getTacticsBoard,
  type TacticsBoard,
} from "@/lib/tactics-boards";
import { canCoachTeam, canViewTeam, fetchTeamClubContext, getTeam, type Team } from "@/lib/teams";
import { teamTacticsUrl } from "@/lib/team-routes";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

function BoardEditorShell({
  team,
  board,
  uid,
  displayName,
}: {
  team: Team;
  board: TacticsBoard;
  uid: string;
  displayName?: string | null;
}) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-zinc-400">Loading editor…</p>
      }
    >
      <TacticsBoardEditor
        team={team}
        board={board}
        currentUid={uid}
        displayName={displayName}
      />
    </Suspense>
  );
}

export default function TeamTacticsBoardPage() {
  const params = useParams();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const boardId = typeof params.boardId === "string" ? params.boardId : "";
  const { user, loading: authLoading } = useAuth();

  const [team, setTeam] = useState<Team | null>(null);
  const [board, setBoard] = useState<TacticsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !teamId || !boardId) return;
    setLoading(true);
    setError(null);
    try {
      const t = await getTeam(teamId);
      const club = t ? await fetchTeamClubContext(t) : null;
      if (!t || !canViewTeam(t, user.uid, club)) {
        setError("You do not have access to this team.");
        setTeam(null);
        setBoard(null);
        return;
      }
      if (!canCoachTeam(t, user.uid, club)) {
        setError("Only coaches can open tactics boards from the team library.");
        setTeam(t);
        setBoard(null);
        return;
      }
      const b = await getTacticsBoard(teamId, boardId);
      if (!b || !canViewTacticsBoard(b, t, user.uid)) {
        setError("Board not found.");
        setTeam(t);
        setBoard(null);
        return;
      }
      setTeam(t);
      setBoard(b);
    } catch {
      setError("Could not load this board.");
    } finally {
      setLoading(false);
    }
  }, [user, teamId, boardId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Loading board…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-zinc-300">
        Sign in to open this tactics board.
      </div>
    );
  }

  if (error || !team || !board) {
    return (
      <div className="min-h-screen px-4 py-16 text-zinc-50">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-sm text-rose-200">{error ?? "Board not found."}</p>
          <Link href={teamId ? teamTacticsUrl(teamId) : "/app"} className={`${ghostBtn} mt-4 inline-flex`}>
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 text-zinc-50">
      <div className="mx-auto max-w-5xl">
        <TeamNav team={team} currentUid={user.uid} active="tactics" />
        <BoardEditorShell
          team={team}
          board={board}
          uid={user.uid}
          displayName={user.displayName}
        />
        {!canEditTacticsBoard(board, team, user.uid) ? (
          <p className="mt-3 text-center text-[11px] text-zinc-500">
            View only
          </p>
        ) : null}
      </div>
    </div>
  );
}
