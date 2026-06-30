"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTimelineSeconds } from "@/lib/game-timeline";
import { addGameEvent, type Game } from "@/lib/games";
import {
  formatClock,
  listTimelines,
  markEpochMs,
  type CoachTimeline,
} from "@/lib/timelines";
import { isoHasTimeOfDay } from "@/lib/youtube-clock-sync";

export type ImportTagPlaysProps = {
  game: Game;
  currentUid: string;
  currentDisplayName?: string | null;
  canEdit: boolean;
  onImported?: () => void;
};

const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

const selectClass =
  "w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50";

/** Firestore-safe deterministic id so re-importing upserts instead of duplicating. */
function eventIdFor(timelineId: string, markId: string): string {
  return `tp_${timelineId}_${markId}`.replace(/[/.#$[\]]/g, "_").slice(0, 200);
}

/**
 * Bridge: pull a saved Tag Plays (Coach Mark) timeline onto this game as
 * tagged-play events on the game clock. Uses each mark's canonical wall-clock
 * timestamp against the game's kickoff when known, else the timeline's own
 * elapsed clock (which starts at kickoff).
 */
export default function ImportTagPlays({
  game,
  currentUid,
  currentDisplayName,
  canEdit,
  onImported,
}: ImportTagPlaysProps) {
  const [expanded, setExpanded] = useState(false);
  const [timelines, setTimelines] = useState<CoachTimeline[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [shiftSec, setShiftSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // localStorage is client-only — read after mount, when the panel opens.
  useEffect(() => {
    if (!expanded) return;
    const all = listTimelines();
    setTimelines(all);
    setSelectedId((prev) =>
      prev && all.some((t) => t.id === prev) ? prev : (all[0]?.id ?? ""),
    );
  }, [expanded]);

  const timeline = useMemo(
    () => timelines.find((t) => t.id === selectedId) ?? null,
    [timelines, selectedId],
  );

  const kickoffMs = useMemo(() => {
    if (!isoHasTimeOfDay(game.scheduledStartAt)) return null;
    const ms = Date.parse(game.scheduledStartAt!.trim());
    return Number.isFinite(ms) ? ms : null;
  }, [game.scheduledStartAt]);

  const marks = useMemo(() => {
    if (!timeline) return [];
    return [...timeline.events]
      .map((e) => {
        const base =
          kickoffMs != null
            ? (markEpochMs(timeline.createdAt, e) - kickoffMs) / 1000
            : e.offsetSec;
        return {
          id: e.id,
          label: e.label,
          t: Math.max(0, Math.round(base + shiftSec)),
        };
      })
      .sort((a, b) => a.t - b.t);
  }, [timeline, kickoffMs, shiftSec]);

  const handleImport = useCallback(async () => {
    if (!timeline || marks.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      for (const m of marks) {
        await addGameEvent(
          game.id,
          {
            id: eventIdFor(timeline.id, m.id),
            type: "coach_mark",
            t: m.t,
            label: m.label,
            payload: { importedFromTimeline: timeline.id, source: "tag_plays" },
            createdBy: currentUid,
            ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
          },
          { actorUid: currentUid },
        );
      }
      setMessage(
        `Added ${marks.length} tagged ${marks.length === 1 ? "play" : "plays"} to this game.`,
      );
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import the timeline.");
    } finally {
      setBusy(false);
    }
  }, [timeline, marks, game.id, currentUid, currentDisplayName, onImported]);

  if (!canEdit) return null;

  return (
    <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Import from Tag Plays
          </span>
          <span className="mt-0.5 block text-[11px] text-zinc-500">
            Drop a timeline you tagged live onto this game&apos;s clock as
            tagged plays.
          </span>
        </span>
        <span className="shrink-0 text-zinc-400" aria-hidden>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded ? (
        timelines.length === 0 ? (
          <p className="mt-3 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-400">
            No saved Tag Plays timelines on this device. Record one with Tag
            Plays during a game, then import it here.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Timeline
              </span>
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setMessage(null);
                }}
                className={selectClass}
              >
                {timelines.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.events.length} marks
                  </option>
                ))}
              </select>
            </label>

            <p className="rounded-md border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-400">
              {kickoffMs != null ? (
                <>
                  Aligning to this game&apos;s kickoff time using each
                  mark&apos;s real-clock timestamp.
                </>
              ) : (
                <>
                  This game has no kickoff time set, so marks land at their
                  elapsed time (assumes you started the timeline at kickoff).
                  Nudge below if needed.
                </>
              )}
            </p>

            <label className="flex items-center gap-2 text-[11px] text-zinc-400">
              Shift all marks
              <input
                type="number"
                value={shiftSec}
                onChange={(e) => setShiftSec(Number(e.target.value) || 0)}
                className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/40"
              />
              seconds
            </label>

            {marks.length > 0 ? (
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Preview — game clock
                </p>
                <ul className="max-h-44 space-y-1 overflow-y-auto">
                  {marks.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded border border-white/[0.05] bg-black/30 px-2 py-1 text-[11px]"
                    >
                      <span className="truncate text-zinc-200">{m.label}</span>
                      <span className="shrink-0 font-mono tabular-nums text-zinc-400">
                        {formatTimelineSeconds(m.t)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-500">
                {timeline
                  ? `${formatClock(timeline.durationSec)} recorded`
                  : null}
              </span>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={busy || marks.length === 0}
                className={primaryBtn}
              >
                {busy
                  ? "Importing…"
                  : `Add ${marks.length} tagged ${marks.length === 1 ? "play" : "plays"}`}
              </button>
            </div>

            {message ? (
              <p className="rounded-md border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-100">
                {message} Re-importing the same timeline updates them in place.
              </p>
            ) : null}
            {error ? (
              <p className="text-[11px] leading-snug text-rose-300">{error}</p>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  );
}
