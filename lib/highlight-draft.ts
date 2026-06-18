import {
  createDirectorTrack,
  deleteDirectorTrack,
  getDirectorTrack,
  listDirectorTracks,
  updateDirectorTrack,
  type DirectorTrack,
  type DirectorTrackEvent,
} from "@/lib/games";

/**
 * Highlight draft moments stored as DirectorTracks (`kind: "highlight"`).
 * Moment metadata lives in `description` (JSON); playback instructions in `track`.
 */

export const HIGHLIGHT_DRAFT_SCHEMA = "highlight_draft_v1" as const;

export type HighlightMoment = {
  id: string;
  gameTime: number;
  startOffsetSec: number;
  endOffsetSec: number;
  activeSourceId: string;
  label?: string;
  timelineEventId?: string;
  /** Players tagged on this moment (optional). */
  playerIds?: string[];
};

export type HighlightDraftMeta = {
  schema: typeof HIGHLIGHT_DRAFT_SCHEMA;
  moments: HighlightMoment[];
  /** Players assigned to the whole draft (optional). */
  playerIds?: string[];
};

export type HighlightDraft = {
  id: string;
  name: string;
  gameId: string;
  moments: HighlightMoment[];
  playerIds?: string[];
  createdBy?: string;
  createdByName?: string;
};

export type AddHighlightMomentInput = {
  gameTime: number;
  activeSourceId: string;
  startOffsetSec?: number;
  endOffsetSec?: number;
  label?: string;
  timelineEventId?: string;
  playerIds?: string[];
};

function randomMomentId(): string {
  return `hm_${Math.random().toString(36).slice(2, 10)}`;
}

export function isHighlightDraft(track: DirectorTrack): boolean {
  return track.kind === "highlight";
}

function parsePlayerIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string => typeof id === "string" && id.trim() !== "",
  );
}

function uniquePlayerIds(...groups: (string[] | undefined)[]): string[] {
  const set = new Set<string>();
  for (const g of groups) {
    for (const id of g ?? []) set.add(id);
  }
  return [...set];
}

export function serializeHighlightDraftMeta(
  moments: HighlightMoment[],
  playerIds?: string[],
): string {
  const meta: HighlightDraftMeta = {
    schema: HIGHLIGHT_DRAFT_SCHEMA,
    moments,
    ...(playerIds && playerIds.length > 0 ? { playerIds } : {}),
  };
  return JSON.stringify(meta);
}

export function parseHighlightDraftMeta(
  track: DirectorTrack,
): HighlightDraftMeta | null {
  if (!isHighlightDraft(track) || !track.description?.trim()) return null;
  try {
    const raw = JSON.parse(track.description) as HighlightDraftMeta;
    if (raw?.schema !== HIGHLIGHT_DRAFT_SCHEMA || !Array.isArray(raw.moments)) {
      return null;
    }
    const moments: HighlightMoment[] = [];
    for (const m of raw.moments) {
      if (!m || typeof m !== "object") continue;
      if (typeof m.id !== "string" || typeof m.gameTime !== "number") continue;
      if (typeof m.activeSourceId !== "string") continue;
      moments.push({
        id: m.id,
        gameTime: m.gameTime,
        startOffsetSec:
          typeof m.startOffsetSec === "number" ? m.startOffsetSec : -5,
        endOffsetSec: typeof m.endOffsetSec === "number" ? m.endOffsetSec : 10,
        activeSourceId: m.activeSourceId,
        ...(typeof m.label === "string" && m.label.trim()
          ? { label: m.label.trim() }
          : {}),
        ...(typeof m.timelineEventId === "string"
          ? { timelineEventId: m.timelineEventId }
          : {}),
        ...(parsePlayerIds(m.playerIds).length > 0
          ? { playerIds: parsePlayerIds(m.playerIds) }
          : {}),
      });
    }
    const draftPlayerIds = parsePlayerIds(raw.playerIds);
    return {
      schema: HIGHLIGHT_DRAFT_SCHEMA,
      moments,
      ...(draftPlayerIds.length > 0 ? { playerIds: draftPlayerIds } : {}),
    };
  } catch {
    return null;
  }
}

/** Instruction events for each highlight moment (no rendered video). */
export function highlightMomentsToTrackEvents(
  moments: HighlightMoment[],
): DirectorTrackEvent[] {
  const events: DirectorTrackEvent[] = [];
  for (const m of moments) {
    const clipStart = Math.max(0, m.gameTime + m.startOffsetSec);
    const clipEnd = Math.max(clipStart, m.gameTime + m.endOffsetSec);
    events.push({
      t: clipStart,
      type: "camera_switch",
      activeSource: m.activeSourceId,
    });
    events.push({
      t: m.gameTime,
      type: "note",
      note: m.label?.trim() || "Highlight moment",
    });
    events.push({
      t: clipEnd,
      type: "note",
      note: "__highlight_end__",
    });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

export function highlightDraftFromTrack(track: DirectorTrack): HighlightDraft | null {
  const meta = parseHighlightDraftMeta(track);
  if (!meta) return null;
  return {
    id: track.id,
    name: track.name,
    gameId: track.gameId ?? "",
    moments: meta.moments,
    ...(meta.playerIds && meta.playerIds.length > 0
      ? { playerIds: meta.playerIds }
      : {}),
    ...(track.createdBy ? { createdBy: track.createdBy } : {}),
    ...(track.createdByName ? { createdByName: track.createdByName } : {}),
  };
}

/** Whether a highlight draft is associated with a player (draft or moment level). */
export function highlightDraftMatchesPlayer(
  draft: HighlightDraft,
  playerId: string,
): boolean {
  if (draft.playerIds?.includes(playerId)) return true;
  return draft.moments.some((m) => m.playerIds?.includes(playerId));
}

/** Moments in a draft tagged for a specific player. */
export function highlightMomentsForPlayer(
  draft: HighlightDraft,
  playerId: string,
): HighlightMoment[] {
  const draftLevel = draft.playerIds?.includes(playerId);
  if (draftLevel && !draft.moments.some((m) => m.playerIds?.length)) {
    return draft.moments;
  }
  return draft.moments.filter(
    (m) =>
      m.playerIds?.includes(playerId) ||
      (draftLevel && (!m.playerIds || m.playerIds.length === 0)),
  );
}

export async function listHighlightDrafts(
  gameId: string,
  uid: string,
): Promise<HighlightDraft[]> {
  const tracks = await listDirectorTracks(gameId, uid);
  const out: HighlightDraft[] = [];
  for (const t of tracks) {
    if (!isHighlightDraft(t)) continue;
    if (t.createdBy && t.createdBy !== uid) continue;
    const draft = highlightDraftFromTrack(t);
    if (draft) out.push(draft);
  }
  return out;
}

/** Highlight drafts across all team games that reference a player. */
export async function listHighlightDraftsForPlayer(
  teamId: string,
  playerId: string,
  uid: string,
): Promise<HighlightDraft[]> {
  const { listGamesForTeam } = await import("@/lib/games");
  const games = await listGamesForTeam(teamId);
  const out: HighlightDraft[] = [];
  for (const game of games) {
    const tracks = await listDirectorTracks(game.id, uid);
    for (const t of tracks) {
      if (!isHighlightDraft(t)) continue;
      const draft = highlightDraftFromTrack(t);
      if (draft && highlightDraftMatchesPlayer(draft, playerId)) {
        out.push({ ...draft, gameId: game.id });
      }
    }
  }
  return out;
}

export async function createHighlightDraft(
  gameId: string,
  uid: string,
  input: {
    name: string;
    moment: AddHighlightMomentInput;
    createdByName?: string;
    playerIds?: string[];
  },
): Promise<string> {
  const momentPlayerIds = parsePlayerIds(input.moment.playerIds);
  const moment: HighlightMoment = {
    id: randomMomentId(),
    gameTime: Math.max(0, input.moment.gameTime),
    startOffsetSec: input.moment.startOffsetSec ?? -5,
    endOffsetSec: input.moment.endOffsetSec ?? 10,
    activeSourceId: input.moment.activeSourceId,
    ...(input.moment.label?.trim() ? { label: input.moment.label.trim() } : {}),
    ...(input.moment.timelineEventId
      ? { timelineEventId: input.moment.timelineEventId }
      : {}),
    ...(momentPlayerIds.length > 0 ? { playerIds: momentPlayerIds } : {}),
  };
  const draftPlayerIds = uniquePlayerIds(input.playerIds, momentPlayerIds);
  return createDirectorTrack(gameId, {
    kind: "highlight",
    name: input.name.trim() || "Highlight draft",
    visibility: "private",
    gameId,
    createdBy: uid,
    track: highlightMomentsToTrackEvents([moment]),
    description: serializeHighlightDraftMeta(
      [moment],
      draftPlayerIds.length > 0 ? draftPlayerIds : undefined,
    ),
    ...(input.createdByName ? { createdByName: input.createdByName } : {}),
  });
}

export async function appendHighlightMoment(
  gameId: string,
  draftId: string,
  momentInput: AddHighlightMomentInput,
): Promise<void> {
  const track = await getDirectorTrack(gameId, draftId);
  if (!track || !isHighlightDraft(track)) {
    throw new Error("Highlight draft not found.");
  }
  const meta = parseHighlightDraftMeta(track);
  const moments = meta?.moments ?? [];
  const momentPlayerIds = parsePlayerIds(momentInput.playerIds);
  const moment: HighlightMoment = {
    id: randomMomentId(),
    gameTime: Math.max(0, momentInput.gameTime),
    startOffsetSec: momentInput.startOffsetSec ?? -5,
    endOffsetSec: momentInput.endOffsetSec ?? 10,
    activeSourceId: momentInput.activeSourceId,
    ...(momentInput.label?.trim() ? { label: momentInput.label.trim() } : {}),
    ...(momentInput.timelineEventId
      ? { timelineEventId: momentInput.timelineEventId }
      : {}),
    ...(momentPlayerIds.length > 0 ? { playerIds: momentPlayerIds } : {}),
  };
  const next = [...moments, moment];
  const draftPlayerIds = uniquePlayerIds(meta?.playerIds, momentPlayerIds);
  await updateDirectorTrack(gameId, draftId, {
    track: highlightMomentsToTrackEvents(next),
    description: serializeHighlightDraftMeta(
      next,
      draftPlayerIds.length > 0 ? draftPlayerIds : undefined,
    ),
  });
}

export async function removeHighlightMoment(
  gameId: string,
  draftId: string,
  momentId: string,
): Promise<void> {
  const track = await getDirectorTrack(gameId, draftId);
  if (!track || !isHighlightDraft(track)) {
    throw new Error("Highlight draft not found.");
  }
  const meta = parseHighlightDraftMeta(track);
  const moments = meta?.moments ?? [];
  const next = moments.filter((m) => m.id !== momentId);
  if (next.length === moments.length) {
    throw new Error("Moment not found.");
  }
  if (next.length === 0) {
    await deleteDirectorTrack(gameId, draftId);
    return;
  }
  await updateDirectorTrack(gameId, draftId, {
    track: highlightMomentsToTrackEvents(next),
    description: serializeHighlightDraftMeta(
      next,
      meta?.playerIds,
    ),
  });
}

/** Playback point for a single saved moment (clip start). */
export function highlightMomentPlayhead(
  moment: HighlightMoment,
): { gameTime: number; activeSourceId: string } {
  return {
    gameTime: Math.max(0, moment.gameTime + moment.startOffsetSec),
    activeSourceId: moment.activeSourceId,
  };
}

/** First playback point for a draft (clip start of earliest moment). */
export function highlightDraftPlayhead(
  draft: HighlightDraft,
  momentIndex = 0,
): { gameTime: number; activeSourceId: string } | null {
  const m = draft.moments[momentIndex];
  if (!m) return null;
  return {
    gameTime: Math.max(0, m.gameTime + m.startOffsetSec),
    activeSourceId: m.activeSourceId,
  };
}
