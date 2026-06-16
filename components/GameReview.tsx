"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import YouTube, { type YouTubePlayer } from "react-youtube";
import {
  formatTimelineSeconds,
  gameTimeToSourceTime,
  syncStatusBadgeClass,
  syncStatusLabel,
} from "@/lib/game-timeline";
import {
  canViewGame,
  getGame,
  listGameEvents,
  listGameSources,
  type Game,
  type GameTimelineEvent,
  type GameTimelineEventType,
  type GameVideoSource,
} from "@/lib/games";
import { getTeam, teamRoleFor } from "@/lib/teams";
import { gameSourceToVideoAngle } from "@/lib/video-angle";

export type GameReviewProps = {
  gameId: string;
  currentUid: string;
};

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

function eventTypeLabel(type: GameTimelineEventType): string {
  switch (type) {
    case "coach_mark":
      return "Coach Mark";
    case "sync_point":
      return "Sync Point";
    case "note":
      return "Note";
    case "tag":
      return "Tag";
    case "layout":
      return "Layout";
    case "camera_switch":
      return "Camera";
    default:
      return type;
  }
}

function isPlayableYouTubeSource(source: GameVideoSource): boolean {
  return gameSourceToVideoAngle(source) != null;
}

async function seekPlayer(player: YouTubePlayer | null, seconds: number): Promise<void> {
  if (!player || seconds < 0) return;
  try {
    await player.seekTo(seconds, true);
  } catch {
    /* player may not be ready */
  }
}

/**
 * Multi-angle game review: synced sources + coach marks on a shared game clock.
 */
export default function GameReview({ gameId, currentUid }: GameReviewProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [sources, setSources] = useState<GameVideoSource[]>([]);
  const [events, setEvents] = useState<GameTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedGameTime, setSelectedGameTime] = useState(0);
  const [seekWarning, setSeekWarning] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  const playableSources = useMemo(
    () => sources.filter(isPlayableYouTubeSource),
    [sources],
  );

  const selectedSource = useMemo(
    () => playableSources.find((s) => s.id === selectedSourceId) ?? null,
    [playableSources, selectedSourceId],
  );

  const selectedSourceTime = useMemo(() => {
    if (!selectedSource) return 0;
    return gameTimeToSourceTime(selectedGameTime, selectedSource);
  }, [selectedGameTime, selectedSource]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const g = await getGame(gameId);
      if (!g) {
        setLoadError("Game not found.");
        return;
      }
      const team = g.teamId ? await getTeam(g.teamId) : null;
      const teamRole = team ? teamRoleFor(team, currentUid) : null;
      if (!canViewGame(g, currentUid, teamRole)) {
        setLoadError("You do not have access to review this game.");
        return;
      }
      const [srcs, evs] = await Promise.all([
        listGameSources(gameId),
        listGameEvents(gameId),
      ]);
      setGame(g);
      setSources(srcs);
      setEvents(evs);
      const playable = srcs.filter(isPlayableYouTubeSource);
      setSelectedSourceId((prev) => {
        if (prev && playable.some((s) => s.id === prev)) return prev;
        return playable[0]?.id ?? null;
      });
    } catch {
      setLoadError("Could not load this game.");
    } finally {
      setLoading(false);
    }
  }, [gameId, currentUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applySeekForGameTime = useCallback(
    async (gameTime: number, source: GameVideoSource | null) => {
      if (!source) return;
      const sourceTime = gameTimeToSourceTime(gameTime, source);
      if (sourceTime < 0) {
        setSeekWarning(
          "This angle has not started yet at this game moment.",
        );
        pendingSeekRef.current = null;
        return;
      }
      setSeekWarning(null);
      pendingSeekRef.current = sourceTime;
      if (playerReady) {
        await seekPlayer(playerRef.current, sourceTime);
      }
    },
    [playerReady],
  );

  const handleSelectEvent = useCallback(
    (event: GameTimelineEvent) => {
      setSelectedGameTime(event.t);
      void applySeekForGameTime(event.t, selectedSource);
    },
    [selectedSource, applySeekForGameTime],
  );

  const handleSelectSource = useCallback(
    (sourceId: string) => {
      const source = playableSources.find((s) => s.id === sourceId) ?? null;
      const sourceTime = source
        ? gameTimeToSourceTime(selectedGameTime, source)
        : 0;
      if (sourceTime < 0) {
        setSeekWarning(
          "This angle has not started yet at this game moment.",
        );
        pendingSeekRef.current = null;
      } else {
        setSeekWarning(null);
        pendingSeekRef.current = sourceTime;
      }
      setPlayerReady(false);
      playerRef.current = null;
      setSelectedSourceId(sourceId);
    },
    [playableSources, selectedGameTime],
  );

  useEffect(() => {
    setPlayerReady(false);
    playerRef.current = null;
  }, [selectedSourceId]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        Loading game review…
      </div>
    );
  }

  if (loadError || !game) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-rose-200">{loadError ?? "Game not found."}</p>
        <Link href="/app" className={`${ghostBtn} mt-4 inline-block`}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 text-zinc-50">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
              Game Review
            </p>
            <h1 className="text-xl font-semibold text-white">{game.title}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {[game.sport, game.date, game.opponent ?? game.awayTeam]
                .filter(Boolean)
                .join(" · ") || "Synced multi-angle review"}
            </p>
          </div>
          <Link href="/app" className={ghostBtn}>
            ← Dashboard
          </Link>
        </div>

        {playableSources.length === 0 ? (
          <div className={panelClass}>
            <p className="text-sm text-zinc-400">
              No playable YouTube sources yet. Attach sources in Game Cap, then
              return here to review synced angles.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <section className={panelClass}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Preview
                  </p>
                  <div className="flex flex-wrap gap-3 text-[11px] text-zinc-400">
                    <span>
                      Game time:{" "}
                      <span className="font-mono text-zinc-200">
                        {formatTimelineSeconds(selectedGameTime)}
                      </span>
                    </span>
                    <span>
                      Source time:{" "}
                      <span className="font-mono text-zinc-200">
                        {formatTimelineSeconds(selectedSourceTime)}
                      </span>
                    </span>
                  </div>
                </div>

                {selectedSource?.videoId ? (
                  <div className="aspect-video overflow-hidden rounded-lg border border-white/[0.08] bg-black">
                    <YouTube
                      key={selectedSource.id}
                      videoId={selectedSource.videoId}
                      className="h-full w-full"
                      opts={{
                        width: "100%",
                        height: "360",
                        playerVars: {
                          autoplay: 0,
                          modestbranding: 1,
                          rel: 0,
                        },
                      }}
                      onReady={(e) => {
                        playerRef.current = e.target;
                        setPlayerReady(true);
                        const st = pendingSeekRef.current;
                        if (st != null && st >= 0) {
                          void seekPlayer(e.target, st);
                        } else {
                          const computed = gameTimeToSourceTime(
                            selectedGameTime,
                            selectedSource,
                          );
                          if (computed >= 0) {
                            void seekPlayer(e.target, computed);
                          }
                        }
                      }}
                    />
                  </div>
                ) : null}

                {seekWarning ? (
                  <p className="mt-2 text-xs text-amber-200">{seekWarning}</p>
                ) : null}

                <p className="mt-2 text-[10px] text-zinc-500">
                  {selectedSource?.label} · offset{" "}
                  {selectedSource?.offsetFromGameTime ?? 0}s
                </p>
              </section>

              <section className={panelClass}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Angles
                </p>
                <ul className="space-y-1.5">
                  {playableSources.map((s) => {
                    const active = s.id === selectedSourceId;
                    const sourceAtGame = gameTimeToSourceTime(
                      selectedGameTime,
                      s,
                    );
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectSource(s.id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${
                            active
                              ? "border-blue-500/50 bg-blue-950/30"
                              : "border-white/[0.06] bg-zinc-950/50 hover:bg-white/[0.04]"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">
                              {s.label}
                            </span>
                            <span className="block font-mono text-[10px] text-zinc-500">
                              {s.videoId} · @{" "}
                              {formatTimelineSeconds(sourceAtGame)}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${syncStatusBadgeClass(s.syncStatus)}`}
                          >
                            {syncStatusLabel(s.syncStatus)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            <section className={panelClass}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Timeline
              </p>
              {events.length === 0 ? (
                <p className="text-[11px] leading-snug text-zinc-500">
                  No coach marks or timeline events yet. Open in Film Room to add
                  marks — they appear here for synced review.
                </p>
              ) : (
                <ul className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
                  {events.map((ev) => {
                    const active = Math.abs(ev.t - selectedGameTime) < 0.25;
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectEvent(ev)}
                          className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                            active
                              ? "border-emerald-500/45 bg-emerald-950/25"
                              : "border-white/[0.06] bg-black/25 hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-zinc-300">
                              {formatTimelineSeconds(ev.t)}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
                              {eventTypeLabel(ev.type)}
                            </span>
                          </div>
                          {ev.label ? (
                            <p className="mt-0.5 text-[11px] font-medium text-zinc-200">
                              {ev.label}
                            </p>
                          ) : null}
                          {ev.createdByName ? (
                            <p className="mt-0.5 text-[10px] text-zinc-500">
                              {ev.createdByName}
                            </p>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
