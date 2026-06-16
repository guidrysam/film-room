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
};

export type HighlightDraftMeta = {
  schema: typeof HIGHLIGHT_DRAFT_SCHEMA;
  moments: HighlightMoment[];
};

export type HighlightDraft = {
  id: string;
  name: string;
  gameId: string;
  moments: HighlightMoment[];
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
};

function randomMomentId(): string {
  return `hm_${Math.random().toString(36).slice(2, 10)}`;
}

export function isHighlightDraft(track: DirectorTrack): boolean {
  return track.kind === "highlight";
}

export function serializeHighlightDraftMeta(
  moments: HighlightMoment[],
): string {
  const meta: HighlightDraftMeta = {
    schema: HIGHLIGHT_DRAFT_SCHEMA,
    moments,
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
      });
    }
    return { schema: HIGHLIGHT_DRAFT_SCHEMA, moments };
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
    ...(track.createdBy ? { createdBy: track.createdBy } : {}),
    ...(track.createdByName ? { createdByName: track.createdByName } : {}),
  };
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

export async function createHighlightDraft(
  gameId: string,
  uid: string,
  input: {
    name: string;
    moment: AddHighlightMomentInput;
    createdByName?: string;
  },
): Promise<string> {
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
  };
  return createDirectorTrack(gameId, {
    kind: "highlight",
    name: input.name.trim() || "Highlight draft",
    visibility: "private",
    gameId,
    createdBy: uid,
    track: highlightMomentsToTrackEvents([moment]),
    description: serializeHighlightDraftMeta([moment]),
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
  };
  const next = [...moments, moment];
  await updateDirectorTrack(gameId, draftId, {
    track: highlightMomentsToTrackEvents(next),
    description: serializeHighlightDraftMeta(next),
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
    description: serializeHighlightDraftMeta(next),
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
