"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import YouTube, { type YouTubePlayer } from "react-youtube";
import {
  formatTimelineSeconds,
  gameTimeToSourceTime,
  sourceTimeToGameTime,
  syncStatusBadgeClass,
  syncStatusLabel,
} from "@/lib/game-timeline";
import {
  addGameEvent,
  canContributeGameSources,
  canViewGame,
  deleteGameEvent,
  getGame,
  listGameEvents,
  listGameSources,
  type Game,
  type GameTimelineEvent,
  type GameTimelineEventType,
  type GameVideoSource,
} from "@/lib/games";
import { getTeam, listTeamPlayers, teamRoleFor, type Player, type Team } from "@/lib/teams";
import { getEventPlayerIds, personIdsForRosterPlayers, withEventPlayerIds } from "@/lib/timeline-players";
import {
  addGameStat,
  canManageGameStats,
  deleteGameStat,
  gameStatTypesForSport,
  listGameStatsFromEvents,
  parseGameStat,
  statFromCoachMark,
  statTypeLabel,
  type GameStatType,
} from "@/lib/game-stats";
import {
  isScoringStatType,
  reviewTagsForSport,
  type ReviewQuickTag,
} from "@/lib/sport-pack";
import { applyGoalLookback } from "@/lib/goal-lookback";
import { resolveSportId, isSoccerCurriculumSport } from "@/lib/sports";
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
import { gameCapUrl, teamFilmRoomUrl } from "@/lib/team-routes";
import AngleMatchSync from "@/components/AngleMatchSync";
import VideoTransport from "@/components/VideoTransport";
import YoutubeChromelessStage from "@/components/YoutubeChromelessStage";
import { YOUTUBE_CHROMELESS_PLAYER_VARS } from "@/lib/youtube-player-vars";
import ImportTagPlays from "@/components/ImportTagPlays";
import AcademyFilmEvidencePicker from "@/components/AcademyFilmEvidencePicker";
import AiTagDraftPanel from "@/components/AiTagDraftPanel";

export type GameReviewProps = {
  gameId: string;
  currentUid: string;
  currentDisplayName?: string | null;
  initialGameTime?: number;
  initialSourceId?: string;
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
      return "Tagged Play";
    case "sync_point":
      return "Sync Point";
    case "note":
      return "Note";
    case "tag":
      return "Tag";
    case "stat":
      return "Stat";
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
  initialGameTime,
  initialSourceId,
}: GameReviewProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [sources, setSources] = useState<GameVideoSource[]>([]);
  const [events, setEvents] = useState<GameTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    initialSourceId ?? null,
  );
  const [selectedGameTime, setSelectedGameTime] = useState(
    typeof initialGameTime === "number" && Number.isFinite(initialGameTime)
      ? Math.max(0, initialGameTime)
      : 0,
  );
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
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [statType, setStatType] = useState<GameStatType>("goal");
  const [statNote, setStatNote] = useState("");
  const [statPlayerIds, setStatPlayerIds] = useState<string[]>([]);
  const [statSaving, setStatSaving] = useState(false);
  const [statMessage, setStatMessage] = useState<string | null>(null);
  const [tagLabel, setTagLabel] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [tagMessage, setTagMessage] = useState<string | null>(null);
  /** A mark awaiting attribution while the video is paused. Player is optional. */
  const [pendingTag, setPendingTag] = useState<{
    label: string;
    statType?: GameStatType;
    opponent?: boolean;
    t: number;
  } | null>(null);
  const [pendingPlayerId, setPendingPlayerId] = useState("");
  const [pendingAssistId, setPendingAssistId] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPlayerId, setEditPlayerId] = useState("");
  const [editTime, setEditTime] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  type ReviewTab = "tag" | "stat" | "highlight" | "develop";
  const [reviewTab, setReviewTab] = useState<ReviewTab>("tag");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  /** Avoid full-page loading flash on soft refreshes (keeps AI draft panel mounted). */
  const hasLoadedRef = useRef(false);

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

  const canManageStats = useMemo(
    () => (game ? canManageGameStats(game, currentUid, team) : false),
    [game, currentUid, team],
  );

  const reviewSportId = useMemo(
    () =>
      resolveSportId({
        gameSport: game?.sport,
        teamSport: team?.sport,
      }),
    [game?.sport, team?.sport],
  );

  const academyEnabled =
    isSoccerCurriculumSport(reviewSportId) &&
    (process.env.NEXT_PUBLIC_ACADEMY_ENABLED === "true" ||
      process.env.NODE_ENV === "development");

  const { quickTags, markTags, opponentTags } = useMemo(
    () => reviewTagsForSport(reviewSportId),
    [reviewSportId],
  );

  const availableStatTypes = useMemo(
    () => gameStatTypesForSport(reviewSportId),
    [reviewSportId],
  );

  useEffect(() => {
    if (!availableStatTypes.includes(statType)) {
      setStatType(availableStatTypes[0] ?? "custom");
    }
  }, [availableStatTypes, statType]);

  const canEditSources = useMemo(() => {
    if (!game) return false;
    const teamRole = team ? teamRoleFor(team, currentUid) : null;
    return canContributeGameSources(game, currentUid, teamRole);
  }, [game, team, currentUid]);

  const canAttachAcademyEvidence = Boolean(
    academyEnabled && canManageStats && game?.teamId,
  );

  const gameStats = useMemo(() => listGameStatsFromEvents(events), [events]);

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
    const soft = hasLoadedRef.current;
    if (!soft) setLoading(true);
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
      setTeam(team);
      setSources(srcs);
      setEvents(evs);
      if (g.teamId) {
        try {
          setTeamPlayers(await listTeamPlayers(g.teamId));
        } catch {
          setTeamPlayers([]);
        }
      } else {
        setTeamPlayers([]);
      }
      const playable = srcs.filter(isPlayableYouTubeSource);
      setSelectedSourceId((prev) => {
        if (initialSourceId && playable.some((s) => s.id === initialSourceId)) {
          return initialSourceId;
        }
        if (prev && playable.some((s) => s.id === prev)) return prev;
        return playable[0]?.id ?? null;
      });
      await refreshHighlightDrafts();
      hasLoadedRef.current = true;
    } catch {
      setLoadError("Could not load this game.");
    } finally {
      setLoading(false);
    }
  }, [gameId, currentUid, refreshHighlightDrafts, initialSourceId]);

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

  useEffect(() => {
    if (
      typeof initialGameTime === "number" &&
      Number.isFinite(initialGameTime) &&
      selectedSource &&
      !loading
    ) {
      setSelectedGameTime(initialGameTime);
      void applySeekForGameTime(initialGameTime, selectedSource);
    }
  }, [initialGameTime, selectedSource, loading, applySeekForGameTime]);

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

  const handleTransportTime = useCallback(
    (sourceTime: number) => {
      if (!selectedSource) return;
      const gameTime = sourceTimeToGameTime(sourceTime, selectedSource);
      const next = Math.max(0, Math.round(gameTime));
      setSelectedGameTime((prev) => (prev === next ? prev : next));
    },
    [selectedSource],
  );

  const handleSelectEvent = useCallback(
    (event: GameTimelineEvent) => {
      setSelectedEventId(event.id);
      setSelectedGameTime(event.t);
      const playerIds = getEventPlayerIds(event);
      if (playerIds.length > 0) {
        setSelectedPlayerIds(playerIds);
        setStatPlayerIds(playerIds);
      }
      if (event.type === "coach_mark" && event.label) {
        setStatNote(event.label);
      }
      void applySeekForGameTime(event.t, selectedSource);
    },
    [selectedSource, applySeekForGameTime],
  );

  const toggleStatPlayer = useCallback((playerId: string) => {
    setStatPlayerIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId],
    );
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      setEvents(await listGameEvents(gameId));
    } catch {
      /* non-fatal */
    }
  }, [gameId]);

  const pauseVideo = useCallback(() => {
    try {
      void playerRef.current?.pauseVideo();
    } catch {
      /* player not ready */
    }
  }, []);

  // Tap any tag → pause the video and open the attribution step. Player is
  // always optional; you can save the mark with or without one.
  const beginTag = useCallback(
    (tag: { label: string; statType?: GameStatType; opponent?: boolean }) => {
      const text = tag.label.trim();
      if (!game || !text) return;
      pauseVideo();
      setTagMessage(null);
      setPendingPlayerId("");
      setPendingAssistId("");
      setPendingTag({ ...tag, label: text, t: selectedGameTime });
    },
    [game, pauseVideo, selectedGameTime],
  );

  const playerName = useCallback(
    (id: string) => teamPlayers.find((p) => p.id === id)?.name ?? "player",
    [teamPlayers],
  );

  const personIdFor = useCallback(
    (rosterPlayerId: string) =>
      teamPlayers.find((p) => p.id === rosterPlayerId)?.personId,
    [teamPlayers],
  );

  const personIdsFor = useCallback(
    (rosterPlayerIds: string[]) =>
      personIdsForRosterPlayers(teamPlayers, rosterPlayerIds),
    [teamPlayers],
  );

  // Commit the pending mark.
  // stat (goals can carry an assist); otherwise it's a tagged play that may
  // still carry an attributed player. No player is always allowed.
  const commitPendingTag = useCallback(async () => {
    if (!pendingTag) return;
    const markedAt = pendingTag.t;
    const isGoal =
      pendingTag.statType === "goal" ||
      pendingTag.label.toLowerCase().includes("goal");
    const lookback = isGoal ? applyGoalLookback(markedAt) : null;
    const t = lookback ? lookback.t : markedAt;
    setTagSaving(true);
    setTagMessage(null);
    try {
      if (pendingTag.statType && pendingPlayerId) {
        const scorerPersonId = personIdFor(pendingPlayerId);
        await addGameStat(gameId, {
          t,
          statType: pendingTag.statType,
          playerIds: [pendingPlayerId],
          ...(scorerPersonId ? { personIds: [scorerPersonId] } : {}),
          ...(selectedSource?.id ? { sourceId: selectedSource.id } : {}),
          createdBy: currentUid,
          ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
        });
        if (
          isScoringStatType(pendingTag.statType) &&
          pendingAssistId &&
          pendingAssistId !== pendingPlayerId
        ) {
          const assistPersonId = personIdFor(pendingAssistId);
          await addGameStat(gameId, {
            t,
            statType: "assist",
            playerIds: [pendingAssistId],
            ...(assistPersonId ? { personIds: [assistPersonId] } : {}),
            ...(selectedSource?.id ? { sourceId: selectedSource.id } : {}),
            createdBy: currentUid,
            ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
          });
        }
        const assist =
          isScoringStatType(pendingTag.statType) && pendingAssistId
            ? ` (assist: ${playerName(pendingAssistId)})`
            : "";
        setTagMessage(
          `${pendingTag.label} · ${playerName(pendingPlayerId)}${assist} at ${formatTimelineSeconds(t)}${
            lookback ? ` (clip from −${lookback.lookbackSec}s)` : ""
          }.`,
        );
      } else {
        const players = pendingPlayerId ? [pendingPlayerId] : [];
        const persons = pendingPlayerId
          ? [personIdFor(pendingPlayerId)].filter(Boolean)
          : [];
        await addGameEvent(
          gameId,
          {
            type: "coach_mark",
            t,
            label: pendingTag.label,
            ...(selectedSource?.id ? { sourceId: selectedSource.id } : {}),
            payload: withEventPlayerIds(
              {
                ...(pendingTag.opponent ? { opponent: true } : {}),
                ...(pendingTag.statType ? { statType: pendingTag.statType } : {}),
                ...(lookback
                  ? {
                      markedAtSec: lookback.markedAtSec,
                      lookbackSec: lookback.lookbackSec,
                    }
                  : {}),
              },
              players,
              persons as string[],
            ),
            createdBy: currentUid,
            ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
          },
          { actorUid: currentUid },
        );
        setTagMessage(
          `${pendingTag.label}${pendingPlayerId ? ` · ${playerName(pendingPlayerId)}` : ""} at ${formatTimelineSeconds(t)}${
            lookback ? ` (clip from −${lookback.lookbackSec}s)` : ""
          }.`,
        );
      }
      setTagLabel("");
      setPendingTag(null);
      await refreshEvents();
    } catch (e) {
      setTagMessage(e instanceof Error ? e.message : "Could not save the tag.");
    } finally {
      setTagSaving(false);
    }
  }, [
    pendingTag,
    pendingPlayerId,
    pendingAssistId,
    gameId,
    selectedSource,
    currentUid,
    currentDisplayName,
    playerName,
    personIdFor,
    refreshEvents,
  ]);

  const handleDeleteEvent = useCallback(
    async (eventId: string) => {
      try {
        await deleteGameEvent(gameId, eventId);
        if (editingEventId === eventId) setEditingEventId(null);
        if (selectedEventId === eventId) setSelectedEventId(null);
        await refreshEvents();
      } catch {
        setTagMessage("Could not delete that tag.");
      }
    },
    [gameId, editingEventId, selectedEventId, refreshEvents],
  );

  const beginEdit = useCallback((ev: GameTimelineEvent) => {
    setEditingEventId(ev.id);
    setEditLabel(ev.label ?? "");
    setEditPlayerId(getEventPlayerIds(ev)[0] ?? "");
    setEditTime(ev.t);
  }, []);

  const saveEdit = useCallback(async () => {
    const ev = events.find((e) => e.id === editingEventId);
    if (!ev || !game) return;
    const base: Record<string, unknown> = {};
    if (ev.type === "stat") {
      const st = ev.payload?.statType;
      if (typeof st === "string") base.statType = st;
      const note = ev.payload?.note;
      if (typeof note === "string") base.note = note;
    }
    if (ev.payload?.opponent) base.opponent = true;
    const players = editPlayerId ? [editPlayerId] : [];
    const persons = personIdsFor(players);
    if (ev.type === "stat" && players.length === 0) {
      setTagMessage("A stat needs a player.");
      return;
    }
    setTagSaving(true);
    try {
      await addGameEvent(
        gameId,
        {
          id: ev.id,
          type: ev.type,
          t: Math.max(0, Math.round(editTime)),
          label: editLabel.trim() || ev.label || "",
          ...(ev.sourceId ? { sourceId: ev.sourceId } : {}),
          payload: withEventPlayerIds(base, players, persons),
          createdBy: ev.createdBy ?? currentUid,
          ...(ev.createdByName
            ? { createdByName: ev.createdByName }
            : currentDisplayName
              ? { createdByName: currentDisplayName }
              : {}),
        },
        { actorUid: currentUid },
      );
      setEditingEventId(null);
      await refreshEvents();
    } catch (e) {
      setTagMessage(e instanceof Error ? e.message : "Could not update the tag.");
    } finally {
      setTagSaving(false);
    }
  }, [
    events,
    editingEventId,
    game,
    gameId,
    editPlayerId,
    editTime,
    editLabel,
    currentUid,
    currentDisplayName,
    personIdsFor,
    refreshEvents,
  ]);

  const handleAddStat = useCallback(async () => {
    if (!game || statPlayerIds.length === 0) {
      setStatMessage("Select at least one player.");
      return;
    }
    setStatSaving(true);
    setStatMessage(null);
    try {
      await addGameStat(gameId, {
        t: selectedGameTime,
        statType,
        playerIds: statPlayerIds,
        ...(personIdsFor(statPlayerIds).length > 0
          ? { personIds: personIdsFor(statPlayerIds) }
          : {}),
        ...(statNote.trim() ? { note: statNote.trim() } : {}),
        ...(selectedSource?.id ? { sourceId: selectedSource.id } : {}),
        createdBy: currentUid,
        ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
      });
      setStatMessage("Stat saved.");
      setStatNote("");
      await refreshEvents();
    } catch (e) {
      setStatMessage(e instanceof Error ? e.message : "Could not save stat.");
    } finally {
      setStatSaving(false);
    }
  }, [
    game,
    statPlayerIds,
    gameId,
    selectedGameTime,
    statType,
    statNote,
    selectedSource,
    currentUid,
    currentDisplayName,
    personIdsFor,
    refreshEvents,
  ]);

  const handleAddStatFromMark = useCallback(async () => {
    if (!selectedEvent || selectedEvent.type !== "coach_mark") return;
    const draft = statFromCoachMark(selectedEvent, {
      t: selectedGameTime,
      statType,
      playerIds: statPlayerIds.length > 0 ? statPlayerIds : getEventPlayerIds(selectedEvent),
      note: statNote.trim() || undefined,
      sourceId: selectedSource?.id ?? selectedEvent.sourceId,
    });
    if (!draft || draft.playerIds.length === 0) {
      setStatMessage("Tag a player on the coach mark or select players first.");
      return;
    }
    setStatSaving(true);
    setStatMessage(null);
    try {
      const playerIds =
        statPlayerIds.length > 0
          ? statPlayerIds
          : getEventPlayerIds(selectedEvent);
      await addGameStat(gameId, {
        ...draft,
        playerIds,
        ...(personIdsFor(playerIds).length > 0
          ? { personIds: personIdsFor(playerIds) }
          : {}),
        createdBy: currentUid,
        ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
      });
      setStatMessage("Stat saved from coach mark.");
      await refreshEvents();
    } catch (e) {
      setStatMessage(e instanceof Error ? e.message : "Could not save stat.");
    } finally {
      setStatSaving(false);
    }
  }, [
    selectedEvent,
    selectedGameTime,
    statType,
    statPlayerIds,
    statNote,
    selectedSource,
    gameId,
    currentUid,
    currentDisplayName,
    personIdsFor,
    refreshEvents,
  ]);

  const handleDeleteStat = useCallback(
    async (eventId: string) => {
      setStatSaving(true);
      setStatMessage(null);
      try {
        await deleteGameStat(gameId, eventId);
        setStatMessage("Stat removed.");
        await refreshEvents();
      } catch {
        setStatMessage("Could not remove stat.");
      } finally {
        setStatSaving(false);
      }
    },
    [gameId, refreshEvents],
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
        ...(selectedPlayerIds.length > 0
          ? { playerIds: selectedPlayerIds }
          : {}),
      };
      if (draftTarget === "new") {
        if (!newDraftName.trim()) {
          setDraftMessage("Enter a draft name.");
          return;
        }
        await createHighlightDraft(gameId, currentUid, {
          name: newDraftName,
          moment: momentInput,
          ...(selectedPlayerIds.length > 0 ? { playerIds: selectedPlayerIds } : {}),
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
    selectedPlayerIds,
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

  const togglePlayerSelection = useCallback((playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId],
    );
  }, []);

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of teamPlayers) map.set(p.id, p.name);
    return map;
  }, [teamPlayers]);

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

  useEffect(() => {
    if (canEditSources) setReviewTab("tag");
    else if (canManageStats) setReviewTab("stat");
    else setReviewTab("highlight");
  }, [canEditSources, canManageStats]);

  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isFullscreen]);

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
        <Link href={`/game/${gameId}`} className={`${ghostBtn} mt-4 inline-block`}>
          ← Back to Game
        </Link>
      </div>
    );
  }

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[200] flex flex-col bg-[#030306] text-zinc-50"
          : "min-h-screen px-4 py-8 text-zinc-50"
      }
    >
      <div
        className={
          isFullscreen
            ? "flex min-h-0 flex-1 flex-col"
            : "mx-auto max-w-7xl"
        }
      >
        {!isFullscreen ? (
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
          <div className="flex flex-wrap items-center gap-2">
            {playableSources.length > 0 ? (
              <Link href={teamFilmRoomUrl(gameId)} className={primaryBtn}>
                Open Team Film Room
              </Link>
            ) : null}
            <Link href={`/game/${gameId}`} className={ghostBtn}>
              ← Back to Game
            </Link>
          </div>
        </div>
        ) : null}

        {playableSources.length === 0 ? (
          <div className={panelClass}>
            <p className="text-sm text-zinc-400">
              No playable videos yet. Add video from the game page or Add Video,
              then return here to review lined-up angles.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/game/${gameId}`} className={primaryBtn}>
                Game hub
              </Link>
              <Link
                href={gameCapUrl({ teamId: game?.teamId, gameId })}
                className={ghostBtn}
              >
                Add video
              </Link>
            </div>
          </div>
        ) : (
          <div
            className={
              isFullscreen
                ? "flex min-h-0 flex-1"
                : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]"
            }
          >
            <div
              className={
                isFullscreen
                  ? "flex min-h-0 min-w-0 flex-1 flex-col"
                  : "space-y-4"
              }
            >
              <section
                className={
                  isFullscreen
                    ? "flex min-h-0 flex-1 flex-col"
                    : panelClass
                }
              >
                {!isFullscreen ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Preview
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
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
                    {selectedSource?.videoId ? (
                      <button
                        type="button"
                        onClick={() => setIsFullscreen(true)}
                        className={`${ghostBtn} text-[10px]`}
                      >
                        Fullscreen
                      </button>
                    ) : null}
                  </div>
                </div>
                ) : (
                <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 pt-1">
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
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(false)}
                    className={`${ghostBtn} text-[10px]`}
                  >
                    Exit fullscreen
                  </button>
                </div>
                )}

                {selectedSource?.videoId ? (
                  <YoutubeChromelessStage
                    className={
                      isFullscreen
                        ? "min-h-0 flex-1 bg-black"
                        : "aspect-video w-full min-h-[240px] rounded-lg border border-white/[0.08] bg-black lg:min-h-[420px]"
                    }
                  >
                    <YouTube
                      key={selectedSource.id}
                      videoId={selectedSource.videoId}
                      className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
                      opts={{
                        width: "100%",
                        height: "100%",
                        playerVars: {
                          autoplay: 0,
                          ...YOUTUBE_CHROMELESS_PLAYER_VARS,
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
                  </YoutubeChromelessStage>
                ) : null}

                {selectedSource?.videoId ? (
                  <div className={isFullscreen ? "shrink-0 px-1 pb-1 pt-2" : ""}>
                  <VideoTransport
                    playerRef={playerRef}
                    ready={playerReady}
                    onSourceTime={handleTransportTime}
                  />
                  </div>
                ) : null}

                {!isFullscreen && seekWarning ? (
                  <p className="mt-2 text-xs text-amber-200">{seekWarning}</p>
                ) : null}

                {!isFullscreen ? (
                <p className="mt-2 text-[10px] text-zinc-500">
                  {selectedSource?.label} · offset{" "}
                  {selectedSource?.offsetFromGameTime ?? 0}s · scrub the bar to
                  move the tag &amp; stat time
                </p>
                ) : null}
              </section>

              {!isFullscreen ? (
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
              ) : null}

              {!isFullscreen && game ? (
                <AngleMatchSync
                  game={game}
                  sources={playableSources}
                  canEdit={canEditSources}
                  onSaved={() => void refresh()}
                />
              ) : null}

              {!isFullscreen && game ? (
                <ImportTagPlays
                  game={game}
                  currentUid={currentUid}
                  currentDisplayName={currentDisplayName}
                  canEdit={canEditSources}
                  onImported={() => void refreshEvents()}
                />
              ) : null}

              {!isFullscreen && game ? (
                <AiTagDraftPanel
                  game={game}
                  sources={playableSources}
                  events={events}
                  currentUid={currentUid}
                  currentDisplayName={currentDisplayName}
                  canEdit={canEditSources}
                  selectedSourceId={selectedSourceId}
                  onSeekGameTime={(tSec) => {
                    setSelectedGameTime(tSec);
                    void applySeekForGameTime(tSec, selectedSource);
                  }}
                  onEventsChanged={() => {
                    void refreshEvents();
                  }}
                  onRefresh={() => {
                    void refresh();
                  }}
                />
              ) : null}
            </div>

            <div
              className={
                isFullscreen
                  ? "flex w-[min(100%,22rem)] shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-zinc-950/95 p-3 sm:w-96"
                  : "space-y-4"
              }
            >
              <section className={panelClass}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Timeline
                </p>
                {events.length === 0 ? (
                  <p className="text-[11px] leading-snug text-zinc-500">
                    No tagged plays or timeline events yet. Use Tag Plays to
                    add marks — they appear here for lined-up review.
                  </p>
                ) : (
                  <ul
                    className={`space-y-1 overflow-y-auto pr-1 ${
                      isFullscreen
                        ? "max-h-[22vh]"
                        : "max-h-[28vh] xl:max-h-[36vh]"
                    }`}
                  >
                    {events.map((ev) => {
                      const active = Math.abs(ev.t - selectedGameTime) < 0.25;
                      const isEditing = editingEventId === ev.id;
                      return (
                        <li key={ev.id}>
                          <div
                            className={`rounded-lg border px-2.5 py-2 transition ${
                              active
                                ? "border-emerald-500/45 bg-emerald-950/25"
                                : "border-white/[0.06] bg-black/25"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={() => handleSelectEvent(ev)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-[11px] text-zinc-300">
                                    {formatTimelineSeconds(ev.t)}
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
                                    {ev.type === "stat"
                                      ? statTypeLabel(
                                          parseGameStat(ev)?.statType ?? "custom",
                                          reviewSportId,
                                        )
                                      : eventTypeLabel(ev.type)}
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
                                {getEventPlayerIds(ev).length > 0 ? (
                                  <p className="mt-0.5 text-[10px] text-violet-300">
                                    {getEventPlayerIds(ev)
                                      .map((id) => playerNameById.get(id) ?? id)
                                      .join(", ")}
                                  </p>
                                ) : null}
                              </button>
                              {canEditSources ? (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      isEditing ? setEditingEventId(null) : beginEdit(ev)
                                    }
                                    aria-label="Edit tag"
                                    className="rounded-md border border-white/10 px-1.5 py-1 text-[10px] text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.06]"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteEvent(ev.id)}
                                    aria-label="Delete tag"
                                    className="rounded-md border border-rose-500/25 px-1.5 py-1 text-[10px] text-rose-200 transition hover:border-rose-500/40 hover:bg-rose-950/30"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {isEditing ? (
                              <div className="mt-2 space-y-2 border-t border-white/[0.08] pt-2">
                                <input
                                  type="text"
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  placeholder="Label"
                                  className={inputClass}
                                />
                                {teamPlayers.length > 0 ? (
                                  <select
                                    value={editPlayerId}
                                    onChange={(e) => setEditPlayerId(e.target.value)}
                                    className={inputClass}
                                  >
                                    <option value="">
                                      {ev.type === "stat"
                                        ? "Select player…"
                                        : "No player"}
                                    </option>
                                    {teamPlayers.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                        {p.jerseyNumber ? ` #${p.jerseyNumber}` : ""}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-zinc-400">
                                    {formatTimelineSeconds(editTime)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setEditTime(selectedGameTime)}
                                    className={`${ghostBtn} text-[10px]`}
                                  >
                                    Set to current time
                                  </button>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void saveEdit()}
                                    disabled={tagSaving}
                                    className={primaryBtn}
                                  >
                                    {tagSaving ? "…" : "Update"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingEventId(null)}
                                    className={ghostBtn}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className={panelClass}>
                <div className="mb-3 flex flex-wrap gap-1 border-b border-white/[0.06] pb-2">
                  {canEditSources ? (
                    <button
                      type="button"
                      onClick={() => setReviewTab("tag")}
                      className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                        reviewTab === "tag"
                          ? "bg-blue-600/35 text-white"
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                      }`}
                    >
                      Tag
                    </button>
                  ) : null}
                  {canManageStats ? (
                    <button
                      type="button"
                      onClick={() => setReviewTab("stat")}
                      className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                        reviewTab === "stat"
                          ? "bg-blue-600/35 text-white"
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                      }`}
                    >
                      Stat
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setReviewTab("highlight")}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                      reviewTab === "highlight"
                        ? "bg-blue-600/35 text-white"
                        : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                    }`}
                  >
                    Highlight
                  </button>
                  {canAttachAcademyEvidence ? (
                    <button
                      type="button"
                      onClick={() => setReviewTab("develop")}
                      className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                        reviewTab === "develop"
                          ? "bg-blue-600/35 text-white"
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                      }`}
                    >
                      Develop
                    </button>
                  ) : null}
                </div>

              {canEditSources && reviewTab === "tag" ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Tag a play
                  </p>
                  <p className="mb-3 text-[11px] leading-snug text-zinc-500">
                    {reviewSportId === "basketball"
                      ? "Youth basketball film room — tap Bucket, Assist, Rebound, and more. Video pauses so you can attribute a player (or none)."
                      : "Tap a tag — the video pauses so you can attribute a player (or none) before saving. The mark lands at the time below."}
                  </p>

                  <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                      Mark time
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-200">
                      {formatTimelineSeconds(selectedGameTime)}
                    </p>
                  </div>

                  {pendingTag ? (
                    <div className="mb-3 rounded-lg border border-blue-500/40 bg-blue-950/25 p-3">
                      <p className="text-[11px] font-medium text-blue-100">
                        {pendingTag.label} at {formatTimelineSeconds(pendingTag.t)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-blue-200/70">
                        Video paused. Attribute a player — or save with none.
                      </p>

                      <div className="mt-2 space-y-2">
                        <label className="block">
                          <span className="mb-1 block text-[10px] text-blue-200/70">
                            {isScoringStatType(pendingTag.statType)
                              ? "Scorer"
                              : "Player"}{" "}
                            (optional)
                          </span>
                          <select
                            autoFocus
                            value={pendingPlayerId}
                            disabled={tagSaving}
                            onChange={(e) => setPendingPlayerId(e.target.value)}
                            className={inputClass}
                          >
                            <option value="">No player</option>
                            {teamPlayers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {p.jerseyNumber ? ` #${p.jerseyNumber}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>

                        {isScoringStatType(pendingTag.statType) ? (
                          <label className="block">
                            <span className="mb-1 block text-[10px] text-blue-200/70">
                              Assist (optional)
                            </span>
                            <select
                              value={pendingAssistId}
                              disabled={tagSaving}
                              onChange={(e) => setPendingAssistId(e.target.value)}
                              className={inputClass}
                            >
                              <option value="">No assist</option>
                              {teamPlayers
                                .filter((p) => p.id !== pendingPlayerId)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                    {p.jerseyNumber ? ` #${p.jerseyNumber}` : ""}
                                  </option>
                                ))}
                            </select>
                          </label>
                        ) : null}

                        {teamPlayers.length === 0 ? (
                          <p className="text-[10px] text-blue-200/60">
                            Link this game to a team roster to attribute players.
                          </p>
                        ) : null}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void commitPendingTag()}
                            disabled={tagSaving}
                            className={primaryBtn}
                          >
                            {tagSaving ? "…" : "Save mark"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingTag(null)}
                            className={ghostBtn}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <p className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
                    Our team
                  </p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {quickTags.map((tag: ReviewQuickTag) => (
                      <button
                        key={tag.label}
                        type="button"
                        disabled={tagSaving}
                        onClick={() =>
                          tag.kind === "stat" &&
                          beginTag({ label: tag.label, statType: tag.statType })
                        }
                        className={`${ghostBtn} disabled:opacity-50`}
                      >
                        {tag.label}
                      </button>
                    ))}
                    {markTags.map((tag) => (
                      <button
                        key={tag.label}
                        type="button"
                        disabled={tagSaving}
                        onClick={() => beginTag({ label: tag.label })}
                        className={`${ghostBtn} disabled:opacity-50`}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>

                  <p className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
                    Other team
                  </p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {opponentTags.map((tag) => (
                      <button
                        key={tag.label}
                        type="button"
                        disabled={tagSaving}
                        onClick={() =>
                          beginTag({ label: tag.label, opponent: true })
                        }
                        className="rounded-lg border border-amber-500/25 bg-amber-950/15 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:border-amber-500/40 hover:bg-amber-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>

                  <div className="mb-1 flex gap-2">
                    <input
                      type="text"
                      value={tagLabel}
                      onChange={(e) => setTagLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tagLabel.trim()) {
                          beginTag({ label: tagLabel });
                        }
                      }}
                      placeholder="Custom play…"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => beginTag({ label: tagLabel })}
                      disabled={tagSaving || !tagLabel.trim()}
                      className={primaryBtn}
                    >
                      {tagSaving ? "…" : "Tag"}
                    </button>
                  </div>

                  {tagMessage ? (
                    <p className="mt-2 text-[11px] text-zinc-400">{tagMessage}</p>
                  ) : null}
                </div>
              ) : null}

              {canManageStats && reviewTab === "stat" ? (
                <div id="stats" className="scroll-mt-6">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Add stat
                  </p>
                  <p className="mb-3 text-[11px] leading-snug text-zinc-500">
                    Log a stat at the selected game time. Choose players and
                    stat type, then save.
                  </p>

                  <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                      Selected game time
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-200">
                      {formatTimelineSeconds(selectedGameTime)}
                    </p>
                  </div>

                  <label className="mb-3 block">
                    <span className="mb-1 block text-[10px] text-zinc-500">
                      Stat type
                    </span>
                    <select
                      value={statType}
                      onChange={(e) =>
                        setStatType(e.target.value as GameStatType)
                      }
                      className={inputClass}
                    >
                      {availableStatTypes.map((type) => (
                        <option key={type} value={type}>
                          {statTypeLabel(type, reviewSportId)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {teamPlayers.length > 0 ? (
                    <div className="mb-3">
                      <p className="mb-1.5 text-[10px] text-zinc-500">Players</p>
                      <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/20 p-2">
                        {teamPlayers.map((p) => {
                          const active = statPlayerIds.includes(p.id);
                          return (
                            <li key={p.id}>
                              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => toggleStatPlayer(p.id)}
                                  className="rounded border-white/20"
                                />
                                <span>
                                  {p.name}
                                  {p.jerseyNumber ? ` #${p.jerseyNumber}` : ""}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <p className="mb-3 text-[11px] text-zinc-500">
                      Link this game to a team roster to tag players on stats.
                    </p>
                  )}

                  <label className="mb-3 block">
                    <span className="mb-1 block text-[10px] text-zinc-500">
                      Note (optional)
                    </span>
                    <input
                      type="text"
                      value={statNote}
                      onChange={(e) => setStatNote(e.target.value)}
                      placeholder="e.g. Near-post finish"
                      className={inputClass}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleAddStat()}
                    disabled={statSaving || statPlayerIds.length === 0}
                    className={`${primaryBtn} mb-2 w-full`}
                  >
                    {statSaving ? "Saving…" : "Save stat"}
                  </button>

                  {selectedEvent?.type === "coach_mark" ? (
                    <button
                      type="button"
                      onClick={() => void handleAddStatFromMark()}
                      disabled={statSaving}
                      className={`${ghostBtn} w-full`}
                    >
                      Add stat from coach mark
                    </button>
                  ) : null}

                  {statMessage ? (
                    <p className="mt-2 text-[11px] text-zinc-400">{statMessage}</p>
                  ) : null}

                  {gameStats.length > 0 ? (
                    <div className="mt-4 border-t border-white/[0.06] pt-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Game stats ({gameStats.length})
                      </p>
                      <ul className="max-h-32 space-y-1 overflow-y-auto">
                        {gameStats.map((stat) => (
                          <li
                            key={stat.eventId}
                            className="flex items-center justify-between gap-2 rounded border border-white/[0.05] bg-black/20 px-2 py-1.5"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedGameTime(stat.t);
                                setSelectedEventId(stat.eventId);
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <span className="font-mono text-[10px] text-zinc-400">
                                {formatTimelineSeconds(stat.t)}
                              </span>
                              <span className="ml-2 text-[11px] text-zinc-200">
                                {statTypeLabel(stat.statType, reviewSportId)}
                              </span>
                              <span className="ml-1 text-[10px] text-zinc-500">
                                {stat.playerIds
                                  .map((id) => playerNameById.get(id) ?? id)
                                  .join(", ")}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteStat(stat.eventId)}
                              disabled={statSaving}
                              className={dangerBtn}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {canAttachAcademyEvidence && reviewTab === "develop" ? (
                <AcademyFilmEvidencePicker
                  gameId={gameId}
                  teamId={game!.teamId!}
                  currentUid={currentUid}
                  selectedEvent={selectedEvent}
                />
              ) : null}

              {reviewTab === "highlight" ? (
                <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Highlight Reel
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

                {teamPlayers.length > 0 ? (
                  <div className="mb-3">
                    <p className="mb-1.5 text-[10px] text-zinc-500">
                      Tag player (optional)
                    </p>
                    <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/20 p-2">
                      {teamPlayers.map((p) => {
                        const active = selectedPlayerIds.includes(p.id);
                        return (
                          <li key={p.id}>
                            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                              <input
                                type="checkbox"
                                checked={active}
                                onChange={() => togglePlayerSelection(p.id)}
                                className="rounded border-white/20"
                              />
                              <span>
                                {p.name}
                                {p.jerseyNumber ? ` #${p.jerseyNumber}` : ""}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

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
                  {draftSaving ? "Saving…" : "Save to Highlight Reel"}
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
                </div>
              ) : null}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
