"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import TeamGames from "@/components/TeamGames";
import TeamPageShell from "@/components/TeamPageShell";
import { signInWithGoogle } from "@/lib/auth-google";

export default function TeamGamesPage() {
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
          ← Game Cap
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
    <TeamPageShell teamId={teamId} currentUid={user.uid} active="games">
      {(team) => (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-400">
              Open a game hub or attach video in Game Cap.
            </p>
            <Link
              href="/schedule-import"
              className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              Import schedule CSV
            </Link>
          </div>
          <TeamGames team={team} currentUid={user.uid} />
        </>
      )}
    </TeamPageShell>
  );
}
