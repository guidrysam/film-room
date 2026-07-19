"use client";

import { useAuth } from "@/components/AuthProvider";
import TeamPageShell from "@/components/TeamPageShell";
import TacticsBoardList from "@/components/TacticsBoardList";
import { useParams } from "next/navigation";

export default function TeamTacticsPage() {
  const params = useParams();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-zinc-300">
        Sign in to view tactics boards.
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-rose-200">
        Missing team.
      </div>
    );
  }

  return (
    <TeamPageShell teamId={teamId} currentUid={user.uid} active="tactics">
      {(team) => (
        <TacticsBoardList
          team={team}
          currentUid={user.uid}
          displayName={user.displayName}
        />
      )}
    </TeamPageShell>
  );
}
