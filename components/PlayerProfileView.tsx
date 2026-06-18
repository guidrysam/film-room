"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import TeamNav from "@/components/TeamNav";
import { formatPlayerStatLine } from "@/lib/game-stats";
import { formatTimelineSeconds } from "@/lib/game-timeline";
import { highlightMomentPlayhead } from "@/lib/highlight-draft";
import {
  flattenPlayerHighlightMoments,
  gameReviewUrl,
  loadPlayerProfile,
  type PlayerProfileData,
} from "@/lib/player-profile";
import { teamRosterUrl } from "@/lib/team-routes";

export type PlayerProfileViewProps = {
  teamId: string;
  playerId: string;
  currentUid: string;
};

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500";

export default function PlayerProfileView({
  teamId,
  playerId,
  currentUid,
}: PlayerProfileViewProps) {
  const [data, setData] = useState<PlayerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await loadPlayerProfile(teamId, playerId, currentUid);
      if (!profile) {
        setError("Player not found or access denied.");
        setData(null);
        return;
      }
      setData(profile);
    } catch {
      setError("Could not load player profile.");
    } finally {
      setLoading(false);
    }
  }, [teamId, playerId, currentUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const playerMoments = useMemo(
    () =>
      data
        ? flattenPlayerHighlightMoments(data.highlightDrafts, playerId)
        : [],
    [data, playerId],
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        Loading player profile…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-rose-200">{error ?? "Player not found."}</p>
        <Link href={teamRosterUrl(teamId)} className={`${ghostBtn} mt-4 inline-block`}>
          ← Back to team
        </Link>
      </div>
    );
  }

  const { player, team, highlightDrafts, taggedMoments, statSummary, gameStats } =
    data;

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-2xl">
        <TeamNav team={team} currentUid={currentUid} />

        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Player Profile
          </p>
          <h2 className="text-xl font-semibold text-white">{player.name}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {player.jerseyNumber ? `#${player.jerseyNumber}` : null}
            {player.jerseyNumber && player.position ? " · " : null}
            {player.position ?? null}
          </p>
        </div>

        <section className={`${panelClass} mb-5`}>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-3">
              <p className="text-lg font-semibold text-white">
                {data.linkedParentsCount}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Parents
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-3">
              <p className="text-lg font-semibold text-white">
                {data.highlightDraftsCount}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Drafts
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-3">
              <p className="text-lg font-semibold text-white">
                {data.taggedMomentsCount}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Tags
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-3">
              <p className="text-lg font-semibold text-white">
                {statSummary.total}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Stats
              </p>
            </div>
          </div>
          {statSummary.total > 0 ? (
            <p className="mt-3 text-xs text-zinc-400">
              Season summary: {formatPlayerStatLine(statSummary)}
            </p>
          ) : null}
        </section>

        <section className={`${panelClass} mb-5`}>
          <h2 className="mb-3 text-sm font-semibold text-white">Game stats</h2>
          {gameStats.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No official stats logged for this player yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {gameStats.map((stat) => (
                <li key={stat.eventId}>
                  <Link
                    href={gameReviewUrl(stat.gameId, stat.t, stat.sourceId)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2 transition hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-200">
                        {stat.statType}
                        {stat.note ? ` · ${stat.note}` : ""}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {stat.gameTitle}
                        {stat.opponent ? ` vs ${stat.opponent}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-400">
                      {formatTimelineSeconds(stat.t)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${panelClass} mb-5`}>
          <h2 className="mb-3 text-sm font-semibold text-white">
            Player Highlights
          </h2>
          {highlightDrafts.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No highlight drafts tagged for this player yet. Save moments in
              Game Review with a player selected.
            </p>
          ) : (
            <ul className="space-y-3">
              {highlightDrafts.map((draft) => (
                <li
                  key={draft.id}
                  className="rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2"
                >
                  <p className="text-sm font-medium text-zinc-200">{draft.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    {draft.moments.length}{" "}
                    {draft.moments.length === 1 ? "moment" : "moments"}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {playerMoments.length > 0 ? (
            <ul className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Moments
              </p>
              {playerMoments.map(({ draft, moment }) => {
                const playhead = highlightMomentPlayhead(moment);
                return (
                  <li
                    key={`${draft.id}-${moment.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-black/20 px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-200">
                        {moment.label?.trim() || draft.name}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-500">
                        {formatTimelineSeconds(moment.gameTime)}
                      </p>
                    </div>
                    <Link
                      href={gameReviewUrl(
                        draft.gameId,
                        playhead.gameTime,
                        playhead.activeSourceId,
                      )}
                      className={primaryBtn}
                    >
                      Open review
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className={panelClass}>
          <h2 className="mb-3 text-sm font-semibold text-white">
            Tagged coach marks
          </h2>
          {taggedMoments.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No coach marks tagged for this player yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {taggedMoments.map((tm) => (
                <li key={tm.eventId}>
                  <Link
                    href={gameReviewUrl(tm.gameId, tm.t)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2 transition hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-200">
                        {tm.label ?? tm.type}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {tm.gameTitle}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-400">
                      {formatTimelineSeconds(tm.t)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link href={teamRosterUrl(teamId)} className={`${ghostBtn} mt-6 inline-block`}>
          ← Back to team
        </Link>
      </div>
    </div>
  );
}
