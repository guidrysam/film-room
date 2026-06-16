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
import {
  appendHighlightMoment,
  createHighlightDraft,
  highlightDraftPlayhead,
  highlightMomentPlayhead,
  listHighlightDrafts,
  removeHighlightMoment,
  type HighlightDraft,
  type HighlightMoment,
} from "@/lib/highlight-draft";
import { gameSourceToVideoAngle } from "@/lib/video-angle";

export type GameReviewProps = {
  gameId: string;
  currentUid: string;
  currentDisplayName?: string | null;
};

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/30";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const dangerBtn =
  "rounded-lg border border-rose-500/25 bg-rose-950/20 px-2 py-1 text-[10px] font-medium text-rose-200 transition hover:border-rose-500/40 hover:bg-rose-950/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50";

function formatOffsetSec(sec: number): string {
  return sec >= 0 ? `+${sec}s` : `${sec}s`;
}

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
export default function GameReview({
  gameId,
  currentUid,
  currentDisplayName,
}: GameReviewProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [sources, setSources] = useState<GameVideoSource[]>([]);
  const [events, setEvents] = useState<GameTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedGameTime, setSelectedGameTime] = useState(0);
  const [seekWarning, setSeekWarning] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [highlightDrafts, setHighlightDrafts] = useState<HighlightDraft[]>([]);
  const [draftTarget, setDraftTarget] = useState<"new" | "existing">("new");
  const [newDraftName, setNewDraftName] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [momentSourceId, setMomentSourceId] = useState<string | null>(null);
  const [startOffsetSec, setStartOffsetSec] = useState(-5);
  const [endOffsetSec, setEndOffsetSec] = useState(10);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [removingMomentKey, setRemovingMomentKey] = useState<string | null>(null);
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

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const momentSource = useMemo(
    () =>
      playableSources.find((s) => s.id === (momentSourceId ?? selectedSourceId)) ??
      null,
    [playableSources, momentSourceId, selectedSourceId],
  );

  const sourceLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of playableSources) map.set(s.id, s.label);
    return map;
  }, [playableSources]);

  const refreshHighlightDrafts = useCallback(async () => {
    try {
      const drafts = await listHighlightDrafts(gameId, currentUid);
      setHighlightDrafts(drafts);
      setSelectedDraftId((prev) => {
        if (prev && drafts.some((d) => d.id === prev)) return prev;
        return drafts[0]?.id ?? null;
      });
      setExpandedDraftId((prev) => {
        if (prev && drafts.some((d) => d.id === prev)) return prev;
        return null;
      });
    } catch {
      /* non-fatal */
    }
  }, [gameId, currentUid]);

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
      await refreshHighlightDrafts();
    } catch {
      setLoadError("Could not load this game.");
    } finally {
      setLoading(false);
    }
  }, [gameId, currentUid, refreshHighlightDrafts]);

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

  const seekToGameMoment = useCallback(
    (gameTime: number, sourceId: string) => {
      const source = playableSources.find((s) => s.id === sourceId) ?? null;
      if (!source) return;
      setSelectedGameTime(gameTime);
      const sourceTime = gameTimeToSourceTime(gameTime, source);
      if (source.id !== selectedSourceId) {
        if (sourceTime < 0) {
          setSeekWarning("This angle has not started yet at this game moment.");
          pendingSeekRef.current = null;
        } else {
          setSeekWarning(null);
          pendingSeekRef.current = sourceTime;
        }
        setPlayerReady(false);
        playerRef.current = null;
        setSelectedSourceId(source.id);
        return;
      }
      void applySeekForGameTime(gameTime, source);
    },
    [playableSources, selectedSourceId, applySeekForGameTime],
  );

  const handleSelectEvent = useCallback(
    (event: GameTimelineEvent) => {
      setSelectedEventId(event.id);
      setSelectedGameTime(event.t);
      void applySeekForGameTime(event.t, selectedSource);
    },
    [selectedSource, applySeekForGameTime],
  );

  const handleAddToHighlightDraft = useCallback(async () => {
    if (!momentSource) return;
    setDraftSaving(true);
    setDraftMessage(null);
    try {
      const momentInput = {
        gameTime: selectedGameTime,
        activeSourceId: momentSource.id,
        startOffsetSec,
        endOffsetSec,
        ...(selectedEvent?.label ? { label: selectedEvent.label } : {}),
        ...(selectedEvent?.id ? { timelineEventId: selectedEvent.id } : {}),
      };
      if (draftTarget === "new") {
        if (!newDraftName.trim()) {
          setDraftMessage("Enter a draft name.");
          return;
        }
        await createHighlightDraft(gameId, currentUid, {
          name: newDraftName,
          moment: momentInput,
          ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
        });
        setDraftMessage("Moment saved to new draft.");
        setNewDraftName("");
      } else {
        if (!selectedDraftId) {
          setDraftMessage("Select a draft.");
          return;
        }
        await appendHighlightMoment(gameId, selectedDraftId, momentInput);
        setDraftMessage("Moment added to draft.");
      }
      await refreshHighlightDrafts();
    } catch {
      setDraftMessage("Could not save moment.");
    } finally {
      setDraftSaving(false);
    }
  }, [
    momentSource,
    selectedGameTime,
    startOffsetSec,
    endOffsetSec,
    selectedEvent,
    draftTarget,
    newDraftName,
    gameId,
    currentUid,
    currentDisplayName,
    selectedDraftId,
    refreshHighlightDrafts,
  ]);

  const handlePlayHighlightDraft = useCallback(
    (draft: HighlightDraft) => {
      const playhead = highlightDraftPlayhead(draft, 0);
      if (!playhead) return;
      seekToGameMoment(playhead.gameTime, playhead.activeSourceId);
    },
    [seekToGameMoment],
  );

  const handlePlayHighlightMoment = useCallback(
    (moment: HighlightMoment) => {
      const playhead = highlightMomentPlayhead(moment);
      seekToGameMoment(playhead.gameTime, playhead.activeSourceId);
    },
    [seekToGameMoment],
  );

  const handleRemoveHighlightMoment = useCallback(
    async (draftId: string, momentId: string) => {
      const key = `${draftId}:${momentId}`;
      setRemovingMomentKey(key);
      setDraftMessage(null);
      try {
        await removeHighlightMoment(gameId, draftId, momentId);
        await refreshHighlightDrafts();
        setDraftMessage("Moment removed.");
      } catch {
        setDraftMessage("Could not remove moment.");
      } finally {
        setRemovingMomentKey(null);
      }
    },
    [gameId, refreshHighlightDrafts],
  );

  const toggleDraftExpanded = useCallback((draftId: string) => {
    setExpandedDraftId((prev) => (prev === draftId ? null : draftId));
  }, []);

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

            <div className="space-y-4">
              <section className={panelClass}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Timeline
                </p>
                {events.length === 0 ? (
                  <p className="text-[11px] leading-snug text-zinc-500">
                    No coach marks or timeline events yet. Open in Film Room to
                    add marks — they appear here for synced review.
                  </p>
                ) : (
                  <ul className="max-h-[40vh] space-y-1 overflow-y-auto pr-1">
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

              <section className={panelClass}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Highlight Draft
                </p>
                <p className="mb-4 text-[11px] leading-snug text-zinc-500">
                  This saves instructions, not a rendered video yet.
                </p>

                {highlightDrafts.length === 0 ? (
                  <p className="mb-4 rounded-lg border border-dashed border-white/[0.08] bg-black/15 px-3 py-2.5 text-[11px] leading-snug text-zinc-500">
                    Click a coach mark or timeline event, choose an angle, then
                    save it to a highlight draft.
                  </p>
                ) : null}

                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Add moment
                </p>

                <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Selected game time
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-zinc-200">
                    {formatTimelineSeconds(selectedGameTime)}
                    {selectedEvent?.label ? ` · ${selectedEvent.label}` : ""}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    Clip window{" "}
                    {formatTimelineSeconds(
                      Math.max(0, selectedGameTime + startOffsetSec),
                    )}{" "}
                    →{" "}
                    {formatTimelineSeconds(
                      Math.max(
                        Math.max(0, selectedGameTime + startOffsetSec),
                        selectedGameTime + endOffsetSec,
                      ),
                    )}{" "}
                    ({formatOffsetSec(startOffsetSec)} /{" "}
                    {formatOffsetSec(endOffsetSec)})
                  </p>
                </div>

                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftTarget("new")}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                      draftTarget === "new"
                        ? "border-blue-500/50 bg-blue-950/30 text-blue-100"
                        : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]"
                    }`}
                  >
                    New draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftTarget("existing")}
                    disabled={highlightDrafts.length === 0}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      draftTarget === "existing"
                        ? "border-blue-500/50 bg-blue-950/30 text-blue-100"
                        : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]"
                    }`}
                  >
                    Existing draft
                  </button>
                </div>

                {draftTarget === "new" ? (
                  <label className="mb-3 block">
                    <span className="mb-1 block text-[10px] text-zinc-500">
                      Draft name
                    </span>
                    <input
                      type="text"
                      value={newDraftName}
                      onChange={(e) => setNewDraftName(e.target.value)}
                      placeholder="e.g. Q1 drives"
                      className={inputClass}
                    />
                  </label>
                ) : (
                  <label className="mb-3 block">
                    <span className="mb-1 block text-[10px] text-zinc-500">
                      Draft
                    </span>
                    <select
                      value={selectedDraftId ?? ""}
                      onChange={(e) =>
                        setSelectedDraftId(e.target.value || null)
                      }
                      className={inputClass}
                    >
                      {highlightDrafts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="mb-3 block">
                  <span className="mb-1 block text-[10px] text-zinc-500">
                    Angle
                  </span>
                  <select
                    value={momentSourceId ?? selectedSourceId ?? ""}
                    onChange={(e) => setMomentSourceId(e.target.value || null)}
                    className={inputClass}
                  >
                    {playableSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-zinc-500">
                      Start offset (sec)
                    </span>
                    <input
                      type="number"
                      value={startOffsetSec}
                      onChange={(e) =>
                        setStartOffsetSec(Number(e.target.value) || 0)
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-zinc-500">
                      End offset (sec)
                    </span>
                    <input
                      type="number"
                      value={endOffsetSec}
                      onChange={(e) =>
                        setEndOffsetSec(Number(e.target.value) || 0)
                      }
                      className={inputClass}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void handleAddToHighlightDraft()}
                  disabled={draftSaving || !momentSource}
                  className={`${primaryBtn} w-full`}
                >
                  {draftSaving ? "Saving…" : "Save to Highlight Draft"}
                </button>

                {draftMessage ? (
                  <p className="mt-2 text-[11px] text-zinc-400">{draftMessage}</p>
                ) : null}

                <div className="mt-5 border-t border-white/[0.06] pt-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Moments
                  </p>
                  {highlightDrafts.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">
                      No saved moments yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {highlightDrafts.map((draft) => {
                        const expanded = expandedDraftId === draft.id;
                        const sortedMoments = [...draft.moments].sort(
                          (a, b) => a.gameTime - b.gameTime,
                        );
                        return (
                          <li
                            key={draft.id}
                            className="rounded-lg border border-white/[0.06] bg-black/20"
                          >
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <button
                                type="button"
                                onClick={() => toggleDraftExpanded(draft.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <p className="truncate text-xs font-medium text-zinc-200">
                                  {draft.name}
                                </p>
                                <p className="text-[10px] text-zinc-500">
                                  {draft.moments.length}{" "}
                                  {draft.moments.length === 1
                                    ? "moment"
                                    : "moments"}
                                </p>
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePlayHighlightDraft(draft)}
                                disabled={draft.moments.length === 0}
                                className={ghostBtn}
                              >
                                Play
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleDraftExpanded(draft.id)}
                                className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-400"
                                aria-expanded={expanded}
                              >
                                {expanded ? "−" : "+"}
                              </button>
                            </div>

                            {expanded ? (
                              <ul className="space-y-1.5 border-t border-white/[0.06] px-2.5 py-2">
                                {sortedMoments.map((moment) => {
                                  const removeKey = `${draft.id}:${moment.id}`;
                                  const removing =
                                    removingMomentKey === removeKey;
                                  const clipStart = Math.max(
                                    0,
                                    moment.gameTime + moment.startOffsetSec,
                                  );
                                  const clipEnd = Math.max(
                                    clipStart,
                                    moment.gameTime + moment.endOffsetSec,
                                  );
                                  return (
                                    <li
                                      key={moment.id}
                                      className="rounded-lg border border-white/[0.05] bg-black/25 px-2 py-2"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-[11px] font-medium text-zinc-200">
                                            {moment.label?.trim() ||
                                              "Highlight moment"}
                                          </p>
                                          <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
                                            {formatTimelineSeconds(moment.gameTime)}
                                          </p>
                                          <p className="mt-0.5 text-[10px] text-zinc-500">
                                            {sourceLabelById.get(
                                              moment.activeSourceId,
                                            ) ?? moment.activeSourceId}
                                          </p>
                                          <p className="mt-0.5 text-[10px] text-zinc-500">
                                            {formatOffsetSec(moment.startOffsetSec)}{" "}
                                            / {formatOffsetSec(moment.endOffsetSec)}{" "}
                                            · {formatTimelineSeconds(clipStart)} →{" "}
                                            {formatTimelineSeconds(clipEnd)}
                                          </p>
                                        </div>
                                        <div className="flex shrink-0 flex-col gap-1">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handlePlayHighlightMoment(moment)
                                            }
                                            className={ghostBtn}
                                          >
                                            Play moment
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleRemoveHighlightMoment(
                                                draft.id,
                                                moment.id,
                                              )
                                            }
                                            disabled={removing}
                                            className={dangerBtn}
                                          >
                                            {removing ? "…" : "Remove"}
                                          </button>
                                        </div>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
