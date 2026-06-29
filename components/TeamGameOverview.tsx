"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canCoachTeam, listTeamGames, type Team } from "@/lib/teams";
import type { Game } from "@/lib/games";
import { gameCapUrl } from "@/lib/team-routes";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500";

const RECENT_LIMIT = 4;

function gameTimestamp(g: Game): number {
  const raw = g.scheduledStartAt || g.date || "";
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

function gameOpponentLine(g: Game): string {
  const opp = g.opponent ?? g.awayTeam;
  return opp ? `vs ${opp}` : g.title;
}

function gameMetaLine(g: Game): string {
  return [g.date || g.scheduledStartAt, g.location].filter(Boolean).join(" · ");
}

export type TeamGameOverviewProps = {
  team: Team;
  currentUid: string;
};

export default function TeamGameOverview({
  team,
  currentUid,
}: TeamGameOverviewProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setGames(await listTeamGames(currentUid, team.id));
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [currentUid, team.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isCoach = canCoachTeam(team, currentUid);

  const { upcoming, recent } = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const dayStart = startOfToday.getTime();

    const future = games
      .filter((g) => {
        const ts = gameTimestamp(g);
        return Number.isFinite(ts) && ts >= dayStart;
      })
      .sort((a, b) => gameTimestamp(a) - gameTimestamp(b));

    const upcomingGame = future.find((g) => gameTimestamp(g) >= now) ?? future[0] ?? null;

    const recentList = games
      .filter((g) => g.id !== upcomingGame?.id)
      .sort((a, b) => {
        const ta = gameTimestamp(a);
        const tb = gameTimestamp(b);
        const fa = Number.isFinite(ta)
          ? ta
          : (a.updatedAt?.toMillis?.() ?? 0);
        const fb = Number.isFinite(tb)
          ? tb
          : (b.updatedAt?.toMillis?.() ?? 0);
        return fb - fa;
      })
      .slice(0, RECENT_LIMIT);

    return { upcoming: upcomingGame, recent: recentList };
  }, [games]);

  return (
    <div className="mb-6 space-y-4">
      {/* Upcoming game */}
      <section className={panelClass}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Upcoming game
          </p>
          {isCoach ? (
            <Link href={gameCapUrl({ teamId: team.id })} className={ghostBtn}>
              + Add video
            </Link>
          ) : null}
        </div>
        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : upcoming ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">
                {gameOpponentLine(upcoming)}
              </p>
              <p className="text-xs text-zinc-500">
                {gameMetaLine(upcoming) || "Date TBD"}
              </p>
            </div>
            <Link href={`/game/${upcoming.id}`} className={primaryBtn}>
              Prepare game
            </Link>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            No upcoming game scheduled.
          </p>
        )}
      </section>

      {/* Recent games */}
      <section className={panelClass}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Recent games
          </p>
          <Link href={`/team/${team.id}/games`} className={ghostBtn}>
            All games
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-zinc-400">
            {isCoach
              ? "No games yet. Use Add video to start your first game."
              : "No games yet for this team."}
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/game/${g.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2.5 transition hover:border-white/15 hover:bg-white/[0.04]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">
                      {gameOpponentLine(g)}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {gameMetaLine(g) || "Game"}
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
    </div>
  );
}
