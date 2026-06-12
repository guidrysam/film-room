"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CutPlayer from "@/components/CutPlayer";
import CutRecorder, { type CutSnapshot } from "@/components/CutRecorder";
import {
  directorTrackSummary,
  type DirectorTrackSummary,
} from "@/lib/director-track";
import {
  duplicateDirectorTrack,
  listDirectorTracks,
  type CutVisibility,
  type DirectorTrack,
} from "@/lib/games";

export type CutStudioProps = {
  /** Game this room is tied to. When null, recording works but saving/listing are disabled. */
  gameId: string | null;
  /** Current viewer uid. */
  userId: string;
  /** Current viewer display name (for attribution on created/duplicated cuts). */
  userName?: string;
  /** Reads the current viewing state for recording. */
  getSnapshot: () => Promise<CutSnapshot> | CutSnapshot;
  /** Reads the current playback game time for cut playback. */
  getTime: () => Promise<number> | number;
  /** Apply a layout change during playback. */
  applyLayout: (layout: string) => void;
  /** Apply an active camera/source change during playback. */
  applyActiveSource: (sourceId: string) => void;
  /** Apply a player-view focus change during playback. */
  applyPlayerView: (sourceId: string) => void;
};

type SortKey = "newest" | "oldest";
type FilterKey = "all" | "mine" | "shared";

const VIS_BADGE: Record<CutVisibility, { label: string; cls: string }> = {
  private: {
    label: "Private",
    cls: "border-zinc-600/50 bg-zinc-800/50 text-zinc-300",
  },
  game: {
    label: "Game Visible",
    cls: "border-emerald-600/45 bg-emerald-950/45 text-emerald-200",
  },
  team: {
    label: "Team",
    cls: "border-blue-600/45 bg-blue-950/45 text-blue-200",
  },
};

function formatDurationCovered(sec: number): string {
  if (sec >= 60) return `${Math.round(sec / 60)} min`;
  return `${Math.round(sec)} sec`;
}

function formatCutDate(cut: DirectorTrack): string {
  const ms = cut.createdAt?.toMillis?.() ?? cut.updatedAt?.toMillis?.() ?? 0;
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Phase 3B Perspectives studio: records new Director Tracks and surfaces all
 * visible cuts for a Game so multiple people can build different viewpoints
 * from the same synchronized footage. Includes attribution, summary metadata,
 * filtering/sorting, and one-click duplication. Kept out of the room file so
 * integration stays a single render call + glue callbacks.
 */
export default function CutStudio({
  gameId,
  userId,
  userName,
  getSnapshot,
  getTime,
  applyLayout,
  applyActiveSource,
  applyPlayerView,
}: CutStudioProps) {
  const [cuts, setCuts] = useState<DirectorTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("newest");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gameId) {
      setCuts([]);
      return;
    }
    setLoading(true);
    try {
      setCuts(await listDirectorTracks(gameId, userId));
    } catch {
      /* Listing failed (rules / network) — leave existing list. */
    } finally {
      setLoading(false);
    }
  }, [gameId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A cut is visible if it is shared (game/team) or owned by the viewer.
  // Private cuts by other users are hidden here (UI-level privacy for now).
  const visibleCuts = useMemo(
    () =>
      cuts.filter(
        (c) => (c.visibility ?? "private") !== "private" || c.createdBy === userId,
      ),
    [cuts, userId],
  );

  const shownCuts = useMemo(() => {
    let list = visibleCuts;
    if (filter === "mine") list = list.filter((c) => c.createdBy === userId);
    else if (filter === "shared")
      list = list.filter((c) => (c.visibility ?? "private") !== "private");
    const sorted = [...list].sort((a, b) => {
      const am = a.createdAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
      const bm = b.createdAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
      return sort === "newest" ? bm - am : am - bm;
    });
    return sorted;
  }, [visibleCuts, filter, sort, userId]);

  const summaries = useMemo(() => {
    const map = new Map<string, DirectorTrackSummary>();
    for (const c of cuts) map.set(c.id, directorTrackSummary(c.track));
    return map;
  }, [cuts]);

  const playing = cuts.find((c) => c.id === playingId) ?? null;

  const handleDuplicate = useCallback(
    async (cut: DirectorTrack) => {
      if (!gameId) return;
      const name =
        window.prompt("Name your version:", `${cut.name} (copy)`)?.trim() ||
        `${cut.name} (copy)`;
      setBusyId(cut.id);
      try {
        await duplicateDirectorTrack(gameId, cut, userId, {
          name,
          ...(userName ? { createdByName: userName } : {}),
        });
        await refresh();
      } catch {
        /* Duplication failed (rules / network). */
      } finally {
        setBusyId(null);
      }
    },
    [gameId, userId, userName, refresh],
  );

  const segBtn = (active: boolean) =>
    `rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
      active
        ? "border border-blue-500/55 bg-blue-600/25 text-white"
        : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
    }`;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-zinc-950/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
          Perspectives
        </p>
        {gameId ? (
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-[10px] font-medium text-zinc-400 transition hover:text-blue-300"
          >
            Refresh
          </button>
        ) : null}
      </div>
      <p className="mb-2.5 text-[10px] leading-snug text-zinc-500">
        Many viewpoints from one game — record your own cut or replay someone
        else&apos;s.
      </p>

      <CutRecorder
        gameId={gameId}
        userId={userId}
        userName={userName}
        getSnapshot={getSnapshot}
        onSaved={() => void refresh()}
      />

      <div className="mt-3">
        {!gameId ? (
          <p className="text-[10px] leading-snug text-zinc-500">
            Saved perspectives appear here when this room is opened from a Game.
          </p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wide text-zinc-500">
                  Show
                </span>
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={segBtn(filter === "all")}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("mine")}
                  className={segBtn(filter === "mine")}
                >
                  Mine
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("shared")}
                  className={segBtn(filter === "shared")}
                >
                  Shared
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wide text-zinc-500">
                  Sort
                </span>
                <button
                  type="button"
                  onClick={() => setSort("newest")}
                  className={segBtn(sort === "newest")}
                >
                  Newest
                </button>
                <button
                  type="button"
                  onClick={() => setSort("oldest")}
                  className={segBtn(sort === "oldest")}
                >
                  Oldest
                </button>
              </div>
            </div>

            {loading ? (
              <p className="text-[11px] text-zinc-500">Loading perspectives…</p>
            ) : shownCuts.length === 0 ? (
              <p className="text-[10px] leading-snug text-zinc-500">
                No perspectives yet. Record one above to capture your view
                changes over time.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {shownCuts.map((c) => {
                  const isPlaying = c.id === playingId;
                  const vis = VIS_BADGE[c.visibility ?? "private"];
                  const summary = summaries.get(c.id);
                  const date = formatCutDate(c);
                  return (
                    <li
                      key={c.id}
                      className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-zinc-100">
                            {c.name}
                          </p>
                          <p className="mt-0.5 text-[10px] text-zinc-400">
                            by {c.createdByName ?? "Unknown"}
                            {date ? ` · ${date}` : ""}
                          </p>
                          {summary ? (
                            <p className="text-[10px] text-zinc-500">
                              {summary.eventCount} event
                              {summary.eventCount === 1 ? "" : "s"}
                              {summary.durationSec > 0
                                ? ` · ${formatDurationCovered(summary.durationSec)}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${vis.cls}`}
                        >
                          {vis.label}
                        </span>
                      </div>
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPlayingId(isPlaying ? null : c.id)}
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                            isPlaying
                              ? "border-amber-500/45 bg-amber-950/45 text-amber-100 hover:bg-amber-900/55"
                              : "border-blue-500/40 bg-blue-950/50 text-blue-100 hover:bg-blue-900/55"
                          }`}
                        >
                          {isPlaying ? "Stop" : "Play Cut"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDuplicate(c)}
                          disabled={busyId === c.id}
                          className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40"
                        >
                          {busyId === c.id ? "Duplicating…" : "Duplicate"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {playing ? (
        <CutPlayer
          track={playing.track}
          active
          getTime={getTime}
          onLayout={applyLayout}
          onActiveSource={applyActiveSource}
          onPlayerView={applyPlayerView}
        />
      ) : null}
    </div>
  );
}
