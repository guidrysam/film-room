"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import TeamAddStreamGames from "@/components/TeamAddStreamGames";
import { canCoachTeam, listTeamGames, type Team, type TeamClubContext } from "@/lib/teams";
import type { Game } from "@/lib/games";
import { gameCapUrl } from "@/lib/team-routes";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-950/40 px-2.5 py-1 text-xs font-medium text-blue-100 transition hover:bg-blue-900/55";

export type TeamGamesProps = {
  team: Team;
  currentUid: string;
  club?: TeamClubContext | null;
};

export default function TeamGames({ team, currentUid, club }: TeamGamesProps) {
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

  const canCreate = canCoachTeam(team, currentUid, club);

  return (
    <section className={panelClass}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Team games</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refresh()} className={ghostBtn}>
            Refresh
          </button>
        </div>
      </div>

      {canCreate ? (
        <div className="mb-4">
          <TeamAddStreamGames
            team={team}
            currentUid={currentUid}
            onCreated={() => void refresh()}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-400">Loading games…</p>
      ) : games.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-zinc-400">
          {canCreate
            ? "No games yet. Use Add Video to start one."
            : "No games yet for this team."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {games.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {g.title}
                </span>
                <span className="block text-xs text-zinc-500">
                  {[g.sport, g.date, g.opponent ?? g.awayTeam, g.season]
                    .filter(Boolean)
                    .join(" · ") || "Game"}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link href={`/game/${g.id}`} className={ghostBtn}>
                  Open
                </Link>
                <Link
                  href={gameCapUrl({ teamId: team.id, gameId: g.id })}
                  className={primaryBtn}
                >
                  Add video
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
