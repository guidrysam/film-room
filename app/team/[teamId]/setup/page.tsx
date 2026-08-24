"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import TeamAdminSetup from "@/components/TeamAdminSetup";
import TeamPageShell from "@/components/TeamPageShell";
import { signInWithGoogle } from "@/lib/auth-google";
import { canCoachTeam } from "@/lib/teams";

export default function TeamSetupPage() {
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
    <TeamPageShell teamId={teamId} currentUid={user.uid} active="setup">
      {(team, club) => (
        <>
          <p className="mb-5 text-sm text-zinc-400">
            {canCoachTeam(team, user.uid, club)
              ? "Import your TeamLinkt roster first, then invite parents to upload video and build highlights."
              : "Coaches and admins manage roster import and invites here."}
          </p>
          <TeamAdminSetup team={team} currentUid={user.uid} club={club} />
        </>
      )}
    </TeamPageShell>
  );
}
