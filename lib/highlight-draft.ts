import {
  createDirectorTrack,
  deleteDirectorTrack,
  getDirectorTrack,
  listDirectorTracks,
  updateDirectorTrack,
  type CutVisibility,
  type DirectorTrack,
  type DirectorTrackEvent,
} from "@/lib/games";
import {
  normalizeHighlightSoundtrack,
  type HighlightSoundtrack,
} from "@/lib/highlight-soundtrack";
import {
  normalizeHighlightSponsors,
  type HighlightSponsorLogo,
} from "@/lib/highlight-sponsors";
import type { ReelTitleLogoSource } from "@/lib/highlight-reel-cards";

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
  /** Goal scorer(s) when this moment is a goal or goal+assist clip. */
  goalPlayerIds?: string[];
  /** Assisting player(s) when this moment is an assist or goal+assist clip. */
  assistPlayerIds?: string[];
  /** Playback rate for this segment (0.25–2). Default 1. */
  speed?: number;
  /** How many times to play this segment (1–10). Default 1. */
  repeat?: number;
  /** Slow push-in zoom over the clip (Ken Burns). */
  kenBurns?: boolean;
};

/** Allowed playback speeds offered in the reel UI. */
export const HIGHLIGHT_SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;

/** Clamp an arbitrary value to a usable segment speed (default 1). */
export function normalizeHighlightSpeed(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(2, Math.max(0.25, n));
}

/** Clamp an arbitrary value to an integer repeat count 1–10 (default 1). */
export function normalizeHighlightRepeat(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, Math.round(n)));
}

export type HighlightDraftMeta = {
  schema: typeof HIGHLIGHT_DRAFT_SCHEMA;
  moments: HighlightMoment[];
  /** Players assigned to the whole draft (optional). */
  playerIds?: string[];
  /** Drive audio bed for preview / share / length target. */
  soundtrack?: HighlightSoundtrack;
  /** Sponsor logos for the thank-you end card. */
  sponsors?: HighlightSponsorLogo[];
  /** Which crest to show on the opening title card. */
  titleLogoSource?: ReelTitleLogoSource;
  /** Logo URL when {@link titleLogoSource} is `custom` (any of my club/team crests). */
  titleLogoUrl?: string;
};

export type HighlightDraft = {
  id: string;
  name: string;
  gameId: string;
  moments: HighlightMoment[];
  playerIds?: string[];
  soundtrack?: HighlightSoundtrack;
  sponsors?: HighlightSponsorLogo[];
  titleLogoSource?: ReelTitleLogoSource;
  titleLogoUrl?: string;
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
  goalPlayerIds?: string[];
  assistPlayerIds?: string[];
  speed?: number;
  repeat?: number;
  kenBurns?: boolean;
};

function randomMomentId(): string {
  return `hm_${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a normalized HighlightMoment from add-input (assigns a fresh id). */
function momentFromInput(input: AddHighlightMomentInput): HighlightMoment {
  const playerIds = parsePlayerIds(input.playerIds);
  const speed = normalizeHighlightSpeed(input.speed);
  const repeat = normalizeHighlightRepeat(input.repeat);
  return {
    id: randomMomentId(),
    gameTime: Math.max(0, input.gameTime),
    startOffsetSec: input.startOffsetSec ?? -5,
    endOffsetSec: input.endOffsetSec ?? 10,
    activeSourceId: input.activeSourceId,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.timelineEventId ? { timelineEventId: input.timelineEventId } : {}),
    ...(playerIds.length > 0 ? { playerIds } : {}),
    ...(parsePlayerIds(input.goalPlayerIds).length > 0
      ? { goalPlayerIds: parsePlayerIds(input.goalPlayerIds) }
      : {}),
    ...(parsePlayerIds(input.assistPlayerIds).length > 0
      ? { assistPlayerIds: parsePlayerIds(input.assistPlayerIds) }
      : {}),
    ...(speed !== 1 ? { speed } : {}),
    ...(repeat !== 1 ? { repeat } : {}),
    ...(input.kenBurns ? { kenBurns: true } : {}),
  };
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
  soundtrack?: HighlightSoundtrack | null,
  sponsors?: HighlightSponsorLogo[] | null,
  titleLogoSource?: ReelTitleLogoSource | null,
  titleLogoUrl?: string | null,
): string {
  const customLogo =
    titleLogoSource === "custom" ? titleLogoUrl?.trim() || "" : "";
  const meta: HighlightDraftMeta = {
    schema: HIGHLIGHT_DRAFT_SCHEMA,
    moments,
    ...(playerIds && playerIds.length > 0 ? { playerIds } : {}),
    ...(soundtrack ? { soundtrack } : {}),
    ...(sponsors && sponsors.length > 0 ? { sponsors } : {}),
    ...(titleLogoSource && titleLogoSource !== "auto"
      ? { titleLogoSource }
      : {}),
    ...(customLogo ? { titleLogoUrl: customLogo } : {}),
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
        ...(parsePlayerIds(m.goalPlayerIds).length > 0
          ? { goalPlayerIds: parsePlayerIds(m.goalPlayerIds) }
          : {}),
        ...(parsePlayerIds(m.assistPlayerIds).length > 0
          ? { assistPlayerIds: parsePlayerIds(m.assistPlayerIds) }
          : {}),
        ...(m.speed !== undefined && normalizeHighlightSpeed(m.speed) !== 1
          ? { speed: normalizeHighlightSpeed(m.speed) }
          : {}),
        ...(m.repeat !== undefined && normalizeHighlightRepeat(m.repeat) !== 1
          ? { repeat: normalizeHighlightRepeat(m.repeat) }
          : {}),
        ...(m.kenBurns === true ? { kenBurns: true } : {}),
      });
    }
    const draftPlayerIds = parsePlayerIds(raw.playerIds);
    const soundtrack = normalizeHighlightSoundtrack(raw.soundtrack);
    const sponsors = normalizeHighlightSponsors(raw.sponsors);
    const titleLogoSource = parseTitleLogoSource(raw.titleLogoSource);
    const titleLogoUrl =
      typeof raw.titleLogoUrl === "string" && raw.titleLogoUrl.trim()
        ? raw.titleLogoUrl.trim()
        : undefined;
    const resolvedSource =
      titleLogoSource ?? (titleLogoUrl ? ("custom" as const) : undefined);
    return {
      schema: HIGHLIGHT_DRAFT_SCHEMA,
      moments,
      ...(draftPlayerIds.length > 0 ? { playerIds: draftPlayerIds } : {}),
      ...(soundtrack ? { soundtrack } : {}),
      ...(sponsors.length > 0 ? { sponsors } : {}),
      ...(resolvedSource ? { titleLogoSource: resolvedSource } : {}),
      ...(resolvedSource === "custom" && titleLogoUrl
        ? { titleLogoUrl }
        : {}),
    };
  } catch {
    return null;
  }
}

function parseTitleLogoSource(raw: unknown): ReelTitleLogoSource | undefined {
  if (
    raw === "club" ||
    raw === "team" ||
    raw === "custom" ||
    raw === "none" ||
    raw === "auto"
  ) {
    return raw;
  }
  return undefined;
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
    ...(meta.soundtrack ? { soundtrack: meta.soundtrack } : {}),
    ...(meta.sponsors && meta.sponsors.length > 0
      ? { sponsors: meta.sponsors }
      : {}),
    ...(meta.titleLogoSource ? { titleLogoSource: meta.titleLogoSource } : {}),
    ...(meta.titleLogoUrl ? { titleLogoUrl: meta.titleLogoUrl } : {}),
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
  const moment = momentFromInput(input.moment);
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
  const moment = momentFromInput(momentInput);
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

export type UpdateHighlightMomentPatch = {
  gameTime?: number;
  startOffsetSec?: number;
  endOffsetSec?: number;
  activeSourceId?: string;
  /** Pass an empty string to clear the label. */
  label?: string;
  speed?: number;
  repeat?: number;
  playerIds?: string[];
};

/** Persist a moment list, deleting the draft when it becomes empty. */
async function persistMoments(
  gameId: string,
  draftId: string,
  moments: HighlightMoment[],
  playerIds?: string[],
): Promise<void> {
  if (moments.length === 0) {
    await deleteDirectorTrack(gameId, draftId);
    return;
  }
  await updateDirectorTrack(gameId, draftId, {
    track: highlightMomentsToTrackEvents(moments),
    description: serializeHighlightDraftMeta(
      moments,
      playerIds && playerIds.length > 0 ? playerIds : undefined,
    ),
  });
}

/** Edit a single moment in place (angle, in/out, speed, repeat, label, players). */
export async function updateHighlightMoment(
  gameId: string,
  draftId: string,
  momentId: string,
  patch: UpdateHighlightMomentPatch,
): Promise<void> {
  const track = await getDirectorTrack(gameId, draftId);
  if (!track || !isHighlightDraft(track)) {
    throw new Error("Highlight draft not found.");
  }
  const meta = parseHighlightDraftMeta(track);
  const moments = meta?.moments ?? [];
  let found = false;
  const next = moments.map((m) => {
    if (m.id !== momentId) return m;
    found = true;
    const updated: HighlightMoment = { ...m };
    if (typeof patch.gameTime === "number") {
      updated.gameTime = Math.max(0, patch.gameTime);
    }
    if (typeof patch.startOffsetSec === "number") {
      updated.startOffsetSec = patch.startOffsetSec;
    }
    if (typeof patch.endOffsetSec === "number") {
      updated.endOffsetSec = patch.endOffsetSec;
    }
    if (patch.activeSourceId?.trim()) {
      updated.activeSourceId = patch.activeSourceId.trim();
    }
    if (patch.label !== undefined) {
      const l = patch.label.trim();
      if (l) updated.label = l;
      else delete updated.label;
    }
    if (patch.speed !== undefined) {
      const s = normalizeHighlightSpeed(patch.speed);
      if (s !== 1) updated.speed = s;
      else delete updated.speed;
    }
    if (patch.repeat !== undefined) {
      const r = normalizeHighlightRepeat(patch.repeat);
      if (r !== 1) updated.repeat = r;
      else delete updated.repeat;
    }
    if (patch.playerIds !== undefined) {
      const pids = parsePlayerIds(patch.playerIds);
      if (pids.length > 0) updated.playerIds = pids;
      else delete updated.playerIds;
    }
    return updated;
  });
  if (!found) throw new Error("Moment not found.");
  await persistMoments(gameId, draftId, next, meta?.playerIds);
}

/** Reorder moments to match `orderedIds` (unknown ids ignored, missing appended). */
export async function reorderHighlightMoments(
  gameId: string,
  draftId: string,
  orderedIds: string[],
): Promise<void> {
  const track = await getDirectorTrack(gameId, draftId);
  if (!track || !isHighlightDraft(track)) {
    throw new Error("Highlight draft not found.");
  }
  const meta = parseHighlightDraftMeta(track);
  const moments = meta?.moments ?? [];
  const byId = new Map(moments.map((m) => [m.id, m]));
  const next: HighlightMoment[] = [];
  for (const id of orderedIds) {
    const m = byId.get(id);
    if (m) {
      next.push(m);
      byId.delete(id);
    }
  }
  for (const m of moments) if (byId.has(m.id)) next.push(m);
  await persistMoments(gameId, draftId, next, meta?.playerIds);
}

/** Replace a draft's full moment list in one write (used by preset regeneration). */
export async function setHighlightMoments(
  gameId: string,
  draftId: string,
  moments: HighlightMoment[],
  playerIds?: string[],
): Promise<void> {
  const track = await getDirectorTrack(gameId, draftId);
  if (!track || !isHighlightDraft(track)) {
    throw new Error("Highlight draft not found.");
  }
  await persistMoments(gameId, draftId, moments, playerIds);
}

/** Create a reel from many segments at once (e.g. a preset-generated cut). */
export async function createHighlightReel(
  gameId: string,
  uid: string,
  input: {
    name: string;
    moments: AddHighlightMomentInput[];
    createdByName?: string;
    visibility?: CutVisibility;
    playerIds?: string[];
    soundtrack?: HighlightSoundtrack | null;
    sponsors?: HighlightSponsorLogo[] | null;
    titleLogoSource?: ReelTitleLogoSource | null;
    titleLogoUrl?: string | null;
  },
): Promise<string> {
  if (input.moments.length === 0) {
    throw new Error("A reel needs at least one segment.");
  }
  const moments = input.moments.map(momentFromInput);
  const draftPlayerIds = uniquePlayerIds(
    input.playerIds,
    ...moments.map((m) => m.playerIds),
  );
  return createDirectorTrack(gameId, {
    kind: "highlight",
    name: input.name.trim() || "Highlight reel",
    visibility: input.visibility ?? "private",
    gameId,
    createdBy: uid,
    track: highlightMomentsToTrackEvents(moments),
    description: serializeHighlightDraftMeta(
      moments,
      draftPlayerIds.length > 0 ? draftPlayerIds : undefined,
      input.soundtrack ?? null,
      input.sponsors ?? null,
      input.titleLogoSource ?? null,
      input.titleLogoUrl ?? null,
    ),
    ...(input.createdByName ? { createdByName: input.createdByName } : {}),
  });
}

/** A resolved, playable reel segment in source-video time (not game time). */
export type ReelStep = {
  momentId: string;
  sourceId: string;
  /** Playback position (seconds) in the source video where the clip starts. */
  sourceStartTime: number;
  /** Playback position (seconds) in the source video where the clip ends. */
  sourceEndTime: number;
  /**
   * Game-timeline seconds at {@link sourceStartTime}
   * (for live overlays such as the scoreboard).
   */
  gameStartTime?: number;
  /** Game-timeline seconds at {@link sourceEndTime}. */
  gameEndTime?: number;
  speed: number;
  repeat: number;
  label?: string;
  /** Coach-mark / game event this beat belongs to (live + replay share one id). */
  timelineEventId?: string;
  /** On-screen player name text (goal / assist). */
  playerOverlay?: string;
  /** How long to show {@link playerOverlay} after each segment starts. */
  playerOverlaySec?: number;
  /** Ken Burns slow zoom on this segment. */
  kenBurns?: boolean;
};

/**
 * Resolve moments into ordered, playable reel steps. `sourceOffsets` maps a
 * source id to its `offsetFromGameTime` so game time converts to source
 * playback time (sourceTime = gameTime + offset). Reel order = moment order.
 */
export function buildReelSteps(
  moments: HighlightMoment[],
  sourceOffsets: Record<string, number>,
): ReelStep[] {
  const steps: ReelStep[] = [];
  for (const m of moments) {
    const offset = sourceOffsets[m.activeSourceId] ?? 0;
    const startGame = Math.max(0, m.gameTime + m.startOffsetSec);
    const endGame = Math.max(startGame, m.gameTime + m.endOffsetSec);
    const sourceStartTime = Math.max(0, startGame + offset);
    const sourceEndTime = Math.max(sourceStartTime, endGame + offset);
    steps.push({
      momentId: m.id,
      sourceId: m.activeSourceId,
      sourceStartTime,
      sourceEndTime,
      gameStartTime: startGame,
      gameEndTime: endGame,
      speed: normalizeHighlightSpeed(m.speed),
      repeat: normalizeHighlightRepeat(m.repeat),
      ...(m.label ? { label: m.label } : {}),
      ...(m.timelineEventId ? { timelineEventId: m.timelineEventId } : {}),
      ...(m.kenBurns ? { kenBurns: true } : {}),
    });
  }
  return steps;
}

/** Estimated wall-clock seconds the reel takes, accounting for speed + repeat. */
export function reelDurationSec(steps: ReelStep[]): number {
  let total = 0;
  for (const s of steps) {
    const seg = Math.max(0, s.sourceEndTime - s.sourceStartTime);
    total += (seg / (s.speed || 1)) * (s.repeat || 1);
  }
  return total;
}

/** EDL row for local clean render (Drive raws / ffmpeg). */
export type ReelEditListRow = ReelStep & {
  angleSlot?: string;
  driveFileId?: string;
  /** YouTube id used for AI analysis (native or aiProxy). */
  videoId?: string;
  aiProxyVideoId?: string;
  sourceLabel?: string;
};

export type ReelEditListExport = {
  schema: "film_room_clean_edl_v1";
  exportedAt: string;
  gameId?: string;
  reelName?: string;
  handleSec: number;
  rows: ReelEditListRow[];
};

export type ExportReelEditListSource = {
  id: string;
  label?: string;
  angleSlot?: string;
  driveFileId?: string;
  videoId?: string;
  aiProxyVideoId?: string;
  offsetFromGameTime?: number;
};

/**
 * Build a downloadable clean-cut EDL from reel moments + vault/YouTube sources.
 * Local ffmpeg uses driveFileId (or a local raw matched by angleSlot) — not YouTube.
 */
export function exportReelEditList(
  moments: HighlightMoment[],
  sources: ExportReelEditListSource[],
  opts?: {
    gameId?: string;
    reelName?: string;
    /** Extra pad around each cut when fetching ranges (default 1s). */
    handleSec?: number;
  },
): ReelEditListExport {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const sourceOffsets: Record<string, number> = {};
  for (const s of sources) {
    sourceOffsets[s.id] =
      typeof s.offsetFromGameTime === "number" ? s.offsetFromGameTime : 0;
  }
  const steps = buildReelSteps(moments, sourceOffsets);
  const handleSec =
    typeof opts?.handleSec === "number" && Number.isFinite(opts.handleSec)
      ? Math.max(0, opts.handleSec)
      : 1;

  const rows: ReelEditListRow[] = steps.map((step) => {
    const src = byId.get(step.sourceId);
    const proxy =
      typeof src?.aiProxyVideoId === "string" ? src.aiProxyVideoId.trim() : "";
    const native =
      typeof src?.videoId === "string" ? src.videoId.trim() : "";
    return {
      ...step,
      ...(src?.angleSlot ? { angleSlot: src.angleSlot } : {}),
      ...(src?.driveFileId ? { driveFileId: src.driveFileId } : {}),
      ...(native || proxy ? { videoId: native || proxy } : {}),
      ...(proxy ? { aiProxyVideoId: proxy } : {}),
      ...(src?.label ? { sourceLabel: src.label } : {}),
    };
  });

  return {
    schema: "film_room_clean_edl_v1",
    exportedAt: new Date().toISOString(),
    ...(opts?.gameId ? { gameId: opts.gameId } : {}),
    ...(opts?.reelName?.trim() ? { reelName: opts.reelName.trim() } : {}),
    handleSec,
    rows,
  };
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
