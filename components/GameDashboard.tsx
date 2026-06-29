"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import GameCapUpload from "@/components/GameCapUpload";
import GameSources from "@/components/GameSources";
import { formatTimelineSeconds } from "@/lib/game-timeline";
import { loadGameDashboard, type GameDashboardData } from "@/lib/game-dashboard-load";
import { isPermissionDeniedError } from "@/lib/firestore-errors";
import { topPlayerStatLines } from "@/lib/game-dashboard";
import {
  buildGameStatCsvRows,
  canManageGameStats,
  downloadCsvFile,
  gameStatsToCsv,
  listGameStatsFromEvents,
} from "@/lib/game-stats";
import { gameReviewUrl } from "@/lib/player-profile";
import { canContributeGameSources } from "@/lib/games";
import { canCoachTeam } from "@/lib/teams";
import {
  gameCapUrl,
  teamGamesUrl,
  teamRosterUrl,
  teamSetupUrl,
  teamStatsUrl,
} from "@/lib/team-routes";

export type GameDashboardProps = {
  gameId: string;
  currentUid: string;
  currentDisplayName?: string | null;
};

type SourceMode = "paste" | "upload";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500";

const modeTab =
  "rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const SOURCES_EMPTY_MESSAGE =
  "No video yet. Paste a YouTube link or upload a video to start building this synced game.";

function metricCard(label: string, value: number | string) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-2.5 text-center">
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}

/**
 * Primary Game page — single screen for sources, review, players, highlights, marks.
 */
export default function GameDashboard({
  gameId,
  currentUid,
  currentDisplayName,
}: GameDashboardProps) {
  const [data, setData] = useState<GameDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("paste");
  const [sourcesKey, setSourcesKey] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadGameDashboard(gameId, currentUid);
      if (!loaded) {
        setError("Game not found or access denied.");
        setData(null);
        return;
      }
      setData(loaded);
    } catch (err) {
      console.error("[GameDashboard] load failed", {
        gameId,
        currentUid,
        permissionDenied: isPermissionDeniedError(err),
        err,
      });
      if (isPermissionDeniedError(err)) {
        setError(
          "Could not load this game. Firestore denied read access — check that rules are deployed.",
        );
      } else {
        setError(
          err instanceof Error && err.message.trim()
            ? err.message
            : "Could not load this game.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [gameId, currentUid]);

  const refreshMetrics = useCallback(async () => {
    try {
      const loaded = await loadGameDashboard(gameId, currentUid);
      if (loaded) setData(loaded);
    } catch {
      /* Best-effort metrics refresh after source attach. */
    }
  }, [gameId, currentUid]);

  const handleSourcesChanged = useCallback(() => {
    setSourcesKey((k) => k + 1);
    void refreshMetrics();
  }, [refreshMetrics]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canAttach = useMemo(() => {
    if (!data) return false;
    return canContributeGameSources(data.game, currentUid, data.teamRole);
  }, [data, currentUid]);

  const canManageStats = useMemo(() => {
    if (!data) return false;
    return canManageGameStats(
      data.game,
      currentUid,
      data.team,
    );
  }, [data, currentUid]);

  const topStatLines = useMemo(() => {
    if (!data) return [];
    return topPlayerStatLines(data.events, data.players, 5);
  }, [data]);

  const handleExportStatsCsv = useCallback(() => {
    if (!data) return;
    const stats = listGameStatsFromEvents(data.events);
    const csv = gameStatsToCsv(
      buildGameStatCsvRows({
        game: data.game,
        team: data.team,
        stats,
        players: data.players,
      }),
    );
    const slug = data.game.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadCsvFile(`${slug || "game"}-stats.csv`, csv);
  }, [data]);

  const taggedPlayers = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.taggedPlayerIds);
    return data.players.filter((p) => set.has(p.id));
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        Loading game…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-rose-200">{error ?? "Game not found."}</p>
        <Link href="/app" className={`${ghostBtn} mt-4 inline-block`}>
          ← Dashboard
        </Link>
      </div>
    );
  }

  const { game, team, metrics, highlightDrafts, recentMarks, recentDrafts } =
    data;

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Game
          </p>
          <h1 className="text-xl font-semibold text-white">{game.title}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {[
              game.opponent ?? game.awayTeam,
              game.date,
              team?.name,
              game.sport,
            ]
              .filter(Boolean)
              .join(" · ") || "Film Room game"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/app" className={ghostBtn}>
              ← Dashboard
            </Link>
            {team ? (
              <>
                <Link href={teamRosterUrl(team.id)} className={ghostBtn}>
                  Team roster
                </Link>
                <Link href={teamGamesUrl(team.id)} className={ghostBtn}>
                  Team games
                </Link>
                {canCoachTeam(team, currentUid) ? (
                  <Link href={teamSetupUrl(team.id)} className={ghostBtn}>
                    Team setup
                  </Link>
                ) : null}
              </>
            ) : null}
            <Link
              href={gameCapUrl({ teamId: team?.id, gameId: game.id })}
              className={ghostBtn}
            >
              Game Cap
            </Link>
          </div>
        </div>

        {/* Overview */}
        <section className={`${panelClass} mb-5`}>
          <h2 className="mb-3 text-sm font-semibold text-white">Overview</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {metricCard("Sources", metrics.sourceCount)}
            {metricCard("Synced", metrics.syncedSourceCount)}
            {metricCard("Players", metrics.playerCount)}
            {metricCard("Parents", metrics.parentContributorCount)}
            {metricCard("Marks", metrics.coachMarkCount)}
            {metricCard("Highlights", metrics.highlightDraftCount)}
            {metricCard("Stats", metrics.statCount)}
          </div>
        </section>

        {/* Add video */}
        <section className={`${panelClass} mb-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Add video</h2>
            <Link
              href={gameCapUrl({ teamId: team?.id, gameId: game.id })}
              className={ghostBtn}
            >
              Game Cap
            </Link>
          </div>

          {!canAttach ? (
            <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-xs leading-snug text-amber-200">
              You can view this game but cannot attach sources with your current
              role{data.teamRole ? ` (${data.teamRole})` : ""}.
            </p>
          ) : (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSourceMode("paste")}
                className={`${modeTab} ${
                  sourceMode === "paste"
                    ? "border-blue-500/45 bg-blue-600/25 text-white"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/15 hover:text-zinc-200"
                }`}
              >
                Paste YouTube link
              </button>
              <button
                type="button"
                onClick={() => setSourceMode("upload")}
                className={`${modeTab} ${
                  sourceMode === "upload"
                    ? "border-blue-500/45 bg-blue-600/25 text-white"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/15 hover:text-zinc-200"
                }`}
              >
                Upload to YouTube
              </button>
            </div>
          )}

          {metrics.sourceCount === 0 && canAttach ? (
            <p className="mb-4 text-sm leading-relaxed text-zinc-400">
              {SOURCES_EMPTY_MESSAGE}
            </p>
          ) : null}

          {canAttach && sourceMode === "upload" ? (
            <div className="mb-4">
              <GameCapUpload
                game={game}
                team={team}
                currentUid={currentUid}
                currentDisplayName={currentDisplayName}
                onComplete={handleSourcesChanged}
                onSwitchToPaste={() => setSourceMode("paste")}
              />
            </div>
          ) : null}

          <div className="border-t border-white/[0.06] pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Attached sources
              </h3>
              <Link href={`/game/${game.id}/review`} className={ghostBtn}>
                Review synced game
              </Link>
            </div>

            <GameSources
              key={`${game.id}-${sourcesKey}`}
              game={game}
              currentUid={currentUid}
              teamRole={data.teamRole}
              showHeader={false}
              showPasteForm={canAttach && sourceMode === "paste"}
              pasteFormPlacement="top"
              suppressEmptyState={metrics.sourceCount === 0 && canAttach}
              onChanged={handleSourcesChanged}
            />
          </div>
        </section>

        {/* Review */}
        <section className={`${panelClass} mb-5`}>
          <h2 className="mb-2 text-sm font-semibold text-white">Review</h2>
          <p className="mb-3 text-xs text-zinc-400">
            {metrics.sourceCount === 0
              ? "Add video above, then review synced angles."
              : `${metrics.syncedSourceCount} of ${metrics.sourceCount} source${metrics.sourceCount === 1 ? "" : "s"} synced for multi-angle review.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/game/${game.id}/review`} className={primaryBtn}>
              Review synced game
            </Link>
            <Link href={`/game/${game.id}/reel`} className={ghostBtn}>
              Build highlight reel
            </Link>
          </div>
        </section>

        {/* Stats */}
        <section className={`${panelClass} mb-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Stats</h2>
            <div className="flex flex-wrap gap-2">
              <Link href={`/game/${game.id}/review`} className={ghostBtn}>
                Log stats in review
              </Link>
              {team ? (
                <Link href={teamStatsUrl(team.id)} className={ghostBtn}>
                  View season stats
                </Link>
              ) : null}
              {canManageStats && metrics.statCount > 0 ? (
                <button
                  type="button"
                  onClick={handleExportStatsCsv}
                  className={ghostBtn}
                >
                  Export CSV
                </button>
              ) : null}
            </div>
          </div>
          {metrics.statCount === 0 ? (
            <p className="text-sm text-zinc-400">
              No stats logged yet. Open review and add goals, assists, and more
              at game time.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {topStatLines.map((line) => (
                <li
                  key={line.playerName}
                  className="rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-zinc-200">
                    {line.playerName}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {line.line}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Players */}
        <section className={`${panelClass} mb-5`}>
          <h2 className="mb-3 text-sm font-semibold text-white">Players</h2>
          {!team ? (
            <p className="text-sm text-zinc-400">
              Link this game to a team to see roster players.
            </p>
          ) : data.players.length === 0 ? (
            <p className="text-sm text-zinc-400">Import a roster.</p>
          ) : (
            <>
              {taggedPlayers.length > 0 ? (
                <p className="mb-2 text-[11px] text-zinc-500">
                  Tagged in this game: {taggedPlayers.map((p) => p.name).join(", ")}
                </p>
              ) : null}
              <ul className="space-y-1.5">
                {data.players.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/team/${team.id}/player/${p.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2 transition hover:bg-white/[0.04]"
                    >
                      <span className="text-sm text-zinc-200">{p.name}</span>
                      {p.jerseyNumber ? (
                        <span className="font-mono text-xs text-zinc-500">
                          #{p.jerseyNumber}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
              {data.players.length > 8 ? (
                <Link
                  href={`/team/${team.id}`}
                  className={`${ghostBtn} mt-2 inline-block`}
                >
                  View full roster
                </Link>
              ) : null}
            </>
          )}
        </section>

        {/* Highlights */}
        <section className={`${panelClass} mb-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Highlights</h2>
            <Link href={`/game/${game.id}/review`} className={ghostBtn}>
              Create in review
            </Link>
          </div>
          {highlightDrafts.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Create highlights from review.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentDrafts.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-zinc-200">
                      {d.name}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {d.moments.length}{" "}
                      {d.moments.length === 1 ? "moment" : "moments"}
                    </span>
                  </span>
                  <Link
                    href={`/game/${game.id}/review`}
                    className={ghostBtn}
                  >
                    Open draft
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Coach Marks */}
        <section className={panelClass}>
          <h2 className="mb-3 text-sm font-semibold text-white">Coach Marks</h2>
          {recentMarks.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No coach marks yet. Add marks in Film Room or review.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentMarks.map((ev) => (
                <li key={ev.id}>
                  <Link
                    href={gameReviewUrl(game.id, ev.t, ev.sourceId)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2 transition hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 truncate text-sm text-zinc-200">
                      {ev.label ?? "Coach mark"}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-500">
                      {formatTimelineSeconds(ev.t)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {metrics.coachMarkCount > 0 ? (
            <Link
              href={`/game/${game.id}/review`}
              className={`${ghostBtn} mt-3 inline-block`}
            >
              Jump to review
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}
