"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HighlightReelPlayer, {
  type HighlightReelPlayerHandle,
} from "@/components/HighlightReelPlayer";
import { teamFilmRoomRoute } from "@/lib/team-film-room";
import { formatTimelineSeconds } from "@/lib/game-timeline";
import {
  deleteDirectorTrack,
  updateDirectorTrack,
  type CutVisibility,
  type Game,
  type GameTimelineEvent,
  type GameVideoSource,
} from "@/lib/games";
import {
  buildReelSteps,
  createHighlightReel,
  HIGHLIGHT_SPEEDS,
  highlightMomentsToTrackEvents,
  listHighlightDrafts,
  normalizeHighlightRepeat,
  reelDurationSec,
  serializeHighlightDraftMeta,
  type AddHighlightMomentInput,
  type HighlightDraft,
  type HighlightMoment,
} from "@/lib/highlight-draft";
import {
  generatePresetMoments,
  HIGHLIGHT_PRESET_LIST,
  type HighlightPresetId,
} from "@/lib/highlight-presets";
import {
  formatHighlightMarkLabel,
  highlightMomentsFromGameMark,
  highlightMomentsFromGameMarks,
  isHighlightMarkEvent,
  listHighlightReelMarks,
  resolveHighlightMarkSourceId,
} from "@/lib/highlight-from-marks";
import { enrichReelStepsWithPlayerOverlays } from "@/lib/highlight-player-overlay";
import { buildReelTitleCard } from "@/lib/highlight-reel-cards";
import { getTeam, listTeamPlayers, type Player, type Team } from "@/lib/teams";
import {
  downloadRecording,
  isReelRecordingSupported,
  startReelRecording,
  type ReelRecordingController,
} from "@/lib/highlight-reel-record";
import { gameSourceToVideoAngle } from "@/lib/video-angle";

export type HighlightReelStudioProps = {
  gameId: string;
  game: Game;
  sources: GameVideoSource[];
  events: GameTimelineEvent[];
  currentUid: string;
  currentDisplayName?: string | null;
};

const panel =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";
const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/30";
const markPresetBtn =
  "rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40";
const markPresetBtnPrimary =
  "rounded-md border border-blue-500/45 bg-blue-950/40 px-2 py-0.5 text-[10px] font-semibold text-blue-100 transition hover:bg-blue-900/50 disabled:cursor-not-allowed disabled:opacity-40";

function localMomentId(): string {
  return `hm_${Math.random().toString(36).slice(2, 10)}`;
}

function inputToMoment(input: AddHighlightMomentInput): HighlightMoment {
  const repeat = normalizeHighlightRepeat(input.repeat);
  return {
    id: localMomentId(),
    gameTime: Math.max(0, input.gameTime),
    startOffsetSec: input.startOffsetSec ?? -5,
    endOffsetSec: input.endOffsetSec ?? 10,
    activeSourceId: input.activeSourceId,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.timelineEventId ? { timelineEventId: input.timelineEventId } : {}),
    ...(input.playerIds?.length ? { playerIds: input.playerIds } : {}),
    ...(input.goalPlayerIds?.length ? { goalPlayerIds: input.goalPlayerIds } : {}),
    ...(input.assistPlayerIds?.length
      ? { assistPlayerIds: input.assistPlayerIds }
      : {}),
    ...(input.speed !== undefined && input.speed !== 1 ? { speed: input.speed } : {}),
    ...(repeat !== 1 ? { repeat } : {}),
  };
}

function momentToInput(m: HighlightMoment): AddHighlightMomentInput {
  return {
    gameTime: m.gameTime,
    activeSourceId: m.activeSourceId,
    startOffsetSec: m.startOffsetSec,
    endOffsetSec: m.endOffsetSec,
    ...(m.label ? { label: m.label } : {}),
    ...(m.timelineEventId ? { timelineEventId: m.timelineEventId } : {}),
    ...(m.playerIds?.length ? { playerIds: m.playerIds } : {}),
    ...(m.goalPlayerIds?.length ? { goalPlayerIds: m.goalPlayerIds } : {}),
    ...(m.assistPlayerIds?.length ? { assistPlayerIds: m.assistPlayerIds } : {}),
    ...(m.speed !== undefined ? { speed: m.speed } : {}),
    ...(m.repeat !== undefined ? { repeat: m.repeat } : {}),
  };
}

/**
 * Highlight Reel Studio: any team member can stitch the game's angles into a
 * single cut. Each segment carries its own angle, in/out window, speed, and
 * repeat count. Presets auto-generate a styled multi-angle cut from one key
 * moment, the reel previews in an isolated player, and it can be screen
 * recorded to a downloadable file.
 */
export default function HighlightReelStudio({
  gameId,
  game,
  sources,
  events,
  currentUid,
  currentDisplayName,
}: HighlightReelStudioProps) {
  const playableSources = useMemo(
    () => sources.filter((s) => gameSourceToVideoAngle(s) != null),
    [sources],
  );

  const sourceOffsets = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of playableSources) map[s.id] = s.offsetFromGameTime ?? 0;
    return map;
  }, [playableSources]);

  const videoIdForSource = useCallback(
    (id: string) => playableSources.find((s) => s.id === id)?.videoId,
    [playableSources],
  );
  const labelForSource = useCallback(
    (id: string) => playableSources.find((s) => s.id === id)?.label,
    [playableSources],
  );

  const reelMarks = useMemo(() => listHighlightReelMarks(events), [events]);
  const rawMarkCount = useMemo(
    () => events.filter(isHighlightMarkEvent).length,
    [events],
  );

  const [reels, setReels] = useState<HighlightDraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("Highlight reel");
  const [visibility, setVisibility] = useState<CutVisibility>("private");
  const [moments, setMoments] = useState<HighlightMoment[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rosterPlayers, setRosterPlayers] = useState<Player[]>([]);
  const [team, setTeam] = useState<Team | null>(null);

  // Preset + segment-add controls.
  const [baseTimeStr, setBaseTimeStr] = useState("0");
  const [basePrimary, setBasePrimary] = useState<string>("");
  const [presetId, setPresetId] = useState<HighlightPresetId>("replay");
  const [bulkPresetId, setBulkPresetId] = useState<HighlightPresetId>("replay");

  // Recording.
  const [recording, setRecording] = useState(false);
  const [recordFocus, setRecordFocus] = useState(false);
  const [recordMessage, setRecordMessage] = useState<string | null>(null);
  const recordSupported = useMemo(() => isReelRecordingSupported(), []);
  const controllerRef = useRef<ReelRecordingController | null>(null);
  const recordingRef = useRef(false);
  const nameRef = useRef(name);
  nameRef.current = name;

  const playerRef = useRef<HighlightReelPlayerHandle | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const steps = useMemo(
    () => buildReelSteps(moments, sourceOffsets),
    [moments, sourceOffsets],
  );
  const playerNameForId = useCallback(
    (playerId: string) => rosterPlayers.find((p) => p.id === playerId)?.name,
    [rosterPlayers],
  );
  const previewSteps = useMemo(
    () => enrichReelStepsWithPlayerOverlays(steps, moments, playerNameForId),
    [steps, moments, playerNameForId],
  );
  const titleCard = useMemo(
    () => buildReelTitleCard(game, team, name),
    [game, team, name],
  );
  const totalDuration = useMemo(() => reelDurationSec(steps), [steps]);

  useEffect(() => {
    const teamId = game.teamId?.trim();
    if (!teamId) {
      setTeam(null);
      setRosterPlayers([]);
      return;
    }
    let cancelled = false;
    void getTeam(teamId)
      .then((loaded) => {
        if (!cancelled) setTeam(loaded);
      })
      .catch(() => {
        if (!cancelled) setTeam(null);
      });
    void listTeamPlayers(teamId)
      .then((players) => {
        if (!cancelled) setRosterPlayers(players);
      })
      .catch(() => {
        if (!cancelled) setRosterPlayers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [game.teamId]);

  useEffect(() => {
    if (!basePrimary && playableSources[0]) setBasePrimary(playableSources[0].id);
  }, [basePrimary, playableSources]);

  const refreshReels = useCallback(async () => {
    try {
      setReels(await listHighlightDrafts(gameId, currentUid));
    } catch {
      /* non-fatal */
    }
  }, [gameId, currentUid]);

  useEffect(() => {
    void refreshReels();
  }, [refreshReels]);

  const startNewReel = useCallback(() => {
    setEditingId(null);
    setName("Highlight reel");
    setVisibility("private");
    setMoments([]);
    setDirty(false);
    setMessage(null);
  }, []);

  const loadReel = useCallback((reel: HighlightDraft) => {
    setEditingId(reel.id);
    setName(reel.name);
    setMoments(reel.moments.map((m) => ({ ...m })));
    setDirty(false);
    setMessage(null);
  }, []);

  const mutateMoments = useCallback(
    (next: HighlightMoment[]) => {
      setMoments(next);
      setDirty(true);
    },
    [],
  );

  const addManualSegment = useCallback(() => {
    const t = Number(baseTimeStr);
    if (!Number.isFinite(t) || !basePrimary) return;
    mutateMoments([
      ...moments,
      inputToMoment({
        gameTime: Math.max(0, t),
        activeSourceId: basePrimary,
        startOffsetSec: -5,
        endOffsetSec: 10,
      }),
    ]);
  }, [baseTimeStr, basePrimary, moments, mutateMoments]);

  const applyPreset = useCallback(() => {
    const t = Number(baseTimeStr);
    if (!Number.isFinite(t) || !basePrimary) return;
    const generated = generatePresetMoments(
      presetId,
      {
        gameTime: Math.max(0, t),
        startOffsetSec: -5,
        endOffsetSec: 10,
        primarySourceId: basePrimary,
      },
      playableSources.map((s) => s.id),
    );
    mutateMoments([...moments, ...generated.map(inputToMoment)]);
    setMessage(`Added ${generated.length} styled segment${generated.length === 1 ? "" : "s"}.`);
  }, [baseTimeStr, basePrimary, presetId, playableSources, moments, mutateMoments]);

  const buildFromAllMarks = useCallback(
    (mode: "replace" | "append") => {
      if (!basePrimary || reelMarks.length === 0) return;
      const generated = highlightMomentsFromGameMarks(events, {
        primarySourceId: basePrimary,
        playableSourceIds: playableSources.map((s) => s.id),
        presetId: bulkPresetId,
      });
      if (generated.length === 0) {
        setMessage("No marks could be turned into clips.");
        return;
      }
      const nextMoments = generated.map(inputToMoment);
      if (mode === "replace") {
        setEditingId(null);
        setName(`${game.title.trim() || "Game"} highlights`);
        setVisibility("private");
        setMoments(nextMoments);
        setDirty(true);
      } else {
        mutateMoments([...moments, ...nextMoments]);
      }
      setMessage(
        mode === "replace"
          ? `Built a reel with ${nextMoments.length} segment${nextMoments.length === 1 ? "" : "s"} from ${reelMarks.length} event${reelMarks.length === 1 ? "" : "s"}.`
          : `Added ${nextMoments.length} segment${nextMoments.length === 1 ? "" : "s"} from ${reelMarks.length} event${reelMarks.length === 1 ? "" : "s"}.`,
      );
    },
    [
      basePrimary,
      reelMarks.length,
      events,
      playableSources,
      bulkPresetId,
      game.title,
      moments,
      mutateMoments,
    ],
  );

  const addMarkToReel = useCallback(
    (event: GameTimelineEvent, markPresetId: HighlightPresetId) => {
      if (!basePrimary) return;
      const generated = highlightMomentsFromGameMark(event, {
        primarySourceId: basePrimary,
        playableSourceIds: playableSources.map((s) => s.id),
        presetId: markPresetId,
      });
      if (generated.length === 0) {
        setMessage("Could not add that mark — no playable angle.");
        return;
      }
      mutateMoments([...moments, ...generated.map(inputToMoment)]);
      const presetName =
        HIGHLIGHT_PRESET_LIST.find((p) => p.id === markPresetId)?.name ??
        "segments";
      setMessage(
        `Added ${formatHighlightMarkLabel(event)} (${presetName}, ${generated.length} segment${generated.length === 1 ? "" : "s"}).`,
      );
    },
    [basePrimary, playableSources, moments, mutateMoments],
  );

  const updateMoment = useCallback(
    (id: string, patch: Partial<HighlightMoment>) => {
      mutateMoments(
        moments.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [moments, mutateMoments],
  );

  const removeMoment = useCallback(
    (id: string) => mutateMoments(moments.filter((m) => m.id !== id)),
    [moments, mutateMoments],
  );

  const moveMoment = useCallback(
    (index: number, dir: -1 | 1) => {
      const next = [...moments];
      const target = index + dir;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target]!, next[index]!];
      mutateMoments(next);
    },
    [moments, mutateMoments],
  );

  const persistReel = useCallback(async (): Promise<string | null> => {
    if (moments.length === 0) {
      setMessage("Add at least one segment first.");
      return null;
    }
    setSaving(true);
    setMessage(null);
    try {
      let id = editingId;
      if (editingId) {
        await updateDirectorTrack(gameId, editingId, {
          name: name.trim() || "Highlight reel",
          visibility,
          track: highlightMomentsToTrackEvents(moments),
          description: serializeHighlightDraftMeta(moments),
        });
      } else {
        id = await createHighlightReel(gameId, currentUid, {
          name,
          moments: moments.map(momentToInput),
          visibility,
          ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
        });
        setEditingId(id);
      }
      setDirty(false);
      setMessage("Reel saved.");
      await refreshReels();
      return id;
    } catch {
      setMessage("Could not save the reel (check permissions / network).");
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    moments,
    editingId,
    gameId,
    name,
    visibility,
    currentUid,
    currentDisplayName,
    refreshReels,
  ]);

  const handleSave = useCallback(() => {
    void persistReel();
  }, [persistReel]);

  const [openingRoom, setOpeningRoom] = useState(false);
  const handlePlayInRoom = useCallback(async () => {
    setOpeningRoom(true);
    try {
      const id = editingId && !dirty ? editingId : await persistReel();
      if (!id) return;
      router.push(teamFilmRoomRoute(gameId, { reelId: id }));
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not open the room for this reel.",
      );
    } finally {
      setOpeningRoom(false);
    }
  }, [editingId, dirty, persistReel, gameId, router]);

  const handleDeleteReel = useCallback(
    async (reel: HighlightDraft) => {
      if (!window.confirm(`Delete "${reel.name}"? This can't be undone.`)) return;
      try {
        await deleteDirectorTrack(gameId, reel.id);
        if (editingId === reel.id) startNewReel();
        await refreshReels();
      } catch {
        /* non-fatal */
      }
    },
    [gameId, editingId, startNewReel, refreshReels],
  );

  const stopRecording = useCallback(async () => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    recordingRef.current = false;
    setRecording(false);
    setRecordFocus(false);
    playerRef.current?.stop();
    if (!controller) return;
    const rec = await controller.stop();
    if (rec) {
      downloadRecording(rec, nameRef.current || "highlight-reel");
      setRecordMessage("Saved the recording to your downloads.");
    } else {
      setRecordMessage("Recording was empty.");
    }
  }, []);

  const handleReelEnded = useCallback(() => {
    if (recordingRef.current) void stopRecording();
  }, [stopRecording]);

  const startRecording = useCallback(async () => {
    if (steps.length === 0) {
      setRecordMessage("Add segments before recording.");
      return;
    }
    setRecordMessage(null);
    setRecordFocus(true);
    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
      const cropElement = captureRef.current;
      if (!cropElement) {
        throw new Error("Reel preview is not ready to record.");
      }
      const controller = await startReelRecording({
        cropElement,
        onAutoStop: () => {
          recordingRef.current = false;
          setRecording(false);
          setRecordFocus(false);
          playerRef.current?.stop();
          setRecordMessage("Recording stopped.");
        },
      });
      controllerRef.current = controller;
      recordingRef.current = true;
      setRecording(true);
      window.setTimeout(() => playerRef.current?.play(), 450);
    } catch (e) {
      setRecordFocus(false);
      setRecording(false);
      setRecordMessage(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Tab capture was cancelled. Choose “This Tab” when prompted."
          : e instanceof Error
            ? e.message
            : "Could not start recording.",
      );
    }
  }, [steps.length]);

  useEffect(() => {
    return () => {
      controllerRef.current?.cancel();
    };
  }, []);

  if (playableSources.length === 0) {
    return (
      <div className={panel}>
        <p className="text-sm font-semibold text-zinc-100">Highlight reel</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          This game has no playable YouTube angles yet. Once parents add their
          clips to the game&apos;s shared pool, you can stitch them into a reel
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!recordFocus ? (
      <div className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100">
              Highlight Reel Studio
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Any team member can build a single cut from every angle. Pick a
              moment, choose a preset, fine-tune each segment&apos;s angle,
              speed, and repeats, then record the preview video.
            </p>
          </div>
          <button type="button" onClick={startNewReel} className={ghostBtn}>
            + New reel
          </button>
        </div>

        {reels.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {reels.map((r) => (
              <span key={r.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => loadReel(r)}
                  className={`rounded-l-md border px-2 py-1 text-[11px] font-semibold transition ${
                    editingId === r.id
                      ? "border-blue-500/55 bg-blue-600/25 text-white"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
                  }`}
                >
                  {r.name}
                  <span className="ml-1 text-[9px] text-zinc-500">
                    {r.moments.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteReel(r)}
                  title="Delete reel"
                  className="rounded-r-md border border-l-0 border-white/10 bg-white/[0.03] px-1.5 py-1 text-[11px] text-zinc-500 transition hover:bg-rose-950/40 hover:text-rose-200"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      ) : null}

      <div className={recordFocus ? "" : "grid gap-4 lg:grid-cols-2"}>
        {/* Preview + record */}
        <div
          className={
            recordFocus
              ? "fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black p-4 sm:p-8"
              : panel
          }
        >
          {!recordFocus ? (
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Preview
              </p>
              <span className="text-[10px] text-zinc-500">
                ~{formatTimelineSeconds(totalDuration)} total
              </span>
            </div>
          ) : (
            <p className="mb-3 text-center text-xs font-medium text-zinc-300">
              Recording preview — choose <span className="text-white">This Tab</span>{" "}
              when your browser asks what to share.
            </p>
          )}

          <div className={recordFocus ? "w-full max-w-5xl" : undefined}>
          <HighlightReelPlayer
            ref={playerRef}
            captureRef={captureRef}
            steps={previewSteps}
            titleCard={titleCard}
            videoIdForSource={videoIdForSource}
            labelForSource={labelForSource}
            onEnded={handleReelEnded}
          />
          </div>

          <div
            className={`flex flex-wrap items-center gap-2 ${recordFocus ? "mt-4 w-full max-w-5xl justify-center" : "mt-3"}`}
          >
            {recordSupported ? (
              <button
                type="button"
                onClick={() => (recording ? void stopRecording() : void startRecording())}
                disabled={steps.length === 0}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  recording
                    ? "border-red-500/50 bg-red-950/50 text-red-100 hover:bg-red-900/60"
                    : "border-white/12 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                }`}
              >
                {recording ? "■ Stop & save recording" : "● Record reel video"}
              </button>
            ) : (
              <p className="text-[10px] text-zinc-500">
                Recording isn&apos;t supported in this browser — use your
                device&apos;s screen recorder while the reel plays.
              </p>
            )}
            {recording ? (
              <span className="text-[10px] text-red-300">
                Recording the preview video only — not the whole screen.
              </span>
            ) : null}
            {!recordFocus ? (
              <button
                type="button"
                onClick={() => void handlePlayInRoom()}
                disabled={moments.length === 0 || openingRoom || recording}
                className={ghostBtn}
                title="Open the synced room so everyone watching sees this reel"
              >
                {openingRoom ? "Opening room…" : "Play in room (shared)"}
              </button>
            ) : null}
          </div>
          {recordMessage ? (
            <p
              className={`text-[10px] text-zinc-400 ${recordFocus ? "mt-3 text-center" : "mt-2"}`}
            >
              {recordMessage}
            </p>
          ) : null}
        </div>

        {!recordFocus ? (
        <div className={panel}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Build from a moment
          </p>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                Moment
              </label>
              {reelMarks.length > 0 ? (
                <select
                  className={inputClass}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    setBaseTimeStr(val);
                    const picked = reelMarks.find((m) => String(m.t) === val);
                    if (
                      picked?.sourceId &&
                      playableSources.some((s) => s.id === picked.sourceId)
                    ) {
                      setBasePrimary(picked.sourceId);
                    }
                  }}
                  value=""
                >
                  <option value="">From a game event…</option>
                  {reelMarks.map((m) => (
                    <option key={m.id} value={String(m.t)}>
                      {formatTimelineSeconds(m.t)} ·{" "}
                      {formatHighlightMarkLabel(m)}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                className={`${inputClass} w-24`}
                type="number"
                min={0}
                step={1}
                value={baseTimeStr}
                onChange={(e) => setBaseTimeStr(e.target.value)}
                aria-label="Game time in seconds"
              />
              <span className="text-[10px] text-zinc-500">sec</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                Lead angle
              </label>
              <select
                className={inputClass}
                value={basePrimary}
                onChange={(e) => setBasePrimary(e.target.value)}
              >
                {playableSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-black/25 p-2">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
                Preset
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {HIGHLIGHT_PRESET_LIST.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPresetId(p.id)}
                    className={`rounded-md border px-2 py-1.5 text-left transition ${
                      presetId === p.id
                        ? "border-blue-500/55 bg-blue-600/20"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="block text-[11px] font-semibold text-zinc-100">
                      {p.name}
                    </span>
                    <span className="mt-0.5 block text-[9px] leading-snug text-zinc-500">
                      {p.description}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={applyPreset} className={primaryBtn}>
                  Add styled segments
                </button>
                <button type="button" onClick={addManualSegment} className={ghostBtn}>
                  Add single segment
                </button>
              </div>
            </div>

            {reelMarks.length > 0 ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                  Game events ({reelMarks.length}
                  {rawMarkCount > reelMarks.length
                    ? ` · ${rawMarkCount} marks merged`
                    : ""}
                  )
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
                  Goal and assist on the same play count as one event. Add a
                  quick clip or a stylized live + replay cut for each moment.
                </p>

                <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
                  {reelMarks.map((m) => {
                    const sourceId = resolveHighlightMarkSourceId(
                      m,
                      playableSources.map((s) => s.id),
                      basePrimary,
                    );
                    const sourceLabel =
                      playableSources.find((s) => s.id === sourceId)?.label ??
                      "Angle";
                    return (
                      <li
                        key={m.id}
                        className="rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[10px] text-zinc-400">
                            {formatTimelineSeconds(m.t)}
                          </span>
                          <span className="text-[11px] font-semibold text-zinc-100">
                            {formatHighlightMarkLabel(m)}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            · {sourceLabel}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {HIGHLIGHT_PRESET_LIST.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              title={p.description}
                              disabled={!basePrimary}
                              onClick={() => addMarkToReel(m, p.id)}
                              className={
                                p.id === "replay"
                                  ? markPresetBtnPrimary
                                  : markPresetBtn
                              }
                            >
                              {p.id === "replay" ? "Live + replay" : p.name}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    All events at once
                  </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Style per event
                  </label>
                  <select
                    className={inputClass}
                    value={bulkPresetId}
                    onChange={(e) =>
                      setBulkPresetId(e.target.value as HighlightPresetId)
                    }
                    aria-label="Preset for all events"
                  >
                    {HIGHLIGHT_PRESET_LIST.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id === "replay" ? "Live + replay" : p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => buildFromAllMarks("replace")}
                    className={primaryBtn}
                  >
                    Build reel from all events
                  </button>
                  <button
                    type="button"
                    onClick={() => buildFromAllMarks("append")}
                    disabled={moments.length === 0}
                    className={ghostBtn}
                  >
                    Add all events to reel
                  </button>
                </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        ) : null}
      </div>

      {!recordFocus ? (
      <div className={panel}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Reel segments ({moments.length})
          </p>
          <div className="flex items-center gap-2">
            <input
              className={`${inputClass} w-44`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              placeholder="Reel name"
              aria-label="Reel name"
            />
            <select
              className={inputClass}
              value={visibility}
              onChange={(e) => {
                setVisibility(e.target.value as CutVisibility);
                setDirty(true);
              }}
              aria-label="Visibility"
            >
              <option value="private">Private</option>
              <option value="game">Team can view</option>
            </select>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || moments.length === 0 || !dirty}
              className={primaryBtn}
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Save reel"}
            </button>
          </div>
        </div>

        {moments.length === 0 ? (
          <p className="text-xs leading-relaxed text-zinc-500">
            No segments yet. Pick a moment and a preset above — &ldquo;Instant
            replay&rdquo; and &ldquo;Slow-mo showcase&rdquo; auto-build a
            multi-angle cut for you.
          </p>
        ) : (
          <ul className="space-y-2">
            {moments.map((m, i) => (
              <li
                key={m.id}
                className="rounded-lg border border-white/[0.06] bg-black/25 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-500">
                    #{i + 1}
                  </span>
                  <input
                    className={`${inputClass} w-36`}
                    value={m.label ?? ""}
                    placeholder="Segment label"
                    onChange={(e) =>
                      updateMoment(m.id, {
                        label: e.target.value.trim() || undefined,
                      })
                    }
                  />
                  <select
                    className={inputClass}
                    value={m.activeSourceId}
                    onChange={(e) =>
                      updateMoment(m.id, { activeSourceId: e.target.value })
                    }
                    aria-label="Angle"
                  >
                    {playableSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={inputClass}
                    value={m.speed ?? 1}
                    onChange={(e) =>
                      updateMoment(m.id, {
                        speed: Number(e.target.value) === 1 ? undefined : Number(e.target.value),
                      })
                    }
                    aria-label="Speed"
                  >
                    {HIGHLIGHT_SPEEDS.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}×
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                    loop
                    <input
                      className={`${inputClass} w-12`}
                      type="number"
                      min={1}
                      max={10}
                      value={m.repeat ?? 1}
                      onChange={(e) => {
                        const r = normalizeHighlightRepeat(e.target.value);
                        updateMoment(m.id, { repeat: r === 1 ? undefined : r });
                      }}
                    />
                  </label>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveMoment(i, -1)}
                      disabled={i === 0}
                      className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-white/[0.07] disabled:opacity-30"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMoment(i, 1)}
                      disabled={i === moments.length - 1}
                      className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-white/[0.07] disabled:opacity-30"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMoment(m.id)}
                      className="rounded border border-rose-500/25 bg-rose-950/20 px-1.5 py-0.5 text-[11px] text-rose-200 hover:bg-rose-950/40"
                      title="Remove segment"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
                  <span>
                    at{" "}
                    <span className="font-mono text-zinc-300">
                      {formatTimelineSeconds(m.gameTime)}
                    </span>
                  </span>
                  <label className="flex items-center gap-1">
                    in
                    <input
                      className={`${inputClass} w-14`}
                      type="number"
                      step={1}
                      value={m.startOffsetSec}
                      onChange={(e) =>
                        updateMoment(m.id, {
                          startOffsetSec: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    out
                    <input
                      className={`${inputClass} w-14`}
                      type="number"
                      step={1}
                      value={m.endOffsetSec}
                      onChange={(e) =>
                        updateMoment(m.id, {
                          endOffsetSec: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <span>
                    clip{" "}
                    {Math.max(0, m.endOffsetSec - m.startOffsetSec)}s
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {message ? (
          <p className="mt-2 text-[11px] text-zinc-400">{message}</p>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}
