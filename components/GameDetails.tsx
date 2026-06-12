"use client";

import { useEffect, useState } from "react";
import GameContributors from "@/components/GameContributors";
import {
  listDirectorTracks,
  listGameSources,
  type Game,
} from "@/lib/games";

export type GameDetailsProps = {
  game: Game;
  currentUid: string;
  /** Called when contributors change (parent may refresh the games list). */
  onChanged?: () => void;
};

/**
 * Lightweight Game details panel: header (title/date), quick counts (sources /
 * perspectives), and the contributor manager. Read-only counts; the contributor
 * section enforces owner-only management itself.
 */
export default function GameDetails({
  game,
  currentUid,
  onChanged,
}: GameDetailsProps) {
  const [sourceCount, setSourceCount] = useState<number | null>(null);
  const [cutCount, setCutCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [sources, cuts] = await Promise.all([
          listGameSources(game.id),
          listDirectorTracks(game.id, currentUid),
        ]);
        if (cancelled) return;
        setSourceCount(sources.length);
        setCutCount(cuts.length);
      } catch {
        /* Counts are best-effort. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id, currentUid]);

  return (
    <div className="mt-2 rounded-lg border border-white/[0.08] bg-zinc-950/60 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{game.title}</p>
          <p className="text-xs text-zinc-500">
            {[game.sport, game.date].filter(Boolean).join(" · ") ||
              "Game container"}
          </p>
        </div>
        <div className="flex gap-1.5">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
            {sourceCount ?? "…"} source{sourceCount === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
            {cutCount ?? "…"} perspective{cutCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <GameContributors
        game={game}
        currentUid={currentUid}
        onChanged={onChanged}
      />
    </div>
  );
}
