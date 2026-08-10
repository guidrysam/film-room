"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HighlightReelPlayer, {
  type HighlightReelPlayerHandle,
} from "@/components/HighlightReelPlayer";
import ReelClipTrimBar from "@/components/ReelClipTrimBar";
import { auth } from "@/lib/firebase";
import { teamFilmRoomRoute } from "@/lib/team-film-room";
import { formatTimelineSeconds } from "@/lib/game-timeline";
import {
  buildScoreboardTicks,
  scoreboardNamesForGame,
} from "@/lib/game-scoreboard";
import { uploadVideoToDrive } from "@/lib/google-drive-upload";
import {
  guessAudioMimeType,
  isHighlightAudioFile,
  probeAudioDurationSec,
  soundtrackLengthDelta,
  type HighlightSoundtrack,
} from "@/lib/highlight-soundtrack";
import {
  MAX_REEL_SPONSORS,
  newSponsorId,
  type HighlightSponsorLogo,
} from "@/lib/highlight-sponsors";
import { resizeLogoToDataUrl } from "@/lib/team-logo";
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
  exportReelEditList,
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
  highlightPresetLabel,
  type HighlightPresetId,
} from "@/lib/highlight-presets";
import {
  formatHighlightMarkLabel,
  highlightMomentsFromCutProposals,
  highlightMomentsFromGameMark,
  highlightMomentsFromGameMarks,
  isHighlightMarkEvent,
  listHighlightReelMarks,
  resolveHighlightMarkSourceId,
} from "@/lib/highlight-from-marks";
import type { AiCutProposalDraft } from "@/lib/ai/cut-schema";
import { proposeCutCreditsForMarkCount } from "@/lib/billing/pricing";
import { enrichReelStepsWithPlayerOverlays } from "@/lib/highlight-player-overlay";
import { buildReelTitleCard } from "@/lib/highlight-reel-cards";
import {
  countReelEventGroups,
  groupHighlightMoments,
  inferReelGroupPresetId,
  isMultiBeatReelGroup,
  moveReelMomentGroup,
  patchReelMomentGroup,
  regenerateReelGroupPresetInputs,
  reelGroupDisplayLabel,
  removeReelMomentGroup,
  replaceReelMomentGroup,
  type ReelMomentGroup,
} from "@/lib/highlight-reel-groups";
import { getTeam, listTeamPlayers, type Player, type Team } from "@/lib/teams";
import {
  downloadRecording,
  isReelRecordingSupported,
  REEL_RECORD_OUTPUT,
  startReelRecording,
  type ReelRecordingController,
} from "@/lib/highlight-reel-record";
import {
  buildHighlightReelSharePayload,
  ensureHighlightReelSharing,
  highlightReelWatchUrl,
} from "@/lib/highlight-reel-share";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  formatExpiresDaysLabel,
  loadUserPrivacySettings,
  type UserPrivacySettings,
} from "@/lib/user-privacy-settings";
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
    ...(input.kenBurns ? { kenBurns: true } : {}),
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
    ...(m.kenBurns ? { kenBurns: true } : {}),
  };
}

/**
 * Highlight Reel Studio: any team member can stitch the game's angles into a
 * single cut. Each segment carries its own angle, in/out window, speed, and
 * repeat count. Presets auto-generate a styled multi-angle cut from one key
 * moment, the reel previews in an isolated player, and a watch link can be
 * shared with anyone — no screen recording required.
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
  const [soundtrack, setSoundtrack] = useState<HighlightSoundtrack | null>(
    null,
  );
  const [soundtrackUrl, setSoundtrackUrl] = useState<string | null>(null);
  const [soundtrackBusy, setSoundtrackBusy] = useState(false);
  const [soundtrackMessage, setSoundtrackMessage] = useState<string | null>(
    null,
  );
  const soundtrackFileRef = useRef<HTMLInputElement | null>(null);
  const soundtrackBlobUrlRef = useRef<string | null>(null);
  const [sponsors, setSponsors] = useState<HighlightSponsorLogo[]>([]);
  const [sponsorBusy, setSponsorBusy] = useState(false);
  const [sponsorMessage, setSponsorMessage] = useState<string | null>(null);
  const sponsorFileRef = useRef<HTMLInputElement | null>(null);
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
  const [cutProposals, setCutProposals] = useState<AiCutProposalDraft[] | null>(
    null,
  );
  const [proposeBusy, setProposeBusy] = useState(false);
  const [proposeNotes, setProposeNotes] = useState<string | null>(null);

  // Recording (optional download — not required for sharing).
  const [recording, setRecording] = useState(false);
  const [recordMessage, setRecordMessage] = useState<string | null>(null);
  const [sharingLink, setSharingLink] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [privacySettings, setPrivacySettings] =
    useState<UserPrivacySettings | null>(null);
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
  const reelGroups = useMemo(() => groupHighlightMoments(moments), [moments]);
  const reelEventCount = reelGroups.length;
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
  const scoreboard = useMemo(() => {
    const names = scoreboardNamesForGame(game, team?.name);
    return {
      ticks: buildScoreboardTicks(events),
      homeName: names.homeName,
      awayName: names.awayName,
    };
  }, [events, game, team?.name]);
  const totalDuration = useMemo(() => reelDurationSec(steps), [steps]);
  const songTarget = useMemo(() => {
    if (!soundtrack) return null;
    return soundtrackLengthDelta(totalDuration, soundtrack.durationSec);
  }, [soundtrack, totalDuration]);

  useEffect(() => {
    return () => {
      if (soundtrackBlobUrlRef.current) {
        URL.revokeObjectURL(soundtrackBlobUrlRef.current);
        soundtrackBlobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSoundtrackBlob(meta: HighlightSoundtrack | null) {
      if (soundtrackBlobUrlRef.current) {
        URL.revokeObjectURL(soundtrackBlobUrlRef.current);
        soundtrackBlobUrlRef.current = null;
      }
      if (!meta) {
        setSoundtrackUrl(null);
        return;
      }
      const user = auth.currentUser;
      if (!user) {
        setSoundtrackUrl(null);
        return;
      }
      try {
        const token = await user.getIdToken();
        const qs = new URLSearchParams({
          fileId: meta.driveFileId,
          ...(meta.mimeType ? { mimeType: meta.mimeType } : {}),
        });
        const res = await fetch(`/api/drive/soundtrack-media?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(err?.error || "Could not load soundtrack.");
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        soundtrackBlobUrlRef.current = url;
        setSoundtrackUrl(url);
      } catch (e) {
        if (!cancelled) {
          setSoundtrackUrl(null);
          setSoundtrackMessage(
            e instanceof Error ? e.message : "Could not load soundtrack.",
          );
        }
      }
    }
    void loadSoundtrackBlob(soundtrack);
    return () => {
      cancelled = true;
    };
  }, [soundtrack?.driveFileId]);

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
    void loadUserPrivacySettings(currentUid).then(setPrivacySettings);
  }, [currentUid]);

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
    setSoundtrack(null);
    setSoundtrackMessage(null);
    setSponsors([]);
    setSponsorMessage(null);
    setDirty(false);
    setMessage(null);
  }, []);

  const loadReel = useCallback((reel: HighlightDraft) => {
    setEditingId(reel.id);
    setName(reel.name);
    setMoments(reel.moments.map((m) => ({ ...m })));
    setSoundtrack(reel.soundtrack ?? null);
    setSoundtrackMessage(null);
    setSponsors(reel.sponsors ? reel.sponsors.map((s) => ({ ...s })) : []);
    setSponsorMessage(null);
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
    const next = [...moments, ...generated.map(inputToMoment)];
    mutateMoments(next);
    setMessage(
      `Added ${countReelEventGroups(next) === 1 ? "1 event" : `${countReelEventGroups(next)} events`}.`,
    );
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
          ? `Built a reel with ${countReelEventGroups(nextMoments)} event${countReelEventGroups(nextMoments) === 1 ? "" : "s"}.`
          : `Added ${countReelEventGroups(nextMoments)} event${countReelEventGroups(nextMoments) === 1 ? "" : "s"}.`,
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
      setMessage(
        `Added ${formatHighlightMarkLabel(event)} (${highlightPresetLabel(markPresetId)}).`,
      );
    },
    [basePrimary, playableSources, moments, mutateMoments],
  );

  const runProposeCut = useCallback(async () => {
    if (!basePrimary || reelMarks.length === 0) return;
    setProposeBusy(true);
    setProposeNotes(null);
    setMessage(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in required.");
      const token = await user.getIdToken();
      const res = await fetch("/api/ai/propose-cut", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameId,
          eventIds: reelMarks.map((m) => m.id),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        proposals?: AiCutProposalDraft[];
        notes?: string;
      };
      if (!res.ok) {
        throw new Error(data.message || data.error || "Propose cut failed.");
      }
      setCutProposals(data.proposals ?? []);
      setProposeNotes(data.notes ?? null);
      setMessage(
        `AI proposed angles for ${data.proposals?.length ?? 0} mark${(data.proposals?.length ?? 0) === 1 ? "" : "s"}. Review below, then approve.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Propose cut failed.");
    } finally {
      setProposeBusy(false);
    }
  }, [basePrimary, reelMarks, gameId]);

  const applyCutProposals = useCallback(
    (mode: "replace" | "append") => {
      if (!basePrimary || !cutProposals?.length) return;
      const generated = highlightMomentsFromCutProposals(
        events,
        cutProposals,
        {
          primarySourceId: basePrimary,
          playableSourceIds: playableSources.map((s) => s.id),
          presetId: "single",
        },
      );
      if (generated.length === 0) {
        setMessage("No proposals could be turned into clips.");
        return;
      }
      const nextMoments = generated.map(inputToMoment);
      if (mode === "replace") {
        setEditingId(null);
        setName(`${game.title.trim() || "Game"} AI cut`);
        setVisibility("private");
        setMoments(nextMoments);
        setDirty(true);
      } else {
        mutateMoments([...moments, ...nextMoments]);
      }
      setCutProposals(null);
      setProposeNotes(null);
      setMessage(
        mode === "replace"
          ? `Approved AI cut with ${countReelEventGroups(nextMoments)} event${countReelEventGroups(nextMoments) === 1 ? "" : "s"}.`
          : `Added ${countReelEventGroups(nextMoments)} AI event${countReelEventGroups(nextMoments) === 1 ? "" : "s"}.`,
      );
    },
    [
      basePrimary,
      cutProposals,
      events,
      playableSources,
      game.title,
      moments,
      mutateMoments,
    ],
  );

  const exportCleanCutEdl = useCallback(() => {
    if (moments.length === 0) {
      setMessage("Add segments before exporting an EDL.");
      return;
    }
    const edl = exportReelEditList(moments, sources, {
      gameId,
      reelName: name,
      handleSec: 1,
    });
    const blob = new Blob([JSON.stringify(edl, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name || "highlight-reel").replace(/[^\w.-]+/g, "_")}-edl.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Downloaded clean cut EDL (Drive file ids + source in/out).");
  }, [moments, sources, gameId, name]);

  const updateMoment = useCallback(
    (id: string, patch: Partial<HighlightMoment>) => {
      setMoments((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
      setDirty(true);
    },
    [],
  );

  const removeGroup = useCallback(
    (group: ReelMomentGroup) =>
      mutateMoments(removeReelMomentGroup(moments, group)),
    [moments, mutateMoments],
  );

  const moveGroup = useCallback(
    (groupIndex: number, dir: -1 | 1) => {
      const next = moveReelMomentGroup(moments, groupIndex, dir);
      if (next) mutateMoments(next);
    },
    [moments, mutateMoments],
  );

  const patchGroup = useCallback(
    (group: ReelMomentGroup, patch: Partial<HighlightMoment>) => {
      mutateMoments(patchReelMomentGroup(moments, group, patch));
    },
    [moments, mutateMoments],
  );

  const changeGroupPreset = useCallback(
    (group: ReelMomentGroup, presetId: HighlightPresetId) => {
      if (presetId === inferReelGroupPresetId(group)) return;
      const event = group.timelineEventId
        ? (events.find((e) => e.id === group.timelineEventId) ?? null)
        : null;
      const inputs = regenerateReelGroupPresetInputs(group, presetId, {
        playableSourceIds: playableSources.map((s) => s.id),
        primarySourceId: basePrimary,
        event,
      });
      if (inputs.length === 0) {
        setMessage("Could not apply that preset for this event.");
        return;
      }
      mutateMoments(
        replaceReelMomentGroup(
          moments,
          group,
          inputs.map(inputToMoment),
        ),
      );
      setMessage(`Updated to ${highlightPresetLabel(presetId)}.`);
    },
    [events, playableSources, basePrimary, moments, mutateMoments],
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
          description: serializeHighlightDraftMeta(
            moments,
            undefined,
            soundtrack,
            sponsors,
          ),
        });
      } else {
        id = await createHighlightReel(gameId, currentUid, {
          name,
          moments: moments.map(momentToInput),
          visibility,
          soundtrack,
          sponsors,
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
    soundtrack,
    sponsors,
    editingId,
    gameId,
    name,
    visibility,
    currentUid,
    currentDisplayName,
    refreshReels,
  ]);

  const handleSoundtrackFile = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!isHighlightAudioFile(file)) {
      setSoundtrackMessage("Choose an audio file (mp3, m4a, wav, …).");
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setSoundtrackMessage("Sign in to upload a song.");
      return;
    }
    setSoundtrackBusy(true);
    setSoundtrackMessage(null);
    try {
      const durationSec = await probeAudioDurationSec(file);
      const mimeType = guessAudioMimeType(file);
      const token = await user.getIdToken();
      const sessionRes = await fetch("/api/drive/soundtrack-session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType,
          sizeBytes: file.size,
        }),
      });
      if (!sessionRes.ok) {
        const err = (await sessionRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          err?.error ||
            "Could not start Drive upload. Reconnect My Film Drive?",
        );
      }
      const session = (await sessionRes.json()) as {
        accessToken: string;
        parentFolderId: string;
        uploadName: string;
      };
      const uploaded = await uploadVideoToDrive({
        accessToken: session.accessToken,
        parentFolderId: session.parentFolderId,
        name: session.uploadName,
        file,
      });
      setSoundtrack({
        driveFileId: uploaded.fileId,
        name: uploaded.name || file.name,
        mimeType,
        durationSec: Math.round(durationSec * 10) / 10,
      });
      setDirty(true);
      setSoundtrackMessage(
        `Song uploaded — shoot for ~${formatTimelineSeconds(durationSec)}.`,
      );
    } catch (e) {
      setSoundtrackMessage(
        e instanceof Error ? e.message : "Could not upload the song.",
      );
    } finally {
      setSoundtrackBusy(false);
      if (soundtrackFileRef.current) soundtrackFileRef.current.value = "";
    }
  }, []);

  const clearSoundtrack = useCallback(() => {
    setSoundtrack(null);
    setSoundtrackMessage(null);
    setDirty(true);
  }, []);

  const handleSponsorFile = useCallback(async (file: File | null) => {
    if (!file) return;
    if (sponsors.length >= MAX_REEL_SPONSORS) {
      setSponsorMessage(`Up to ${MAX_REEL_SPONSORS} sponsor logos.`);
      return;
    }
    setSponsorBusy(true);
    setSponsorMessage(null);
    try {
      const logoUrl = await resizeLogoToDataUrl(file);
      const base = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 80);
      setSponsors((prev) => [
        ...prev,
        {
          id: newSponsorId(),
          logoUrl,
          ...(base ? { name: base } : {}),
        },
      ]);
      setDirty(true);
      setSponsorMessage("Sponsor added — shows on black cuts between clips.");
    } catch (e) {
      setSponsorMessage(
        e instanceof Error ? e.message : "Could not add sponsor logo.",
      );
    } finally {
      setSponsorBusy(false);
      if (sponsorFileRef.current) sponsorFileRef.current.value = "";
    }
  }, [sponsors.length]);

  const removeSponsor = useCallback((id: string) => {
    setSponsors((prev) => prev.filter((s) => s.id !== id));
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    void persistReel();
  }, [persistReel]);

  const [openingRoom, setOpeningRoom] = useState(false);
  const handleCopyWatchLink = useCallback(async () => {
    if (moments.length === 0) {
      setShareMessage("Add at least one segment first.");
      return;
    }
    const reelShareDays = privacySettings?.reelShareExpiresDays ?? 7;
    const needsConfirm = privacySettings?.confirmBeforeReelShare !== false;
    if (needsConfirm) {
      const expiryNote =
        reelShareDays > 0
          ? ` The link stops working after ${formatExpiresDaysLabel(reelShareDays).toLowerCase()}.`
          : " The link does not expire automatically.";
      const ok = window.confirm(
        `Create a public watch link? Anyone with the URL can play this reel — they do not need a Film Room account.${expiryNote}\n\nChange defaults in Privacy settings.`,
      );
      if (!ok) return;
    }
    setSharingLink(true);
    setShareMessage(null);
    try {
      const id = editingId && !dirty ? editingId : await persistReel();
      if (!id) return;
      const payload = buildHighlightReelSharePayload({
        reelName: name,
        game,
        team,
        previewSteps,
        sources: playableSources,
        scoreboard,
        soundtrack,
        sponsors,
      });
      const shareId = await ensureHighlightReelSharing(
        gameId,
        id,
        payload,
        currentUid,
        { expiresInDays: reelShareDays },
      );
      const url = highlightReelWatchUrl(shareId);
      setWatchUrl(url);
      const copied = await copyTextToClipboard(url);
      setShareMessage(
        copied
          ? reelShareDays > 0
            ? `Watch link copied — expires in ${formatExpiresDaysLabel(reelShareDays).toLowerCase()}.`
            : "Watch link copied — anyone with the link can play this reel."
          : "Watch link ready — tap Copy below or select the link.",
      );
    } catch (e) {
      setShareMessage(
        e instanceof Error ? e.message : "Could not create a watch link.",
      );
    } finally {
      setSharingLink(false);
    }
  }, [
    moments.length,
    privacySettings,
    editingId,
    dirty,
    persistReel,
    name,
    game,
    team,
    previewSteps,
    playableSources,
    scoreboard,
    soundtrack,
    sponsors,
    gameId,
    currentUid,
  ]);

  const handleCopyWatchUrlAgain = useCallback(async () => {
    if (!watchUrl) return;
    const copied = await copyTextToClipboard(watchUrl);
    setShareMessage(
      copied ? "Link copied." : "Select the link and copy manually (⌘C).",
    );
  }, [watchUrl]);

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
    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      await new Promise<void>((resolve) => window.setTimeout(resolve, 450));
      const cropElement = captureRef.current;
      if (!cropElement) {
        throw new Error("Reel preview is not ready to record.");
      }
      const controller = await startReelRecording({
        cropElement,
        outputSize: REEL_RECORD_OUTPUT,
        onAutoStop: () => {
          recordingRef.current = false;
          setRecording(false);
          playerRef.current?.stop();
          setRecordMessage("Recording stopped.");
        },
      });
      controllerRef.current = controller;
      recordingRef.current = true;
      setRecording(true);
      window.setTimeout(() => playerRef.current?.play(), 450);
    } catch (e) {
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
      <div className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100">
              Highlight Reel Studio
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Build a highlight reel from every angle, then share a watch link
              with parents and players — no screen recording needed.
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
                    {countReelEventGroups(r.moments)}
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Preview + share */}
        <div className={`${panel} lg:sticky lg:top-4 lg:self-start`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Preview
            </p>
            <span className="text-[10px] text-zinc-500">
              ~{formatTimelineSeconds(totalDuration)} total
              {soundtrack
                ? ` · song ${formatTimelineSeconds(soundtrack.durationSec)}`
                : ""}
            </span>
          </div>

          <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-zinc-300">
                Soundtrack
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  ref={soundtrackFileRef}
                  type="file"
                  accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac"
                  className="hidden"
                  onChange={(e) =>
                    void handleSoundtrackFile(e.target.files?.[0] ?? null)
                  }
                />
                <button
                  type="button"
                  disabled={soundtrackBusy}
                  onClick={() => soundtrackFileRef.current?.click()}
                  className={ghostBtn}
                >
                  {soundtrackBusy
                    ? "Uploading…"
                    : soundtrack
                      ? "Replace song"
                      : "Upload song"}
                </button>
                {soundtrack ? (
                  <button
                    type="button"
                    disabled={soundtrackBusy}
                    onClick={clearSoundtrack}
                    className={ghostBtn}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            {soundtrack ? (
              <div className="mt-2 space-y-1.5">
                <p className="truncate text-[11px] text-zinc-200">
                  {soundtrack.name}
                </p>
                {songTarget ? (
                  <>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          songTarget.status === "fit"
                            ? "bg-emerald-500/80"
                            : songTarget.status === "short"
                              ? "bg-sky-500/70"
                              : "bg-amber-500/80"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(4, songTarget.ratio * 100))}%`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      Reel {formatTimelineSeconds(totalDuration)} · target{" "}
                      {formatTimelineSeconds(soundtrack.durationSec)}
                      {songTarget.status === "fit"
                        ? " · on length"
                        : songTarget.status === "short"
                          ? ` · ${formatTimelineSeconds(Math.abs(songTarget.deltaSec))} short`
                          : ` · ${formatTimelineSeconds(songTarget.deltaSec)} over`}
                    </p>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-500">
                Upload to My Drive Music — plays under the reel and sets the
                length to shoot for.
              </p>
            )}
            {soundtrackMessage ? (
              <p className="mt-1.5 text-[10px] text-zinc-400">
                {soundtrackMessage}
              </p>
            ) : null}
          </div>

          <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-zinc-300">
                Sponsors (thank-you cuts)
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  ref={sponsorFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) =>
                    void handleSponsorFile(e.target.files?.[0] ?? null)
                  }
                />
                <button
                  type="button"
                  disabled={sponsorBusy || sponsors.length >= MAX_REEL_SPONSORS}
                  onClick={() => sponsorFileRef.current?.click()}
                  className={ghostBtn}
                >
                  {sponsorBusy ? "Adding…" : "Add logo"}
                </button>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              Logos cycle on the lengthened black between clips (~¾s outbound +
              2s inbound) so YouTube chrome stays covered.
            </p>
            {sponsors.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {sponsors.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.logoUrl}
                      alt={s.name || "Sponsor"}
                      className="h-8 w-8 rounded object-contain bg-white/90"
                    />
                    <span className="max-w-[5.5rem] truncate text-[10px] text-zinc-400">
                      {s.name || "Sponsor"}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSponsor(s.id)}
                      className="text-[10px] text-zinc-500 hover:text-rose-200"
                      aria-label="Remove sponsor"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {sponsorMessage ? (
              <p className="mt-1.5 text-[10px] text-zinc-400">{sponsorMessage}</p>
            ) : null}
          </div>

          {recording ? (
            <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100">
              Recording — choose <span className="font-semibold">This Tab</span>{" "}
              when prompted, then let the reel play through.
            </p>
          ) : null}

          <HighlightReelPlayer
            ref={playerRef}
            captureRef={captureRef}
            steps={previewSteps}
            titleCard={titleCard}
            scoreboard={scoreboard}
            soundtrackUrl={soundtrackUrl}
            sponsors={sponsors}
            videoIdForSource={videoIdForSource}
            labelForSource={labelForSource}
            onEnded={handleReelEnded}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyWatchLink()}
              disabled={moments.length === 0 || sharingLink || recording}
              className={primaryBtn}
            >
              {sharingLink ? "Creating link…" : "Copy watch link"}
            </button>
            <button
              type="button"
              onClick={() => playerRef.current?.play()}
              disabled={steps.length === 0 || recording}
              className={ghostBtn}
            >
              ▶ Play preview
            </button>
            <button
              type="button"
              onClick={() => void handlePlayInRoom()}
              disabled={moments.length === 0 || openingRoom || recording}
              className={ghostBtn}
              title="Open the synced room so everyone watching sees this reel live"
            >
              {openingRoom ? "Opening room…" : "Play in room"}
            </button>
          </div>
          {shareMessage ? (
            <p
              className={`mt-2 text-[10px] ${
                shareMessage.includes("Could not") ||
                shareMessage.includes("Add at least")
                  ? "text-rose-200/90"
                  : "text-emerald-300/90"
              }`}
            >
              {shareMessage}
            </p>
          ) : null}
          {watchUrl ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={watchUrl}
                className={`${inputClass} min-w-0 flex-1 font-mono text-[10px]`}
                aria-label="Watch link"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => void handleCopyWatchUrlAgain()}
                className={ghostBtn}
              >
                Copy
              </button>
              <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={ghostBtn}
              >
                Open
              </a>
            </div>
          ) : null}

          <details className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-medium text-zinc-400">
              Optional: download an MP4 (screen recording)
            </summary>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              Only needed if you want a file for social media. Sharing the watch
              link above is easier — viewers play the reel in their browser with
              no sign-in.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {recordSupported ? (
                <button
                  type="button"
                  onClick={() =>
                    recording ? void stopRecording() : void startRecording()
                  }
                  disabled={steps.length === 0 || sharingLink}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    recording
                      ? "border-red-500/50 bg-red-950/50 text-red-100 hover:bg-red-900/60"
                      : "border-white/12 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                  }`}
                >
                  {recording ? "■ Stop & save" : "● Record download"}
                </button>
              ) : (
                <p className="text-[10px] text-zinc-500">
                  Not supported in this browser — use the watch link instead.
                </p>
              )}
            </div>
            {recordMessage ? (
              <p className="mt-2 text-[10px] text-zinc-400">{recordMessage}</p>
            ) : null}
          </details>
        </div>

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
                  <button
                    type="button"
                    onClick={() => void runProposeCut()}
                    disabled={!basePrimary || proposeBusy || reelMarks.length === 0}
                    className={primaryBtn}
                    title={`~${proposeCutCreditsForMarkCount(reelMarks.length)} credits`}
                  >
                    {proposeBusy
                      ? "Proposing…"
                      : "Propose angles for marks"}
                  </button>
                </div>
                {cutProposals && cutProposals.length > 0 ? (
                  <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-950/20 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
                      AI cut proposals ({cutProposals.length})
                    </p>
                    {proposeNotes ? (
                      <p className="mt-1 text-[10px] text-zinc-400">{proposeNotes}</p>
                    ) : null}
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                      {cutProposals.map((p) => {
                        const mark = reelMarks.find(
                          (m) => m.id === p.timelineEventId,
                        );
                        const angle =
                          playableSources.find((s) => s.id === p.activeSourceId)
                            ?.label ?? p.activeSourceId;
                        return (
                          <li
                            key={p.timelineEventId}
                            className="text-[10px] text-zinc-300"
                          >
                            <span className="font-mono text-zinc-500">
                              {mark
                                ? formatTimelineSeconds(mark.t)
                                : "—"}
                            </span>{" "}
                            {mark ? formatHighlightMarkLabel(mark) : "Mark"} →{" "}
                            <span className="text-zinc-100">{angle}</span>{" "}
                            ({p.startOffsetSec.toFixed(0)}…+
                            {p.endOffsetSec.toFixed(0)}s ·{" "}
                            {Math.round(p.confidence * 100)}%)
                            {p.note ? (
                              <span className="text-zinc-500"> — {p.note}</span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => applyCutProposals("replace")}
                        className={primaryBtn}
                      >
                        Approve into new reel
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCutProposals("append")}
                        disabled={moments.length === 0}
                        className={ghostBtn}
                      >
                        Append to reel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCutProposals(null);
                          setProposeNotes(null);
                        }}
                        className={ghostBtn}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={panel}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Reel events ({reelEventCount})
            {moments.length > reelEventCount ? (
              <span className="ml-1 font-normal normal-case text-zinc-500">
                · {moments.length} beats
              </span>
            ) : null}
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
            <button
              type="button"
              onClick={exportCleanCutEdl}
              disabled={moments.length === 0}
              className={ghostBtn}
              title="JSON EDL with driveFileId + source in/out for local ffmpeg"
            >
              Export clean cut EDL
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
            {reelGroups.map((group, groupIndex) => {
              const primary = group.moments[0]!;
              const multiBeat = isMultiBeatReelGroup(group);
              const groupPresetId = inferReelGroupPresetId(group);
              return (
                <li
                  key={group.moments.map((m) => m.id).join("-")}
                  className="rounded-lg border border-white/[0.06] bg-black/25 p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-500">
                      #{groupIndex + 1}
                    </span>
                    <input
                      className={`${inputClass} w-36`}
                      value={reelGroupDisplayLabel(group)}
                      placeholder="Event label"
                      onChange={(e) =>
                        updateMoment(primary.id, {
                          label: e.target.value.trim() || undefined,
                        })
                      }
                    />
                    <select
                      className={inputClass}
                      value={groupPresetId}
                      onChange={(e) =>
                        changeGroupPreset(
                          group,
                          e.target.value as HighlightPresetId,
                        )
                      }
                      aria-label="Highlight style"
                      title="Regenerate this event with a different preset"
                    >
                      {HIGHLIGHT_PRESET_LIST.map((p) => (
                        <option key={p.id} value={p.id}>
                          {highlightPresetLabel(p.id)}
                        </option>
                      ))}
                    </select>
                    <select
                      className={inputClass}
                      value={primary.activeSourceId}
                      onChange={(e) =>
                        patchGroup(group, { activeSourceId: e.target.value })
                      }
                      aria-label="Angle"
                    >
                      {playableSources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveGroup(groupIndex, -1)}
                        disabled={groupIndex === 0}
                        className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-white/[0.07] disabled:opacity-30"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGroup(groupIndex, 1)}
                        disabled={groupIndex === reelGroups.length - 1}
                        className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-white/[0.07] disabled:opacity-30"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeGroup(group)}
                        className="rounded border border-rose-500/25 bg-rose-950/20 px-1.5 py-0.5 text-[11px] text-rose-200 hover:bg-rose-950/40"
                        title="Remove event"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div
                    className={`mt-2 space-y-2 ${multiBeat ? "border-t border-white/[0.05] pt-2" : ""}`}
                  >
                    {multiBeat ? (
                      <>
                        {group.moments.map((m, beatIndex) => (
                          <div
                            key={m.id}
                            className="rounded-md border border-white/[0.04] bg-black/20 px-2 py-1.5"
                          >
                            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                {beatIndex === 0
                                  ? "Live"
                                  : m.label?.trim() || `Beat ${beatIndex + 1}`}
                              </span>
                              <select
                                className={inputClass}
                                value={m.speed ?? 1}
                                onChange={(e) =>
                                  updateMoment(m.id, {
                                    speed:
                                      Number(e.target.value) === 1
                                        ? undefined
                                        : Number(e.target.value),
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
                            </div>
                            <ReelClipTrimBar
                              gameTime={m.gameTime}
                              startOffsetSec={m.startOffsetSec}
                              endOffsetSec={m.endOffsetSec}
                              onChange={(startOffsetSec, endOffsetSec) =>
                                updateMoment(m.id, {
                                  startOffsetSec,
                                  endOffsetSec,
                                })
                              }
                            />
                          </div>
                        ))}
                        <p className="text-[10px] text-zinc-500">
                          at{" "}
                          <span className="font-mono text-zinc-300">
                            {formatTimelineSeconds(primary.gameTime)}
                          </span>
                        </p>
                      </>
                    ) : (
                      group.moments.map((m) => (
                        <div key={m.id}>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              className={inputClass}
                              value={m.speed ?? 1}
                              onChange={(e) =>
                                updateMoment(m.id, {
                                  speed:
                                    Number(e.target.value) === 1
                                      ? undefined
                                      : Number(e.target.value),
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
                                  const r = normalizeHighlightRepeat(
                                    e.target.value,
                                  );
                                  updateMoment(m.id, {
                                    repeat: r === 1 ? undefined : r,
                                  });
                                }}
                              />
                            </label>
                          </div>
                          <ReelClipTrimBar
                            gameTime={m.gameTime}
                            startOffsetSec={m.startOffsetSec}
                            endOffsetSec={m.endOffsetSec}
                            onChange={(startOffsetSec, endOffsetSec) =>
                              updateMoment(m.id, {
                                startOffsetSec,
                                endOffsetSec,
                              })
                            }
                          />
                          <p className="mt-1 text-[10px] text-zinc-500">
                            at{" "}
                            <span className="font-mono text-zinc-300">
                              {formatTimelineSeconds(m.gameTime)}
                            </span>
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {message ? (
          <p className="mt-2 text-[11px] text-zinc-400">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
