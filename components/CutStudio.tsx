"use client";

import { useCallback, useEffect, useState } from "react";
import CutPlayer from "@/components/CutPlayer";
import CutRecorder, { type CutSnapshot } from "@/components/CutRecorder";
import {
  listDirectorTracks,
  type DirectorTrack,
} from "@/lib/games";

export type CutStudioProps = {
  /** Game this room is tied to. When null, recording works but saving/listing are disabled. */
  gameId: string | null;
  /** Current viewer uid. */
  userId: string;
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

/**
 * Phase 3A Director Track studio: a small, self-contained panel that pairs the
 * cut recorder with a list of saved cuts and an inline player. Kept out of the
 * room file so room integration stays a single render call + glue callbacks.
 */
export default function CutStudio({
  gameId,
  userId,
  getSnapshot,
  getTime,
  applyLayout,
  applyActiveSource,
  applyPlayerView,
}: CutStudioProps) {
  const [cuts, setCuts] = useState<DirectorTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gameId) {
      setCuts([]);
      return;
    }
    setLoading(true);
    try {
      setCuts(await listDirectorTracks(gameId));
    } catch {
      /* Listing failed (rules / network) — leave existing list. */
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const playing = cuts.find((c) => c.id === playingId) ?? null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-zinc-950/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          Director cuts
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

      <CutRecorder
        gameId={gameId}
        userId={userId}
        getSnapshot={getSnapshot}
        onSaved={() => void refresh()}
      />

      <div className="mt-2.5">
        {!gameId ? (
          <p className="text-[10px] leading-snug text-zinc-500">
            Saved cuts appear here when this room is opened from a Game.
          </p>
        ) : loading ? (
          <p className="text-[11px] text-zinc-500">Loading cuts…</p>
        ) : cuts.length === 0 ? (
          <p className="text-[10px] leading-snug text-zinc-500">
            No cuts yet. Record one above to capture your view changes over time.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {cuts.map((c) => {
              const isPlaying = c.id === playingId;
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-black/25 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-zinc-100">
                      {c.name}
                    </p>
                    <p className="text-[9px] text-zinc-500">
                      {c.track.length} event{c.track.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlayingId(isPlaying ? null : c.id)}
                    className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                      isPlaying
                        ? "border-amber-500/45 bg-amber-950/45 text-amber-100 hover:bg-amber-900/55"
                        : "border-blue-500/40 bg-blue-950/50 text-blue-100 hover:bg-blue-900/55"
                    }`}
                  >
                    {isPlaying ? "Stop" : "Play Cut"}
                  </button>
                </li>
              );
            })}
          </ul>
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
