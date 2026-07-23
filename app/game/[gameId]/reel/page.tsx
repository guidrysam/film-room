"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import HighlightReelStudio from "@/components/HighlightReelStudio";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  getGame,
  listGameEvents,
  listGameSources,
  type Game,
  type GameTimelineEvent,
  type GameVideoSource,
} from "@/lib/games";

export default function GameReelPage() {
  const params = useParams();
  const gameId = typeof params.gameId === "string" ? params.gameId : "";
  const { user, loading } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [sources, setSources] = useState<GameVideoSource[]>([]);
  const [events, setEvents] = useState<GameTimelineEvent[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!gameId) return;
    setDataLoading(true);
    setError(null);
    try {
      const [g, srcs, evs] = await Promise.all([
        getGame(gameId),
        listGameSources(gameId),
        listGameEvents(gameId),
      ]);
      if (!g) {
        setError("Game not found.");
        return;
      }
      setGame(g);
      setSources(srcs);
      setEvents(evs);
    } catch {
      setError("Could not load this game.");
    } finally {
      setDataLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 text-zinc-50">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <Link
            href={`/game/${gameId}`}
            className="text-xs text-zinc-400 transition hover:text-zinc-100"
          >
            ← Back to game
          </Link>
          <h1 className="mt-1 text-lg font-semibold">
            {game ? `${game.title} · Highlight reel` : "Highlight reel"}
          </h1>
        </div>
      </div>

      {dataLoading ? (
        <p className="text-sm text-zinc-400">Loading game…</p>
      ) : error ? (
        <p className="text-sm text-rose-200">{error}</p>
      ) : game ? (
        <HighlightReelStudio
          gameId={gameId}
          game={game}
          sources={sources}
          events={events}
          currentUid={user.uid}
          currentDisplayName={user.displayName}
        />
      ) : null}
    </div>
  );
}
