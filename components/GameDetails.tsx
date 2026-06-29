"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import GameContributors from "@/components/GameContributors";
import GameInvites from "@/components/GameInvites";
import GameSources from "@/components/GameSources";
import { directorTrackSummary } from "@/lib/director-track";
import {
  listDirectorTracks,
  listGameSources,
  type DirectorTrack,
  type Game,
} from "@/lib/games";

export type GameDetailsProps = {
  game: Game;
  currentUid: string;
  /** Called when contributors change (parent may refresh the games list). */
  onChanged?: () => void;
};

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0 min";
  const mins = Math.round(sec / 60);
  if (mins >= 1) return `${mins} min`;
  return `${Math.round(sec)}s`;
}

/**
 * Game details panel. The Game is the central object, so sections read in
 * order: Sources → Perspectives → Invite Links → Contributors. Sources and
 * invites enforce their own edit/owner permissions; counts are best-effort.
 */
export default function GameDetails({
  game,
  currentUid,
  onChanged,
}: GameDetailsProps) {
  const [sourceCount, setSourceCount] = useState<number | null>(null);
  const [cuts, setCuts] = useState<DirectorTrack[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [sources, tracks] = await Promise.all([
          listGameSources(game.id),
          listDirectorTracks(game.id, currentUid),
        ]);
        if (cancelled) return;
        setSourceCount(sources.length);
        setCuts(tracks);
      } catch {
        /* Counts are best-effort. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id, currentUid, refreshKey]);

  const cutCount = cuts?.length ?? null;

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

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={`/game/${game.id}`}
          className="inline-flex items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
        >
          Game dashboard
        </Link>
        <Link
          href={`/game/${game.id}/review`}
          className="inline-flex items-center justify-center rounded-lg border border-blue-500/40 bg-blue-950/40 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-900/55"
        >
          Open Review
        </Link>
      </div>

      {/* 1. Videos */}
      <div className="mb-4 border-b border-white/[0.06] pb-4">
        <GameSources
          game={game}
          currentUid={currentUid}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      </div>

      {/* 2. Saved Views */}
      <div className="mb-4 border-b border-white/[0.06] pb-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          Saved Views
        </p>
        {cuts === null ? (
          <p className="text-[11px] text-zinc-500">Loading saved views…</p>
        ) : cuts.length === 0 ? (
          <p className="text-[10px] leading-snug text-zinc-500">
            No saved views yet. Open Review and record a cut to create one.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {cuts.map((cut) => {
              const summary = directorTrackSummary(cut.track);
              return (
                <li
                  key={cut.id}
                  className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="truncate text-[12px] font-medium text-zinc-200">
                      {cut.name}
                    </span>
                    {cut.visibility === "private" ? (
                      <span className="rounded-full border border-zinc-600/50 bg-zinc-800/50 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">
                        private
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    {cut.createdByName ? `by ${cut.createdByName} · ` : ""}
                    {summary.eventCount} event
                    {summary.eventCount === 1 ? "" : "s"} ·{" "}
                    {formatDuration(summary.durationSec)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 3. Invite Links */}
      <div className="mb-4 border-b border-white/[0.06] pb-4">
        <GameInvites game={game} currentUid={currentUid} />
      </div>

      {/* 4. Contributors */}
      <GameContributors
        game={game}
        currentUid={currentUid}
        onChanged={onChanged}
      />
    </div>
  );
}
