"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import YouTube, { type YouTubePlayer } from "react-youtube";
import { auth } from "@/lib/firebase";
import {
  formatTimelineSeconds,
  sourceTimeToGameTime,
  syncStatusBadgeClass,
  syncStatusLabel,
} from "@/lib/game-timeline";
import { YOUTUBE_CHROMELESS_PLAYER_VARS } from "@/lib/youtube-player-vars";
import YoutubeChromelessStage from "@/components/YoutubeChromelessStage";
import {
  updateGameSourceSync,
  type Game,
  type GameVideoSource,
} from "@/lib/games";
import { gameSourceToVideoAngle } from "@/lib/video-angle";

export type AngleMatchSyncProps = {
  game: Game;
  /** Playable YouTube sources for this game. */
  sources: GameVideoSource[];
  canEdit: boolean;
  onSaved?: () => void;
};

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50";

const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

const selectClass =
  "w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50";

/** A source counts as an anchor if it is aligned to game time. */
function isAnchored(s: GameVideoSource): boolean {
  return (
    s.syncStatus === "clock_synced" ||
    s.syncStatus === "manually_synced" ||
    s.syncStatus === "audio_synced"
  );
}

async function readPlayerTime(player: YouTubePlayer | null): Promise<number> {
  if (!player) return 0;
  try {
    const t = await player.getCurrentTime();
    return typeof t === "number" && Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

async function readPlayerDuration(player: YouTubePlayer | null): Promise<number> {
  if (!player) return 0;
  try {
    const d = await player.getDuration();
    return typeof d === "number" && Number.isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}

function SyncPlayerScrub({
  ready,
  time,
  duration,
  onTimeChange,
}: {
  ready: boolean;
  time: number;
  duration: number;
  onTimeChange: (next: number) => void;
}) {
  const max = duration > 0 ? duration : Math.max(time, 1);
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(time, max)}
        disabled={!ready}
        onChange={(e) => onTimeChange(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-blue-500 disabled:opacity-40"
        aria-label="Scrub video"
      />
    </div>
  );
}

/**
 * "Match to another angle" — line up a clip that has no timestamp by matching a
 * shared moment to an already-aligned reference angle. Scrub both players to the
 * same instant; the offset is `targetTime − referenceGameTime`.
 */
export default function AngleMatchSync({
  game,
  sources,
  canEdit,
  onSaved,
}: AngleMatchSyncProps) {
  const [expanded, setExpanded] = useState(false);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [refTime, setRefTime] = useState(0);
  const [targetTime, setTargetTime] = useState(0);
  const [refDuration, setRefDuration] = useState(0);
  const [targetDuration, setTargetDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOffset, setSavedOffset] = useState<number | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [refReady, setRefReady] = useState(false);
  const [targetReady, setTargetReady] = useState(false);

  const refPlayer = useRef<YouTubePlayer | null>(null);
  const targetPlayer = useRef<YouTubePlayer | null>(null);

  const playable = useMemo(
    () => sources.filter((s) => gameSourceToVideoAngle(s) != null),
    [sources],
  );
  const anchored = useMemo(() => playable.filter(isAnchored), [playable]);
  const referenceOptions = useMemo(
    () => (anchored.length > 0 ? anchored : playable),
    [anchored, playable],
  );

  const reference = useMemo(
    () => playable.find((s) => s.id === referenceId) ?? null,
    [playable, referenceId],
  );
  const target = useMemo(
    () => playable.find((s) => s.id === targetId) ?? null,
    [playable, targetId],
  );

  // Sensible defaults: reference = first aligned angle, or first playable when none yet.
  useEffect(() => {
    if (!expanded) return;
    setReferenceId((prev) =>
      prev && referenceOptions.some((s) => s.id === prev)
        ? prev
        : (referenceOptions[0]?.id ?? null),
    );
  }, [expanded, referenceOptions]);

  useEffect(() => {
    if (!expanded) return;
    setTargetId((prev) => {
      if (prev && playable.some((s) => s.id === prev) && prev !== referenceId) {
        return prev;
      }
      const firstOther =
        playable.find((s) => s.id !== referenceId && !isAnchored(s)) ??
        playable.find((s) => s.id !== referenceId);
      return firstOther?.id ?? null;
    });
  }, [expanded, playable, referenceId]);

  useEffect(() => {
    setRefReady(false);
  }, [referenceId]);

  useEffect(() => {
    setTargetReady(false);
  }, [targetId]);

  // Poll both players for a live time readout while open.
  useEffect(() => {
    if (!expanded) return;
    const id = window.setInterval(() => {
      void readPlayerTime(refPlayer.current).then(setRefTime);
      void readPlayerTime(targetPlayer.current).then(setTargetTime);
      void readPlayerDuration(refPlayer.current).then(setRefDuration);
      void readPlayerDuration(targetPlayer.current).then(setTargetDuration);
    }, 250);
    return () => window.clearInterval(id);
  }, [expanded, referenceId, targetId]);

  const referenceGameTime = useMemo(() => {
    if (!reference) return null;
    return sourceTimeToGameTime(refTime, reference);
  }, [reference, refTime]);

  const computedOffset = useMemo(() => {
    if (referenceGameTime == null) return null;
    return Math.round((targetTime - referenceGameTime) * 100) / 100;
  }, [referenceGameTime, targetTime]);

  const seekRefPlayer = useCallback((sec: number) => {
    const clamped = Math.max(0, refDuration > 0 ? Math.min(sec, refDuration) : sec);
    setRefTime(clamped);
    try {
      refPlayer.current?.seekTo(clamped, true);
    } catch {
      /* not ready */
    }
  }, [refDuration]);

  const seekTargetPlayer = useCallback((sec: number) => {
    const clamped = Math.max(
      0,
      targetDuration > 0 ? Math.min(sec, targetDuration) : sec,
    );
    setTargetTime(clamped);
    try {
      targetPlayer.current?.seekTo(clamped, true);
    } catch {
      /* not ready */
    }
  }, [targetDuration]);

  const handleApply = useCallback(async () => {
    if (!target || referenceGameTime == null || computedOffset == null) return;
    if (target.id === referenceId) {
      setError("Pick two different angles.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateGameSourceSync(game.id, target.id, {
        offsetFromGameTime: computedOffset,
        syncStatus: "manually_synced",
        syncConfidence: "high",
      });
      if (reference && !isAnchored(reference)) {
        await updateGameSourceSync(game.id, reference.id, {
          syncStatus: "manually_synced",
          syncConfidence: "high",
        });
      }
      setSavedOffset(computedOffset);
      setAudioNote(null);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the alignment.");
    } finally {
      setSaving(false);
    }
  }, [target, reference, referenceId, referenceGameTime, computedOffset, game.id, onSaved]);

  const handleAudioSync = useCallback(async () => {
    if (!reference || !target || reference.id === target.id) {
      setError("Pick two different YouTube angles.");
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setError("Sign in required.");
      return;
    }
    setAudioBusy(true);
    setError(null);
    setAudioNote(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/sync/audio-align", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameId: game.id,
          referenceSourceId: reference.id,
          targetSourceId: target.id,
          windowStartSec: 0,
          windowDurationSec: 900,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        offsetFromGameTime?: number;
        confidence?: number;
        syncConfidence?: "high" | "medium" | "low";
        note?: string;
        lagSec?: number;
      };
      if (!res.ok) {
        throw new Error(data.error || "Audio sync failed.");
      }
      if (typeof data.offsetFromGameTime !== "number") {
        throw new Error("Audio sync returned no offset.");
      }
      await updateGameSourceSync(game.id, target.id, {
        offsetFromGameTime: data.offsetFromGameTime,
        syncStatus: "audio_synced",
        syncConfidence: data.syncConfidence ?? "medium",
      });
      if (!isAnchored(reference)) {
        await updateGameSourceSync(game.id, reference.id, {
          syncStatus: "audio_synced",
          syncConfidence: data.syncConfidence ?? "medium",
        });
      }
      setSavedOffset(data.offsetFromGameTime);
      setAudioNote(
        data.note ??
          `Audio sync offset ${data.offsetFromGameTime >= 0 ? "+" : ""}${data.offsetFromGameTime}s`,
      );
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio sync failed.");
    } finally {
      setAudioBusy(false);
    }
  }, [reference, target, game.id, onSaved]);

  if (!canEdit || playable.length < 2) return null;

  const refAngle = reference ? gameSourceToVideoAngle(reference) : null;
  const targetAngle = target ? gameSourceToVideoAngle(target) : null;

  return (
    <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Sync angles
          </span>
          <span className="mt-0.5 block text-[11px] text-zinc-500">
            Auto-align by shared audio, or scrub both clips to the same moment.
          </span>
        </span>
        <span className="shrink-0 text-zinc-400" aria-hidden>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-3">
          {anchored.length === 0 ? (
            <p className="rounded-md border border-amber-500/25 bg-amber-950/15 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100">
              No angle is marked lined up yet. Pick a reference angle below —
              its current video time becomes game time — then match the other
              clip to the same moment.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Reference angle
              </span>
              <select
                value={referenceId ?? ""}
                onChange={(e) => setReferenceId(e.target.value || null)}
                className={selectClass}
              >
                {referenceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {syncStatusLabel(s.syncStatus)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Angle to line up
              </span>
                <select
                  value={targetId ?? ""}
                  onChange={(e) => {
                    setTargetId(e.target.value || null);
                    setSavedOffset(null);
                  }}
                  className={selectClass}
                >
                  {playable
                    .filter((s) => s.id !== referenceId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} · {syncStatusLabel(s.syncStatus)}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <p className="rounded-md border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-400">
              Prefer{" "}
              <span className="font-medium text-zinc-200">Audio sync</span>{" "}
              (shared whistle/crowd). Or scrub{" "}
              <span className="font-medium text-zinc-200">both</span> videos to
              the same instant and click{" "}
              <span className="font-medium text-zinc-200">
                “These are the same moment”
              </span>
              .
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleAudioSync()}
                disabled={
                  audioBusy ||
                  saving ||
                  !reference ||
                  !target ||
                  target.id === reference.id
                }
                className={primaryBtn}
              >
                {audioBusy ? "Listening…" : "Audio sync"}
              </button>
              <span className="text-[10px] text-zinc-500">
                Matches loud peaks (whistle/cheer) across angles — no AI credits.
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Reference */}
              <div className="rounded-md border border-white/[0.06] bg-black/25 p-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-zinc-200">
                    {reference?.label ?? "Reference"}
                  </span>
                  {reference ? (
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${syncStatusBadgeClass(reference.syncStatus)}`}
                    >
                      {syncStatusLabel(reference.syncStatus)}
                    </span>
                  ) : null}
                </div>
                {refAngle ? (
                  <YoutubeChromelessStage className="aspect-video w-full rounded">
                    <YouTube
                      key={refAngle.videoId}
                      videoId={refAngle.videoId}
                      className="h-full w-full"
                      iframeClassName="h-full w-full"
                      opts={{
                        width: "100%",
                        height: "100%",
                        playerVars: YOUTUBE_CHROMELESS_PLAYER_VARS,
                      }}
                      onReady={(e) => {
                        refPlayer.current = e.target;
                        setRefReady(true);
                      }}
                    />
                  </YoutubeChromelessStage>
                ) : null}
                <SyncPlayerScrub
                  ready={refReady}
                  time={refTime}
                  duration={refDuration}
                  onTimeChange={seekRefPlayer}
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Video {formatTimelineSeconds(refTime)} →{" "}
                  <span className="text-zinc-300">
                    game{" "}
                    {referenceGameTime != null
                      ? formatTimelineSeconds(Math.max(0, referenceGameTime))
                      : "—"}
                  </span>
                </p>
              </div>

              {/* Target */}
              <div className="rounded-md border border-white/[0.06] bg-black/25 p-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-zinc-200">
                    {target?.label ?? "Target"}
                  </span>
                  {target ? (
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${syncStatusBadgeClass(target.syncStatus)}`}
                    >
                      {syncStatusLabel(target.syncStatus)}
                    </span>
                  ) : null}
                </div>
                {targetAngle ? (
                  <YoutubeChromelessStage className="aspect-video w-full rounded">
                    <YouTube
                      key={targetAngle.videoId}
                      videoId={targetAngle.videoId}
                      className="h-full w-full"
                      iframeClassName="h-full w-full"
                      opts={{
                        width: "100%",
                        height: "100%",
                        playerVars: YOUTUBE_CHROMELESS_PLAYER_VARS,
                      }}
                      onReady={(e) => {
                        targetPlayer.current = e.target;
                        setTargetReady(true);
                      }}
                    />
                  </YoutubeChromelessStage>
                ) : null}
                <SyncPlayerScrub
                  ready={targetReady}
                  time={targetTime}
                  duration={targetDuration}
                  onTimeChange={seekTargetPlayer}
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Video {formatTimelineSeconds(targetTime)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-400">
                {computedOffset != null
                  ? `New offset: ${computedOffset >= 0 ? "+" : ""}${computedOffset}s`
                  : "Set both videos to the same moment."}
              </p>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={saving || !target || target.id === referenceId}
                className={primaryBtn}
              >
                {saving ? "Saving…" : "These are the same moment"}
              </button>
            </div>

            {savedOffset != null ? (
              <p className="rounded-md border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-100">
                Lined up — {target?.label} now follows the game clock (offset{" "}
                {savedOffset >= 0 ? "+" : ""}
                {savedOffset}s). Switch angles in review to check it.
                {audioNote ? (
                  <span className="mt-1 block text-emerald-100/70">{audioNote}</span>
                ) : null}
              </p>
            ) : null}

            {error ? (
              <p className="text-[11px] leading-snug text-rose-300">{error}</p>
            ) : null}
        </div>
      ) : null}
    </section>
  );
}
