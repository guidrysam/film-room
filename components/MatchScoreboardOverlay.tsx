"use client";

import type { ScoreboardState } from "@/lib/game-scoreboard";

export type MatchScoreboardOverlayProps = {
  score: ScoreboardState;
  className?: string;
};

/** Game Cap–style bottom scoreboard for reel preview / capture. */
export default function MatchScoreboardOverlay({
  score,
  className = "",
}: MatchScoreboardOverlayProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-[35] bg-gradient-to-t from-black/80 via-black/55 to-transparent px-5 pb-3 pt-8 ${className}`}
      aria-hidden
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 text-left">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/85">
            {score.homeName}
          </p>
          <p className="font-mono text-3xl font-black tabular-nums leading-none text-white drop-shadow">
            {score.home}
          </p>
        </div>
        <div className="shrink-0 pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white/60">
          Score
        </div>
        <div className="min-w-0 text-right">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/85">
            {score.awayName}
          </p>
          <p className="font-mono text-3xl font-black tabular-nums leading-none text-white drop-shadow">
            {score.away}
          </p>
        </div>
      </div>
    </div>
  );
}
