"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle, signOutUser } from "@/lib/auth-google";
import { markRoomHost } from "@/lib/room-host";
import { listMyGames, type Game } from "@/lib/games";
import { listMyTeams, teamRoleFor, type Team } from "@/lib/teams";
import { listMyImportBatches, setImportBatchArchived, type ImportBatch } from "@/lib/import-batches";
import { groupTeamsByImportBatch } from "@/lib/team-batches";
import { myPlayersUrl, playersListUrl, teamRosterUrl } from "@/lib/team-routes";
import { resolveYouTubeVideoIdFromPaste } from "@/lib/resolve-youtube-paste";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-50 placeholder:text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

const RECENT_GAMES_LIMIT = 6;

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [quickReviewError, setQuickReviewError] = useState<string | null>(null);
  const [quickReviewStarting, setQuickReviewStarting] = useState(false);
  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const refreshGames = useCallback(async () => {
    if (!user) return;
    setGamesLoading(true);
    try {
      setGames(await listMyGames(user.uid));
    } catch (error) {
      console.error("[dashboard:games:error]", error);
    } finally {
      setGamesLoading(false);
    }
  }, [user]);

  const refreshTeams = useCallback(async () => {
    if (!user) return;
    setTeamsLoading(true);
    try {
      const [teamRows, batchRows] = await Promise.all([
        listMyTeams(user.uid),
        listMyImportBatches(user.uid),
      ]);
      setTeams(teamRows);
      setBatches(batchRows);
    } catch (error) {
      console.error("[dashboard:teams:error]", error);
    } finally {
      setTeamsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshGames();
  }, [refreshGames]);

  useEffect(() => {
    void refreshTeams();
  }, [refreshTeams]);

  const archivedBatchIds = useMemo(
    () => new Set(batches.filter((b) => b.archived).map((b) => b.id)),
    [batches],
  );

  const teamGroups = useMemo(
    () =>
      groupTeamsByImportBatch(teams, {
        archivedBatchIds,
        showArchived,
      }),
    [teams, archivedBatchIds, showArchived],
  );

  const hasArchivedBatches = archivedBatchIds.size > 0;

  const handleArchiveBatch = useCallback(
    async (batchId: string, archived: boolean) => {
      try {
        await setImportBatchArchived(batchId, archived);
        await refreshTeams();
      } catch (error) {
        console.error("[dashboard:archive-batch:error]", error);
      }
    },
    [refreshTeams],
  );

  const startQuickReview = async () => {
    setQuickReviewError(null);
    setQuickReviewStarting(true);
    try {
      const result = await resolveYouTubeVideoIdFromPaste(url);
      if (!result.ok) {
        setQuickReviewError(result.error);
        return;
      }
      const roomId = Math.random().toString(36).substring(2, 8);
      markRoomHost(roomId);
      router.push(`/room/${roomId}?video=${encodeURIComponent(result.videoId)}`);
    } finally {
      setQuickReviewStarting(false);
    }
  };

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
            Film Room
          </p>
          <h1 className="mb-3 text-2xl font-semibold tracking-tight text-white">
            Dashboard
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-zinc-300">
            Sign in with Google to open your teams, games, and reviews.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle().catch(() => {})}
            className="mb-8 w-full rounded-xl border border-white/10 bg-white py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/30 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]"
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

  const recentGames = games.slice(0, RECENT_GAMES_LIMIT);

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-6">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
              Film Room Sports
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              What do you want to work on today?
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link href={myPlayersUrl()} className={ghostBtn}>
              My kids
            </Link>
            <Link href={playersListUrl()} className={ghostBtn}>
              Your players
            </Link>
            <Link href="/library" className={ghostBtn}>
              Library
            </Link>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className={ghostBtn}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Your teams */}
        <section className={`${panelClass} mb-6`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Your teams
            </p>
            <div className="flex items-center gap-2">
              {hasArchivedBatches ? (
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className="text-xs font-medium text-zinc-400 transition hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm"
                >
                  {showArchived ? "Hide archived" : "Show archived"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void refreshTeams()}
                className="text-xs font-medium text-zinc-400 transition hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm"
              >
                Refresh
              </button>
              <Link href="/team/new" className={ghostBtn}>
                Create team
              </Link>
            </div>
          </div>
          {teamsLoading ? (
            <p className="text-sm text-zinc-400">Loading teams…</p>
          ) : teamGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-zinc-400">
              {showArchived
                ? "No archived events."
                : teams.length === 0
                  ? (
                    <>
                      No teams yet.{" "}
                      <Link href="/team/new" className="text-blue-300 hover:underline">
                        Create a team
                      </Link>{" "}
                      to organize games, roster, and season.
                    </>
                  )
                  : "All events are archived. Use Show archived to view them."}
            </p>
          ) : (
            <div className="space-y-4">
              {teamGroups.map((group) => (
                <div key={group.key}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      {group.label}
                      {group.archived ? (
                        <span className="ml-2 normal-case text-zinc-600">
                          (archived)
                        </span>
                      ) : null}
                    </p>
                    {group.importBatchId && user?.uid ? (
                      <button
                        type="button"
                        onClick={() =>
                          void handleArchiveBatch(
                            group.importBatchId!,
                            !group.archived,
                          )
                        }
                        className="text-[10px] font-medium text-zinc-500 transition hover:text-zinc-300"
                      >
                        {group.archived ? "Restore event" : "Archive event"}
                      </button>
                    ) : null}
                  </div>
                  <ul className="space-y-2">
                    {group.teams.map((t) => {
                      const role = user ? teamRoleFor(t, user.uid) : null;
                      return (
                        <li key={t.id}>
                          <Link
                            href={teamRosterUrl(t.id)}
                            className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2.5 transition hover:border-white/15 hover:bg-white/[0.04]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-white">
                                {t.programName ?? t.name}
                              </span>
                              <span className="block text-xs text-zinc-500">
                                {[t.sport, role].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <span className="shrink-0 text-zinc-500" aria-hidden>
                              →
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent games */}
        <section className={`${panelClass} mb-6`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Recent games
            </p>
            <button
              type="button"
              onClick={() => void refreshGames()}
              className="text-xs font-medium text-zinc-400 transition hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm"
            >
              Refresh
            </button>
          </div>
          {gamesLoading ? (
            <p className="text-sm text-zinc-400">Loading games…</p>
          ) : recentGames.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-zinc-400">
              No games yet. Open a team and add a video to start your first game.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentGames.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/game/${g.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2.5 transition hover:border-white/15 hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">
                        {g.title}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {[g.sport, g.date].filter(Boolean).join(" · ") ||
                          "Game"}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md border border-blue-500/40 bg-blue-950/40 px-2.5 py-1 text-xs font-medium text-blue-100">
                      Open Game
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quick review */}
        <section className={panelClass}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Quick review
          </p>
          <p className="mb-3 text-xs text-zinc-500">
            Paste a YouTube link to start a temporary review — nothing to set up.
          </p>
          <input
            type="text"
            placeholder="Paste YouTube link"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (quickReviewError) setQuickReviewError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !quickReviewStarting) {
                void startQuickReview();
              }
            }}
            className={`${inputClass} mb-2`}
          />
          {quickReviewError ? (
            <p className="mb-3 text-xs text-rose-400">{quickReviewError}</p>
          ) : (
            <div className="mb-3" />
          )}
          <button
            type="button"
            onClick={() => void startQuickReview()}
            disabled={quickReviewStarting || !url.trim()}
            className={`${primaryBtn} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {quickReviewStarting ? "Starting…" : "Start review"}
          </button>
        </section>

        <Link href="/" className={`${linkBack} mt-12 inline-block`}>
          ← Home
        </Link>
      </div>
    </div>
  );
}
