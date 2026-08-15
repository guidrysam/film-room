"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  canViewGame,
  fetchGameEvents,
  fetchGameSources,
  getGame,
} from "@/lib/games";
import { seedTeamFilmRoom } from "@/lib/team-film-room";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm";

function TeamFilmRoomPageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const gameId = typeof params.gameId === "string" ? params.gameId : "";
  const asViewer = searchParams.get("viewer") === "1";
  const reelId = searchParams.get("reel") ?? undefined;
  const { user, loading } = useAuth();

  const [error, setError] = useState<string | null>(null);

  const openRoom = useCallback(async () => {
    if (!user || !gameId) return;
    setError(null);
    try {
      const game = await getGame(gameId, { uid: user.uid });
      if (!game) {
        setError("Game not found.");
        return;
      }
      if (!canViewGame(game, user.uid)) {
        setError("You do not have access to this game.");
        return;
      }
      const [sources, events] = await Promise.all([
        fetchGameSources(gameId, game, user.uid),
        fetchGameEvents(gameId, game, user.uid),
      ]);
      const { url } = await seedTeamFilmRoom({
        gameId,
        sources,
        events,
        uid: user.uid,
        asViewer,
        reelId,
      });
      router.replace(url);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not open Watch together for this game.",
      );
    }
  }, [user, gameId, asViewer, reelId, router]);

  useEffect(() => {
    if (user && gameId) void openRoom();
  }, [user, gameId, openRoom]);

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
          <h1 className="mb-3 text-2xl font-semibold text-white">Watch together</h1>
          <p className="mb-8 text-sm text-zinc-300">
            Sign in to share a synced viewer link for this game&apos;s angles
            and marks.
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
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
      {error ? (
        <div className="max-w-md text-center">
          <p className="text-sm text-rose-200">{error}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void openRoom()}
              className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200"
            >
              Try again
            </button>
            <Link href={`/game/${gameId}`} className={linkBack}>
              ← Back to Game
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">Opening Watch together…</p>
      )}
    </div>
  );
}

export default function TeamFilmRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-zinc-300">
          <p className="text-sm">Loading…</p>
        </div>
      }
    >
      <TeamFilmRoomPageInner />
    </Suspense>
  );
}
