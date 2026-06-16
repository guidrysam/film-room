"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  datetimeLocalValueToIso,
  estimateClockSync,
  formatTimelineSeconds,
  gameTimeToSourceTime,
  isoToDatetimeLocalValue,
  sourceTimeToGameTime,
  syncStatusBadgeClass,
  syncStatusLabel,
  type GameSourceSyncStatus,
} from "@/lib/game-timeline";
import {
  updateGameSourceSync,
  type Game,
  type GameVideoSource,
} from "@/lib/games";

export type GameSourceDetailProps = {
  game: Game;
  source: GameVideoSource;
  canEdit: boolean;
  onSaved?: () => void;
  onClose?: () => void;
};

const inputClass =
  "w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50 disabled:opacity-50";

const nudgeBtn =
  "rounded border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40";

const SYNC_OPTIONS: GameSourceSyncStatus[] = [
  "unsynced",
  "clock_synced",
  "manually_synced",
  "audio_synced",
];

/**
 * Source detail panel: edit sync offset, recorded start, sync status, and nudge.
 */
export default function GameSourceDetail({
  game,
  source,
  canEdit,
  onSaved,
  onClose,
}: GameSourceDetailProps) {
  const [offset, setOffset] = useState(String(source.offsetFromGameTime ?? 0));
  const [recordedLocal, setRecordedLocal] = useState(
    isoToDatetimeLocalValue(source.recordedStartTime),
  );
  const [syncStatus, setSyncStatus] = useState<GameSourceSyncStatus>(
    source.syncStatus ?? "unsynced",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOffset(String(source.offsetFromGameTime ?? 0));
    setRecordedLocal(isoToDatetimeLocalValue(source.recordedStartTime));
    setSyncStatus(source.syncStatus ?? "unsynced");
  }, [source]);

  const offsetNum = useMemo(() => {
    const n = Number(offset);
    return Number.isFinite(n) ? n : 0;
  }, [offset]);

  const previewSource = useMemo(
    () => ({ offsetFromGameTime: offsetNum }),
    [offsetNum],
  );

  const clockSyncAvailable = useMemo(() => {
    const recordedIso = datetimeLocalValueToIso(recordedLocal);
    return estimateClockSync(
      { scheduledStartAt: game.scheduledStartAt },
      { recordedStartTime: recordedIso },
    );
  }, [game.scheduledStartAt, recordedLocal]);

  const savePatch = useCallback(
    async (patch: Parameters<typeof updateGameSourceSync>[2]) => {
      setSaving(true);
      setError(null);
      try {
        await updateGameSourceSync(game.id, source.id, patch);
        onSaved?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      } finally {
        setSaving(false);
      }
    },
    [game.id, source.id, onSaved],
  );

  const handleSave = useCallback(async () => {
    const recordedIso = datetimeLocalValueToIso(recordedLocal);
    let nextOffset = offsetNum;
    let nextStatus = syncStatus;
    let nextConfidence = source.syncConfidence;

    const autoClock =
      recordedIso && game.scheduledStartAt && syncStatus !== "manually_synced"
        ? estimateClockSync(
            { scheduledStartAt: game.scheduledStartAt },
            { recordedStartTime: recordedIso },
          )
        : null;

    if (autoClock && syncStatus !== "manually_synced") {
      nextOffset = autoClock.offsetFromGameTime;
      nextStatus = "clock_synced";
      nextConfidence = autoClock.syncConfidence;
      setOffset(String(nextOffset));
      setSyncStatus("clock_synced");
    }

    await savePatch({
      offsetFromGameTime: nextOffset,
      ...(recordedIso ? { recordedStartTime: recordedIso } : { recordedStartTime: "" }),
      syncStatus: nextStatus,
      ...(nextConfidence ? { syncConfidence: nextConfidence } : {}),
    });
  }, [
    recordedLocal,
    offsetNum,
    syncStatus,
    game.scheduledStartAt,
    source.syncConfidence,
    savePatch,
  ]);

  const handleApplyClockSync = useCallback(async () => {
    if (!clockSyncAvailable) return;
    setOffset(String(clockSyncAvailable.offsetFromGameTime));
    setSyncStatus("clock_synced");
    await savePatch({
      offsetFromGameTime: clockSyncAvailable.offsetFromGameTime,
      recordedStartTime: datetimeLocalValueToIso(recordedLocal),
      syncStatus: "clock_synced",
      syncConfidence: clockSyncAvailable.syncConfidence,
    });
  }, [clockSyncAvailable, recordedLocal, savePatch]);

  const handleNudge = useCallback(
    async (deltaSec: number) => {
      const next = offsetNum + deltaSec;
      setOffset(String(next));
      setSyncStatus("manually_synced");
      await savePatch({
        offsetFromGameTime: next,
        syncStatus: "manually_synced",
      });
    },
    [offsetNum, savePatch],
  );

  return (
    <div className="mt-2 rounded-md border border-blue-500/25 bg-blue-950/15 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-zinc-200">
            {source.label}
          </span>
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${syncStatusBadgeClass(source.syncStatus)}`}
          >
            {syncStatusLabel(source.syncStatus)}
          </span>
          {source.syncConfidence ? (
            <span className="text-[9px] text-zinc-500">
              {source.syncConfidence} confidence
            </span>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] text-zinc-400 hover:text-zinc-200"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-500">
        <div className="rounded border border-white/[0.06] bg-black/20 px-2 py-1">
          <span className="text-zinc-400">Game 0:00 →</span> Source{" "}
          {formatTimelineSeconds(gameTimeToSourceTime(0, previewSource))}
        </div>
        <div className="rounded border border-white/[0.06] bg-black/20 px-2 py-1">
          <span className="text-zinc-400">Source 0:00 →</span> Game{" "}
          {formatTimelineSeconds(sourceTimeToGameTime(0, previewSource))}
        </div>
      </div>

      {canEdit ? (
        <div className="space-y-2">
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-zinc-400">
              Offset from game time (seconds)
            </label>
            <input
              type="number"
              step="0.1"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              disabled={saving}
              className={inputClass}
            />
            <p className="mt-0.5 text-[9px] text-zinc-600">
              Added to game time to reach this source&apos;s playback position.
            </p>
          </div>

          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-zinc-400">
              Recording started at
            </label>
            <input
              type="datetime-local"
              value={recordedLocal}
              onChange={(e) => setRecordedLocal(e.target.value)}
              disabled={saving}
              className={inputClass}
            />
            {game.scheduledStartAt ? (
              <p className="mt-0.5 text-[9px] text-zinc-600">
                Game kickoff: {game.scheduledStartAt}
              </p>
            ) : (
              <p className="mt-0.5 text-[9px] text-amber-200/80">
                Set scheduled start on the game for auto clock sync.
              </p>
            )}
          </div>

          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-zinc-400">
              Sync status
            </label>
            <select
              value={syncStatus}
              onChange={(e) =>
                setSyncStatus(e.target.value as GameSourceSyncStatus)
              }
              disabled={saving}
              className={inputClass}
            >
              {SYNC_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {syncStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-medium text-zinc-400">Nudge offset</p>
            <div className="flex flex-wrap gap-1">
              {([-5, -1, 1, 5] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={saving}
                  onClick={() => void handleNudge(d)}
                  className={nudgeBtn}
                >
                  {d > 0 ? `+${d}s` : `${d}s`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-md border border-emerald-500/40 bg-emerald-950/45 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-900/55 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save sync"}
            </button>
            {clockSyncAvailable ? (
              <button
                type="button"
                onClick={() => void handleApplyClockSync()}
                disabled={saving}
                className="rounded-md border border-sky-500/40 bg-sky-950/45 px-2.5 py-1 text-[11px] font-semibold text-sky-100 transition hover:bg-sky-900/55 disabled:opacity-40"
              >
                Apply clock sync
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-zinc-500">
          <p>Offset: {offsetNum}s</p>
          {source.recordedStartTime ? (
            <p>Recorded: {source.recordedStartTime}</p>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="mt-2 text-[10px] text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
