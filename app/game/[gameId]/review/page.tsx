"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import GameReview from "@/components/GameReview";
import { signInWithGoogle } from "@/lib/auth-google";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm";

function GameReviewPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const gameId = typeof params.gameId === "string" ? params.gameId : "";
  const { user, loading } = useAuth();

  const gameTimeRaw = searchParams.get("gameTime");
  const initialGameTime =
    gameTimeRaw != null && Number.isFinite(Number(gameTimeRaw))
      ? Number(gameTimeRaw)
      : undefined;
  const initialSourceId = searchParams.get("sourceId") ?? undefined;

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
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-3 text-2xl font-semibold text-white">Game Review</h1>
          <p className="mb-8 text-sm text-zinc-300">
            Sign in to review synced sources and coach marks on the game
            timeline.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle().catch(() => {})}
            className="mb-8 w-full rounded-xl border border-white/10 bg-white py-3 text-sm font-semibold text-zinc-950"
          >
            Sign in with Google
          </button>
          <Link href={gameId ? `/game/${gameId}` : "/app"} className={linkBack}>
            ← {gameId ? "Back to Game" : "Back to dashboard"}
          </Link>
        </div>
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
    <div className="min-h-screen px-4 py-6 text-zinc-50">
      <div className="mx-auto max-w-5xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-4 flex items-center gap-2 text-xs text-zinc-500"
        >
          <Link
            href={`/game/${gameId}`}
            className="font-medium text-zinc-400 transition hover:text-zinc-100"
          >
            Game
          </Link>
          <span aria-hidden>/</span>
          <span className="text-zinc-300">Review</span>
        </nav>
        <GameReview
          gameId={gameId}
          currentUid={user.uid}
          currentDisplayName={user.displayName}
          {...(initialGameTime !== undefined ? { initialGameTime } : {})}
          {...(initialSourceId ? { initialSourceId } : {})}
        />
      </div>
    </div>
  );
}

export default function GameReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-zinc-300">
          <p className="text-sm">Loading…</p>
        </div>
      }
    >
      <GameReviewPageInner />
    </Suspense>
  );
}
