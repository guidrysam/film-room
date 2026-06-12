"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDirectorTrackEvent,
  compactDirectorTrackEvents,
  type DirectorTrackEvent,
} from "@/lib/director-track";
import { createDirectorTrack, type CutVisibility } from "@/lib/games";

/** A point-in-time snapshot of what the recorder should capture. */
export type CutSnapshot = {
  /** Canonical game time in seconds. */
  t: number;
  /** Current layout, e.g. "single" | "multi". */
  layout?: string;
  /** Currently active camera/source id. */
  activeSource?: string;
  /** Focused player-view source id (multi-angle rooms). */
  playerView?: string;
};

type RecorderStatus = "idle" | "recording" | "paused" | "saved";

const SAMPLE_INTERVAL_MS = 600;

export type CutRecorderProps = {
  /** Game this cut belongs to. When null, recording works but saving is disabled. */
  gameId: string | null;
  /** Author uid (passed to the saved cut). */
  userId: string;
  /** Author display name (captured on the saved cut for attribution). */
  userName?: string;
  /** Reads the current viewing state. Resolved on each sample tick. */
  getSnapshot: () => Promise<CutSnapshot> | CutSnapshot;
  /** Called after a cut is saved to Firestore (newCutId). */
  onSaved?: (cutId: string) => void;
};

/**
 * Records a Director Track / User Cut by sampling the current viewing state
 * over game time. It captures layout, active-camera, and player-view changes
 * (and manual notes) as timeline events — never rendered video. Consecutive
 * identical instructions are deduped by `addDirectorTrackEvent`.
 */
export default function CutRecorder({
  gameId,
  userId,
  userName,
  getSnapshot,
  onSaved,
}: CutRecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [events, setEvents] = useState<DirectorTrackEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [visibility, setVisibility] = useState<CutVisibility>("private");

  const sampleInFlight = useRef(false);

  const sample = useCallback(async () => {
    if (sampleInFlight.current) return;
    sampleInFlight.current = true;
    try {
      const snap = await getSnapshot();
      if (!snap || typeof snap.t !== "number" || !Number.isFinite(snap.t)) return;
      setEvents((prev) => {
        let next = prev;
        if (snap.layout) {
          next = addDirectorTrackEvent(next, {
            t: snap.t,
            type: "layout",
            layout: snap.layout,
          });
        }
        if (snap.activeSource) {
          next = addDirectorTrackEvent(next, {
            t: snap.t,
            type: "camera_switch",
            activeSource: snap.activeSource,
          });
        }
        if (snap.playerView) {
          next = addDirectorTrackEvent(next, {
            t: snap.t,
            type: "player_view",
            playerView: snap.playerView,
          });
        }
        return next;
      });
    } catch {
      /* Snapshot read failed — skip this tick. */
    } finally {
      sampleInFlight.current = false;
    }
  }, [getSnapshot]);

  // Sample on an interval while actively recording.
  useEffect(() => {
    if (status !== "recording") return;
    void sample();
    const id = window.setInterval(() => void sample(), SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [status, sample]);

  const handleStart = useCallback(() => {
    setError(null);
    setEvents([]);
    setSavedCount(0);
    setStatus("recording");
  }, []);

  const handlePause = useCallback(() => setStatus("paused"), []);
  const handleResume = useCallback(() => setStatus("recording"), []);

  const handleCancel = useCallback(() => {
    setStatus("idle");
    setEvents([]);
    setError(null);
  }, []);

  const handleAddNote = useCallback(async () => {
    const text = window.prompt("Note for this moment:");
    const note = text?.trim();
    if (!note) return;
    try {
      const snap = await getSnapshot();
      const t =
        typeof snap?.t === "number" && Number.isFinite(snap.t) ? snap.t : 0;
      setEvents((prev) =>
        addDirectorTrackEvent(prev, { t, type: "note", note }),
      );
    } catch {
      /* Could not resolve time for the note. */
    }
  }, [getSnapshot]);

  const handleSave = useCallback(async () => {
    if (!gameId) return;
    const compacted = compactDirectorTrackEvents(events);
    if (compacted.length === 0) {
      setError("Nothing to save yet — change a layout or camera first.");
      return;
    }
    const name =
      window.prompt("Name this cut:", "Untitled cut")?.trim() || "Untitled cut";
    setSaving(true);
    setError(null);
    try {
      const cutId = await createDirectorTrack(gameId, {
        name,
        visibility,
        track: compacted,
        createdBy: userId,
        ...(userName ? { createdByName: userName } : {}),
      });
      setSavedCount(compacted.length);
      setStatus("saved");
      onSaved?.(cutId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save cut.");
    } finally {
      setSaving(false);
    }
  }, [events, gameId, userId, userName, visibility, onSaved]);

  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isActive = isRecording || isPaused;

  const btnBase =
    "rounded-md px-2.5 py-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/25 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isRecording
                ? "animate-pulse bg-red-500"
                : isPaused
                  ? "bg-amber-400"
                  : status === "saved"
                    ? "bg-emerald-400"
                    : "bg-zinc-600"
            }`}
            aria-hidden
          />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
            {status === "saved"
              ? `Cut saved (${savedCount} events)`
              : isRecording
                ? "Recording cut"
                : isPaused
                  ? "Paused"
                  : "Record a cut"}
          </span>
        </div>
        {isActive ? (
          <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
            {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {isActive ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Visibility
          </span>
          <div className="flex gap-1">
            {(
              [
                ["private", "Private"],
                ["game", "Game Visible"],
              ] as const
            ).map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => setVisibility(val)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                  visibility === val
                    ? "border border-blue-500/55 bg-blue-600/25 text-white"
                    : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {status === "idle" || status === "saved" ? (
          <button
            type="button"
            onClick={handleStart}
            className={`${btnBase} border border-red-500/45 bg-red-950/45 text-red-100 hover:bg-red-900/55`}
          >
            ● Start Cut
          </button>
        ) : null}

        {isRecording ? (
          <button
            type="button"
            onClick={handlePause}
            className={`${btnBase} border border-amber-500/45 bg-amber-950/40 text-amber-100 hover:bg-amber-900/55`}
          >
            Pause
          </button>
        ) : null}

        {isPaused ? (
          <button
            type="button"
            onClick={handleResume}
            className={`${btnBase} border border-blue-500/45 bg-blue-950/45 text-blue-100 hover:bg-blue-900/55`}
          >
            Resume
          </button>
        ) : null}

        {isActive ? (
          <>
            <button
              type="button"
              onClick={() => void handleAddNote()}
              className={`${btnBase} border border-white/12 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]`}
            >
              Add Note
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !gameId}
              className={`${btnBase} border border-emerald-500/45 bg-emerald-950/45 text-emerald-100 hover:bg-emerald-900/55`}
            >
              {saving ? "Saving…" : "Save Cut"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className={`${btnBase} border border-white/12 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]`}
            >
              Cancel
            </button>
          </>
        ) : null}
      </div>

      {isActive && !gameId ? (
        <p className="mt-2 text-[10px] leading-snug text-amber-300/90">
          Open this room from a Game (with <span className="font-mono">?gameId</span>)
          to save cuts. Recording works, but saving is disabled.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-[10px] leading-snug text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
