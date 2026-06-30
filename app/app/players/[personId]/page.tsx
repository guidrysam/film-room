"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import PersonProfileView from "@/components/PersonProfileView";
import { signInWithGoogle } from "@/lib/auth-google";
import { playersListUrl } from "@/lib/team-routes";

export default function PersonProfilePage() {
  const params = useParams();
  const personId = typeof params.personId === "string" ? params.personId : "";
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
        <Link href={playersListUrl()} className="text-sm text-zinc-400 hover:text-zinc-100">
          Your players
        </Link>
      </div>
    );
  }

  if (!personId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-rose-200">
        Missing player id.
      </div>
    );
  }

  return (
    <PersonProfileView personId={personId} currentUid={user.uid} />
  );
}
