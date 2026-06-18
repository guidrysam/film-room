"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import GameDashboard from "@/components/GameDashboard";
import { signInWithGoogle } from "@/lib/auth-google";

export default function GamePage() {
  const params = useParams();
  const gameId = typeof params.gameId === "string" ? params.gameId : "";
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
        <Link href="/app" className="text-sm text-zinc-400 hover:text-zinc-100">
          ← Dashboard
        </Link>
      </div>
    );
  }

  if (!gameId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-rose-200">
        Missing game id.
      </div>
    );
  }

  return (
    <GameDashboard
      gameId={gameId}
      currentUid={user.uid}
      currentDisplayName={user.displayName}
    />
  );
}
