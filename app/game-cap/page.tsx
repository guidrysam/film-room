"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import GameSources from "@/components/GameSources";
import { signInWithGoogle } from "@/lib/auth-google";
import { canEditGame, createGame, listMyGames, type Game } from "@/lib/games";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

function roleFor(game: Game, uid: string): string {
  if (game.ownerId === uid) return "owner";
  return game.contributors[uid] ?? "viewer";
}

export default function GameCapPage() {
  const { user, loading } = useAuth();

  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("");
  const [date, setDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshGames = useCallback(async () => {
    if (!user) return;
    setGamesLoading(true);
    try {
      setGames(await listMyGames(user.uid));
    } catch {
      /* best-effort */
    } finally {
      setGamesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshGames();
  }, [refreshGames]);

  const handleCreate = useCallback(async () => {
    if (!user) return;
    if (!title.trim()) {
      setError("Give the game a title.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const id = await createGame(user.uid, {
        title,
        ...(sport.trim() ? { sport } : {}),
        ...(date.trim() ? { date } : {}),
        ...(opponent.trim() ? { awayTeam: opponent } : {}),
      });
      setTitle("");
      setSport("");
      setDate("");
      setOpponent("");
      setShowCreate(false);
      await refreshGames();
      setSelectedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create game.");
    } finally {
      setCreating(false);
    }
  }, [user, title, sport, date, opponent, refreshGames]);

  const selectedGame = games.find((g) => g.id === selectedId) ?? null;

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
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Film Room Sports
          </p>
          <h1 className="mb-3 text-2xl font-semibold tracking-tight text-white">
            Game Cap
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-zinc-300">
            Sign in to create a Game, attach a YouTube source, and open it in
            Film Room.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle().catch(() => {})}
            className="mb-8 w-full rounded-xl border border-white/10 bg-white py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/30 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            Sign in with Google
          </button>
          <Link href="/" className={linkBack}>
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Film Room Sports
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Game Cap
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-300">
            Create or pick a Game, attach a YouTube video as a source, then open
            it in Film Room for review and sync. Camera recording comes later —
            for now, sources are YouTube-backed.
          </p>
        </div>

        {/* Step 1: pick or create a Game */}
        <section className={`${panelClass} mb-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              1 · Choose a Game
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void refreshGames()}
                className={ghostBtn}
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowCreate((s) => !s)}
                className={ghostBtn}
              >
                {showCreate ? "Cancel" : "New Game"}
              </button>
            </div>
          </div>

          {showCreate ? (
            <div className="mb-4 rounded-lg border border-white/[0.08] bg-black/25 p-3">
              <div className="space-y-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (e.g. U14 vs Rangers)"
                  className={inputClass}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    type="text"
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    placeholder="Sport (optional)"
                    className={inputClass}
                  />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                    placeholder="Opponent (optional)"
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                  className={primaryBtn}
                >
                  {creating ? "Creating…" : "Create Game"}
                </button>
              </div>
            </div>
          ) : null}

          {gamesLoading ? (
            <p className="text-sm text-zinc-400">Loading games…</p>
          ) : games.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-zinc-400">
              No games yet. Create one above to get started.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {games.map((g) => {
                const active = g.id === selectedId;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(active ? null : g.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${
                        active
                          ? "border-blue-500/50 bg-blue-950/30"
                          : "border-white/[0.06] bg-zinc-950/50 hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">
                          {g.title}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {[g.sport, g.date, g.awayTeam]
                            .filter(Boolean)
                            .join(" · ") || "Game container"}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                        {roleFor(g, user.uid)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error ? (
            <p className="mt-2 text-xs text-rose-300">{error}</p>
          ) : null}
        </section>

        {/* Step 2: attach source + open */}
        <section className={panelClass}>
          <h2 className="mb-3 text-sm font-semibold text-white">
            2 · Attach a source &amp; open
          </h2>
          {!selectedGame ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-zinc-400">
              Select a Game above to attach a YouTube source.
            </p>
          ) : (
            <div>
              {!canEditGame(selectedGame, user.uid) ? (
                <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-xs leading-snug text-amber-200">
                  You&apos;re a viewer on this Game. Only owners and editors can
                  attach sources — you can still open it in Film Room.
                </p>
              ) : null}
              <GameSources
                game={selectedGame}
                currentUid={user.uid}
                onChanged={() => void refreshGames()}
              />
            </div>
          )}
        </section>

        <Link href="/app" className={`${linkBack} mt-8 inline-block`}>
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
