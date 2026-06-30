"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatTimelineSeconds } from "@/lib/game-timeline";
import { statTypeLabel } from "@/lib/game-stats";
import {
  gameReviewUrl,
  loadPersonCareerProfile,
  type PersonCareerProfile,
} from "@/lib/person-profile";
import {
  playersListUrl,
  teamPlayerProfileUrl,
} from "@/lib/team-routes";

export type PersonProfileViewProps = {
  personId: string;
  currentUid: string;
};

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

function formatCareerStatLine(counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${statTypeLabel(type).toLowerCase()}${n === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : "No stats yet";
}

export default function PersonProfileView({
  personId,
  currentUid,
}: PersonProfileViewProps) {
  const [data, setData] = useState<PersonCareerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await loadPersonCareerProfile(currentUid, personId);
      if (!profile) {
        setError("Player not found.");
        setData(null);
        return;
      }
      setData(profile);
    } catch {
      setError("Could not load player profile.");
    } finally {
      setLoading(false);
    }
  }, [currentUid, personId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        <Link href={playersListUrl()} className={`${ghostBtn} mt-4 inline-block`}>
          ← All players
        </Link>
      </div>
    );
  }

  const { person, rosterAppearances, filmMoments, eventSummaries, careerCounts, careerTotal } =
    data;
  const statMoments = filmMoments.filter((m) => m.kind === "stat");
  const tagMoments = filmMoments.filter((m) => m.kind === "tag");

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Player · All events
          </p>
          <h2 className="text-xl font-semibold text-white">{person.name}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Stats and tagged moments across every event roster this player appears on.
          </p>
        </div>

        <section className={`${panelClass} mb-5`}>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
            <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-3">
              <p className="text-lg font-semibold text-white">
                {rosterAppearances.length}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Event rosters
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-3">
              <p className="text-lg font-semibold text-white">{statMoments.length}</p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Stats on film
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-3">
              <p className="text-lg font-semibold text-white">{tagMoments.length}</p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Tags on film
              </p>
            </div>
          </div>
          {careerTotal > 0 ? (
            <p className="mt-3 text-xs text-zinc-400">
              Career: {formatCareerStatLine(careerCounts)}
            </p>
          ) : null}
          {eventSummaries.length > 0 ? (
            <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
              {eventSummaries.map((summary) => (
                <li key={summary.eventLabel} className="text-xs text-zinc-400">
                  <span className="font-medium text-zinc-300">
                    {summary.eventLabel}:
                  </span>{" "}
                  {summary.total > 0
                    ? formatCareerStatLine(summary.counts)
                    : "No stats"}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={`${panelClass} mb-5`}>
          <h2 className="mb-3 text-sm font-semibold text-white">Event rosters</h2>
          {rosterAppearances.length === 0 ? (
            <p className="text-sm text-zinc-400">
              This player is not on any of your team rosters yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rosterAppearances.map((row) => (
                <li key={`${row.teamId}-${row.playerId}`}>
                  <Link
                    href={teamPlayerProfileUrl(row.teamId, row.playerId)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2 transition hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-200">
                        {row.teamName}
                      </span>
                      {row.eventLabel ? (
                        <span className="block text-xs text-zinc-500">
                          {row.eventLabel}
                        </span>
                      ) : null}
                    </span>
                    {row.jerseyNumber ? (
                      <span className="shrink-0 font-mono text-xs text-zinc-400">
                        #{row.jerseyNumber}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${panelClass} mb-5`}>
          <h2 className="mb-3 text-sm font-semibold text-white">
            Stats on film
          </h2>
          {statMoments.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No stats tagged for this player yet. Tag plays in Review with a
              player selected.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {statMoments.map((moment) => (
                <li key={moment.eventId}>
                  <Link
                    href={gameReviewUrl(moment.gameId, moment.t, moment.sourceId)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2 transition hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-200">
                        {moment.label}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {moment.gameTitle}
                        {moment.eventLabel ? ` · ${moment.eventLabel}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-400">
                      {formatTimelineSeconds(moment.t)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={panelClass}>
          <h2 className="mb-3 text-sm font-semibold text-white">
            Tagged moments
          </h2>
          {tagMoments.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No coach marks or play tags for this player yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {tagMoments.map((moment) => (
                <li key={moment.eventId}>
                  <Link
                    href={gameReviewUrl(moment.gameId, moment.t, moment.sourceId)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2 transition hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-200">
                        {moment.label}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {moment.gameTitle}
                        {moment.eventLabel ? ` · ${moment.eventLabel}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-400">
                      {formatTimelineSeconds(moment.t)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link href={playersListUrl()} className={`${ghostBtn} mt-6 inline-block`}>
          ← All players
        </Link>
      </div>
    </div>
  );
}
