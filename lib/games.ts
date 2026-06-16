import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

/**
 * Phase 0 durable Game model (Firestore).
 *
 * A Game is the container. It holds Video Sources, a typed Timeline of events,
 * and Director Tracks (user cuts). This layer is additive — it does NOT replace
 * live RTDB rooms or per-user `savedSessions`; it is the new durable foundation
 * those will eventually point at via `gameId`.
 *
 * Layout:
 *   games/{gameId}
 *   games/{gameId}/sources/{sourceId}
 *   games/{gameId}/events/{eventId}
 *   games/{gameId}/cuts/{cutId}
 */

export type GameRole = "owner" | "editor" | "viewer";

export type GameContributor = {
  uid: string;
  role: GameRole;
  /** Epoch ms when added (optional on legacy docs). */
  addedAt?: number;
};

export type GameVisibility = "private" | "link" | "public";

export type GameVideoSourceKind =
  | "youtube"
  | "youtube_live"
  | "upload"
  | "external_url";

export type GameVideoSource = {
  id: string;
  kind: GameVideoSourceKind;
  label: string;
  /** YouTube 11-char id (kind: youtube / youtube_live). */
  videoId?: string;
  /** Arbitrary playable URL (kind: external_url). */
  url?: string;
  /** Storage path (kind: upload). */
  storagePath?: string;
  /** Seconds added to canonical game time to reach this source's playback time. */
  offsetFromGameTime?: number;
  durationSec?: number;
  createdBy?: string;
  createdByName?: string;
  /** Who owns the YouTube upload (team channel vs parent device). */
  uploadOwner?: "team" | "parent";
  uploadedBy?: string;
  youtubeChannelId?: string;
  youtubeChannelTitle?: string;
  youtubePrivacyStatus?: "private" | "unlisted" | "public";
  /** Whether YouTube allows embedding this video (from status.embeddable). */
  youtubeEmbeddable?: boolean;
  syncStatus?: "unsynced" | "clock_synced" | "manually_synced" | "audio_synced";
  syncConfidence?: "low" | "medium" | "high";
  recordedStartTime?: string;
  recordedEndTime?: string;
  deviceClockStart?: string;
  uploadedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
};

export type GameTimelineEventType =
  | "coach_mark"
  | "sync_point"
  | "note"
  | "tag"
  | "layout"
  | "camera_switch";

export type GameTimelineEvent = {
  id: string;
  type: GameTimelineEventType;
  /** Canonical game time in seconds. */
  t: number;
  label?: string;
  /** Source this event references (camera switch target, mark angle, etc.). */
  sourceId?: string;
  /** Free-form: tag value, layout name, note text, original videoId, etc. */
  payload?: Record<string, unknown>;
  createdBy?: string;
  createdByRole?: string;
  createdByName?: string;
  createdAt?: Timestamp | null;
};

/** Discriminator for the kind of viewing instruction (optional / additive). */
export type DirectorTrackEventType =
  | "layout"
  | "camera_switch"
  | "player_view"
  | "note";

export type DirectorTrackEvent = {
  /** Canonical game time in seconds. */
  t: number;
  /** Optional discriminator. Older cuts omit this; readers infer from fields. */
  type?: DirectorTrackEventType;
  /** Layout name, e.g. "single" | "multi" | "quad" | "stacked". */
  layout?: string;
  /** Source id to make active/primary at this time. */
  activeSource?: string;
  /** Source id to focus in the dedicated player view (multi-angle rooms). */
  playerView?: string;
  /** Free-form annotation attached to this point in time. */
  note?: string;
};

/**
 * Visibility for a Director Track / User Cut (distinct from Game visibility):
 *   private = only the creator sees it
 *   game    = anyone with access to the Game sees it
 *   team    = future team-wide visibility (behaves like `game` until teams exist)
 */
export type CutVisibility = "private" | "game" | "team";

/** Discriminator for director tracks (default `cut`). */
export type DirectorTrackKind = "cut" | "highlight";

export type DirectorTrack = {
  id: string;
  /** Back-link to the owning Game (denormalized for portability). */
  gameId?: string;
  kind?: DirectorTrackKind;
  name: string;
  description?: string;
  visibility?: CutVisibility;
  /** Ordered view/layout/camera-switch instructions (NOT rendered video). */
  track: DirectorTrackEvent[];
  createdBy?: string;
  /** Display name of the creator, captured at save time. */
  createdByName?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type Game = {
  id: string;
  title: string;
  sport?: string;
  /** ISO date (YYYY-MM-DD) of the game (optional). */
  date?: string;
  homeTeam?: string;
  awayTeam?: string;
  /** Back-link to a Team (optional — standalone games omit this). */
  teamId?: string;
  /** Future club scope (optional). */
  clubId?: string;
  season?: string;
  opponent?: string;
  /** ISO-8601 scheduled kickoff (optional, for clock sync). */
  scheduledStartAt?: string;
  ownerId: string;
  /** uid -> role. Owner is always present. */
  contributors: Record<string, GameRole>;
  /** Mirror of contributor uids for `array-contains` queries. */
  memberUids: string[];
  visibility: GameVisibility;
  /** Back-link to the saved session this Game was created from (optional). */
  sourceSavedSessionId?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

/** Input shapes (id/timestamps are assigned by the helpers). */
export type CreateGameInput = {
  title: string;
  sport?: string;
  date?: string;
  homeTeam?: string;
  awayTeam?: string;
  teamId?: string;
  clubId?: string;
  season?: string;
  opponent?: string;
  scheduledStartAt?: string;
  visibility?: GameVisibility;
  sourceSavedSessionId?: string;
};

export type GameVideoSourceInput = Omit<GameVideoSource, "id" | "createdAt"> & {
  id?: string;
};

export type GameTimelineEventInput = Omit<
  GameTimelineEvent,
  "id" | "createdAt"
> & { id?: string };

export type DirectorTrackInput = Omit<
  DirectorTrack,
  "id" | "createdAt" | "updatedAt"
> & { id?: string };

function gamesCol() {
  return collection(firestore, "games");
}
function sourcesCol(gameId: string) {
  return collection(firestore, "games", gameId, "sources");
}
function eventsCol(gameId: string) {
  return collection(firestore, "games", gameId, "events");
}
function cutsCol(gameId: string) {
  return collection(firestore, "games", gameId, "cuts");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

// ---- Game --------------------------------------------------------------

export async function createGame(
  uid: string,
  data: CreateGameInput,
): Promise<string> {
  const ref = doc(gamesCol());
  const now = serverTimestamp();
  const title = data.title.trim() || "Game";
  await setDoc(ref, {
    title,
    ownerId: uid,
    contributors: { [uid]: "owner" },
    memberUids: [uid],
    visibility: data.visibility ?? "private",
    createdAt: now,
    updatedAt: now,
    ...(trimOrUndef(data.sport) ? { sport: data.sport!.trim() } : {}),
    ...(trimOrUndef(data.date) ? { date: data.date!.trim() } : {}),
    ...(trimOrUndef(data.homeTeam) ? { homeTeam: data.homeTeam!.trim() } : {}),
    ...(trimOrUndef(data.awayTeam) ? { awayTeam: data.awayTeam!.trim() } : {}),
    ...(trimOrUndef(data.teamId) ? { teamId: data.teamId!.trim() } : {}),
    ...(trimOrUndef(data.clubId) ? { clubId: data.clubId!.trim() } : {}),
    ...(trimOrUndef(data.season) ? { season: data.season!.trim() } : {}),
    ...(trimOrUndef(data.opponent) ? { opponent: data.opponent!.trim() } : {}),
    ...(trimOrUndef(data.scheduledStartAt)
      ? { scheduledStartAt: data.scheduledStartAt!.trim() }
      : {}),
    ...(trimOrUndef(data.sourceSavedSessionId)
      ? { sourceSavedSessionId: data.sourceSavedSessionId!.trim() }
      : {}),
  });
  return ref.id;
}

function parseGame(id: string, raw: Record<string, unknown>): Game {
  const contributorsRaw =
    raw.contributors && typeof raw.contributors === "object"
      ? (raw.contributors as Record<string, unknown>)
      : {};
  const contributors: Record<string, GameRole> = {};
  for (const [k, v] of Object.entries(contributorsRaw)) {
    if (v === "owner" || v === "editor" || v === "viewer") contributors[k] = v;
  }
  const memberUids = Array.isArray(raw.memberUids)
    ? (raw.memberUids as unknown[]).filter(
        (u): u is string => typeof u === "string",
      )
    : Object.keys(contributors);
  const visibility =
    raw.visibility === "link" || raw.visibility === "public"
      ? raw.visibility
      : "private";
  return {
    id,
    title: typeof raw.title === "string" ? raw.title : "Game",
    ownerId: typeof raw.ownerId === "string" ? raw.ownerId : "",
    contributors,
    memberUids,
    visibility,
    ...(trimOrUndef(raw.sport) ? { sport: (raw.sport as string).trim() } : {}),
    ...(trimOrUndef(raw.date) ? { date: (raw.date as string).trim() } : {}),
    ...(trimOrUndef(raw.homeTeam)
      ? { homeTeam: (raw.homeTeam as string).trim() }
      : {}),
    ...(trimOrUndef(raw.awayTeam)
      ? { awayTeam: (raw.awayTeam as string).trim() }
      : {}),
    ...(trimOrUndef(raw.teamId) ? { teamId: (raw.teamId as string).trim() } : {}),
    ...(trimOrUndef(raw.clubId) ? { clubId: (raw.clubId as string).trim() } : {}),
    ...(trimOrUndef(raw.season) ? { season: (raw.season as string).trim() } : {}),
    ...(trimOrUndef(raw.opponent)
      ? { opponent: (raw.opponent as string).trim() }
      : {}),
    ...(trimOrUndef(raw.scheduledStartAt)
      ? { scheduledStartAt: (raw.scheduledStartAt as string).trim() }
      : {}),
    ...(trimOrUndef(raw.sourceSavedSessionId)
      ? { sourceSavedSessionId: (raw.sourceSavedSessionId as string).trim() }
      : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

export async function getGame(gameId: string): Promise<Game | null> {
  const snap = await getDoc(doc(gamesCol(), gameId));
  if (!snap.exists()) return null;
  return parseGame(snap.id, snap.data() as Record<string, unknown>);
}

/** Games where the user is a contributor (owner/editor/viewer), newest first. */
export async function listMyGames(uid: string): Promise<Game[]> {
  const q = query(gamesCol(), where("memberUids", "array-contains", uid));
  const snap = await getDocs(q);
  const out: Game[] = [];
  snap.forEach((d) =>
    out.push(parseGame(d.id, d.data() as Record<string, unknown>)),
  );
  out.sort(
    (a, b) =>
      (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
  );
  return out;
}

export async function updateGame(
  gameId: string,
  patch: Partial<CreateGameInput>,
): Promise<void> {
  await updateDoc(doc(gamesCol(), gameId), {
    updatedAt: serverTimestamp(),
    ...(patch.title !== undefined ? { title: patch.title.trim() || "Game" } : {}),
    ...(patch.sport !== undefined ? { sport: patch.sport.trim() } : {}),
    ...(patch.date !== undefined ? { date: patch.date.trim() } : {}),
    ...(patch.homeTeam !== undefined ? { homeTeam: patch.homeTeam.trim() } : {}),
    ...(patch.awayTeam !== undefined ? { awayTeam: patch.awayTeam.trim() } : {}),
    ...(patch.teamId !== undefined ? { teamId: patch.teamId.trim() } : {}),
    ...(patch.clubId !== undefined ? { clubId: patch.clubId.trim() } : {}),
    ...(patch.season !== undefined ? { season: patch.season.trim() } : {}),
    ...(patch.opponent !== undefined ? { opponent: patch.opponent.trim() } : {}),
    ...(patch.scheduledStartAt !== undefined
      ? { scheduledStartAt: patch.scheduledStartAt.trim() }
      : {}),
    ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
  });
}

/** All games linked to a team, newest first. */
export async function listGamesForTeam(teamId: string): Promise<Game[]> {
  const q = query(gamesCol(), where("teamId", "==", teamId));
  const snap = await getDocs(q);
  const out: Game[] = [];
  snap.forEach((d) =>
    out.push(parseGame(d.id, d.data() as Record<string, unknown>)),
  );
  out.sort(
    (a, b) =>
      (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
  );
  return out;
}

// ---- Contributors / permissions ----------------------------------------

export type GameContributorEntry = {
  uid: string;
  role: GameRole;
};

function roleRank(role: GameRole): number {
  return role === "owner" ? 0 : role === "editor" ? 1 : 2;
}

/** Owners can manage contributors and game settings. */
export function canManageGame(game: Game, uid: string): boolean {
  if (!uid) return false;
  return game.ownerId === uid || game.contributors[uid] === "owner";
}

/** Team member role (mirrors lib/teams.ts — kept here to avoid circular imports). */
export type GameTeamRole =
  | "admin"
  | "coach"
  | "parent"
  | "player"
  | "viewer";

/** Editors (and owners) can add sources / events / cuts. */
export function canEditGame(game: Game, uid: string): boolean {
  if (!uid) return false;
  return canManageGame(game, uid) || game.contributors[uid] === "editor";
}

/** Members can read; link/public games are also viewable by anyone. */
export function canViewGame(
  game: Game,
  uid: string,
  teamRole?: GameTeamRole | null,
): boolean {
  if (game.visibility === "link" || game.visibility === "public") return true;
  if (!uid) return false;
  if (game.ownerId === uid || game.contributors[uid] != null) return true;
  if (game.teamId && teamRole) return true;
  return false;
}

/** Source attach: game editor/owner OR team admin/coach/parent. */
export function canContributeGameSources(
  game: Game,
  uid: string,
  teamRole?: GameTeamRole | null,
): boolean {
  if (canEditGame(game, uid)) return true;
  if (!game.teamId || !teamRole) return false;
  return (
    teamRole === "admin" || teamRole === "coach" || teamRole === "parent"
  );
}

/** Timeline events / coach marks: game editor/owner OR team admin/coach. */
export function canCoachGame(
  game: Game,
  uid: string,
  teamRole?: GameTeamRole | null,
): boolean {
  if (canEditGame(game, uid)) return true;
  if (!game.teamId || !teamRole) return false;
  return teamRole === "admin" || teamRole === "coach";
}

/** Director cuts: game editor/owner OR any team member. */
export function canCreateGameCut(
  game: Game,
  uid: string,
  teamRole?: GameTeamRole | null,
): boolean {
  if (canEditGame(game, uid)) return true;
  if (game.teamId && teamRole) return true;
  return false;
}

/** All contributors for a game, sorted owner → editor → viewer then by uid. */
export async function getGameContributors(
  gameId: string,
): Promise<GameContributorEntry[]> {
  const game = await getGame(gameId);
  if (!game) return [];
  return Object.entries(game.contributors)
    .map(([uid, role]) => ({ uid, role }))
    .sort(
      (a, b) => roleRank(a.role) - roleRank(b.role) || a.uid.localeCompare(b.uid),
    );
}

/**
 * Add or change a contributor's role. Writes both the `contributors` map and
 * the `memberUids` mirror. Rules restrict this to owners.
 */
export async function updateGameContributor(
  gameId: string,
  targetUid: string,
  role: GameRole,
): Promise<void> {
  const uid = targetUid.trim();
  if (!uid) throw new Error("A user id is required.");
  if (role !== "owner" && role !== "editor" && role !== "viewer") {
    throw new Error(`Invalid role: ${role}`);
  }
  await updateDoc(doc(gamesCol(), gameId), {
    [`contributors.${uid}`]: role,
    memberUids: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Remove a contributor, clearing both the `contributors` map entry and the
 * `memberUids` mirror. Refuses to strip the last owner (so a game always keeps
 * at least one manager). Rules restrict this to owners.
 */
export async function removeGameContributor(
  gameId: string,
  targetUid: string,
): Promise<void> {
  const uid = targetUid.trim();
  if (!uid) throw new Error("A user id is required.");
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found.");
  if (!(uid in game.contributors)) return;
  const ownerCount = Object.values(game.contributors).filter(
    (r) => r === "owner",
  ).length;
  if (game.contributors[uid] === "owner" && ownerCount <= 1) {
    throw new Error("Cannot remove the only owner of this game.");
  }
  await updateDoc(doc(gamesCol(), gameId), {
    [`contributors.${uid}`]: deleteField(),
    memberUids: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

// ---- Sources -----------------------------------------------------------

export async function addGameSource(
  gameId: string,
  source: GameVideoSourceInput,
): Promise<string> {
  const ref = source.id
    ? doc(sourcesCol(gameId), source.id)
    : doc(sourcesCol(gameId));
  await setDoc(ref, {
    id: ref.id,
    kind: source.kind,
    label: source.label.trim() || "Source",
    createdAt: serverTimestamp(),
    ...(trimOrUndef(source.videoId) ? { videoId: source.videoId!.trim() } : {}),
    ...(trimOrUndef(source.url) ? { url: source.url!.trim() } : {}),
    ...(trimOrUndef(source.storagePath)
      ? { storagePath: source.storagePath!.trim() }
      : {}),
    ...(typeof source.offsetFromGameTime === "number" &&
    Number.isFinite(source.offsetFromGameTime)
      ? { offsetFromGameTime: source.offsetFromGameTime }
      : {}),
    ...(typeof source.durationSec === "number" &&
    Number.isFinite(source.durationSec)
      ? { durationSec: source.durationSec }
      : {}),
    ...(trimOrUndef(source.createdBy)
      ? { createdBy: source.createdBy!.trim() }
      : {}),
    ...(trimOrUndef(source.createdByName)
      ? { createdByName: source.createdByName!.trim() }
      : {}),
    ...(source.uploadOwner === "team" || source.uploadOwner === "parent"
      ? { uploadOwner: source.uploadOwner }
      : {}),
    ...(trimOrUndef(source.uploadedBy)
      ? { uploadedBy: source.uploadedBy!.trim() }
      : {}),
    ...(trimOrUndef(source.uploadedBy) ? { uploadedAt: serverTimestamp() } : {}),
    ...(trimOrUndef(source.youtubeChannelId)
      ? { youtubeChannelId: source.youtubeChannelId!.trim() }
      : {}),
    ...(trimOrUndef(source.youtubeChannelTitle)
      ? { youtubeChannelTitle: source.youtubeChannelTitle!.trim() }
      : {}),
    ...(source.youtubePrivacyStatus === "private" ||
    source.youtubePrivacyStatus === "unlisted" ||
    source.youtubePrivacyStatus === "public"
      ? { youtubePrivacyStatus: source.youtubePrivacyStatus }
      : {}),
    ...(typeof source.youtubeEmbeddable === "boolean"
      ? { youtubeEmbeddable: source.youtubeEmbeddable }
      : {}),
    ...(source.syncStatus === "unsynced" ||
    source.syncStatus === "clock_synced" ||
    source.syncStatus === "manually_synced" ||
    source.syncStatus === "audio_synced"
      ? { syncStatus: source.syncStatus }
      : {}),
    ...(source.syncConfidence === "low" ||
    source.syncConfidence === "medium" ||
    source.syncConfidence === "high"
      ? { syncConfidence: source.syncConfidence }
      : {}),
    ...(trimOrUndef(source.recordedStartTime)
      ? { recordedStartTime: source.recordedStartTime!.trim() }
      : {}),
    ...(trimOrUndef(source.recordedEndTime)
      ? { recordedEndTime: source.recordedEndTime!.trim() }
      : {}),
    ...(trimOrUndef(source.deviceClockStart)
      ? { deviceClockStart: source.deviceClockStart!.trim() }
      : {}),
  });
  return ref.id;
}

function parseSource(
  id: string,
  raw: Record<string, unknown>,
): GameVideoSource | null {
  const kind = raw.kind;
  if (
    kind !== "youtube" &&
    kind !== "youtube_live" &&
    kind !== "upload" &&
    kind !== "external_url"
  ) {
    return null;
  }
  return {
    id,
    kind,
    label: typeof raw.label === "string" ? raw.label : "Source",
    ...(trimOrUndef(raw.videoId) ? { videoId: (raw.videoId as string).trim() } : {}),
    ...(trimOrUndef(raw.url) ? { url: (raw.url as string).trim() } : {}),
    ...(trimOrUndef(raw.storagePath)
      ? { storagePath: (raw.storagePath as string).trim() }
      : {}),
    ...(typeof raw.offsetFromGameTime === "number" &&
    Number.isFinite(raw.offsetFromGameTime)
      ? { offsetFromGameTime: raw.offsetFromGameTime }
      : {}),
    ...(typeof raw.durationSec === "number" && Number.isFinite(raw.durationSec)
      ? { durationSec: raw.durationSec }
      : {}),
    ...(trimOrUndef(raw.createdBy)
      ? { createdBy: (raw.createdBy as string).trim() }
      : {}),
    ...(trimOrUndef(raw.createdByName)
      ? { createdByName: (raw.createdByName as string).trim() }
      : {}),
    ...(raw.uploadOwner === "team" || raw.uploadOwner === "parent"
      ? { uploadOwner: raw.uploadOwner }
      : {}),
    ...(trimOrUndef(raw.uploadedBy)
      ? { uploadedBy: (raw.uploadedBy as string).trim() }
      : {}),
    ...(trimOrUndef(raw.youtubeChannelId)
      ? { youtubeChannelId: (raw.youtubeChannelId as string).trim() }
      : {}),
    ...(trimOrUndef(raw.youtubeChannelTitle)
      ? { youtubeChannelTitle: (raw.youtubeChannelTitle as string).trim() }
      : {}),
    ...(raw.youtubePrivacyStatus === "private" ||
    raw.youtubePrivacyStatus === "unlisted" ||
    raw.youtubePrivacyStatus === "public"
      ? { youtubePrivacyStatus: raw.youtubePrivacyStatus }
      : {}),
    ...(typeof raw.youtubeEmbeddable === "boolean"
      ? { youtubeEmbeddable: raw.youtubeEmbeddable }
      : {}),
    ...(raw.syncStatus === "unsynced" ||
    raw.syncStatus === "clock_synced" ||
    raw.syncStatus === "manually_synced" ||
    raw.syncStatus === "audio_synced"
      ? { syncStatus: raw.syncStatus }
      : {}),
    ...(raw.syncConfidence === "low" ||
    raw.syncConfidence === "medium" ||
    raw.syncConfidence === "high"
      ? { syncConfidence: raw.syncConfidence }
      : {}),
    ...(trimOrUndef(raw.recordedStartTime)
      ? { recordedStartTime: (raw.recordedStartTime as string).trim() }
      : {}),
    ...(trimOrUndef(raw.recordedEndTime)
      ? { recordedEndTime: (raw.recordedEndTime as string).trim() }
      : {}),
    ...(trimOrUndef(raw.deviceClockStart)
      ? { deviceClockStart: (raw.deviceClockStart as string).trim() }
      : {}),
    uploadedAt: raw.uploadedAt instanceof Timestamp ? raw.uploadedAt : null,
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
  };
}

export async function listGameSources(
  gameId: string,
): Promise<GameVideoSource[]> {
  const snap = await getDocs(sourcesCol(gameId));
  const out: GameVideoSource[] = [];
  snap.forEach((d) => {
    const s = parseSource(d.id, d.data() as Record<string, unknown>);
    if (s) out.push(s);
  });
  out.sort(
    (a, b) =>
      (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0),
  );
  return out;
}

export type AddYouTubeSourceInput = {
  /** Full YouTube URL or a raw 11-character video id. */
  urlOrId: string;
  label?: string;
  /** Seconds added to game time to reach this source's playback time. */
  offsetFromGameTime?: number;
};

/**
 * Convenience: parse a YouTube URL/id and attach it as a `youtube` source.
 * Throws if the input is not a recognizable YouTube video. Rules require the
 * caller to be an editor/owner of the game.
 */
export async function addYouTubeSourceToGame(
  gameId: string,
  uid: string,
  input: AddYouTubeSourceInput,
): Promise<string> {
  const videoId = extractYouTubeVideoId(input.urlOrId ?? "");
  if (!videoId) {
    throw new Error("Enter a valid YouTube URL or 11-character video ID.");
  }
  const offset =
    typeof input.offsetFromGameTime === "number" &&
    Number.isFinite(input.offsetFromGameTime)
      ? input.offsetFromGameTime
      : 0;
  return addGameSource(gameId, {
    kind: "youtube",
    label: input.label?.trim() || "YouTube source",
    videoId,
    offsetFromGameTime: offset,
    ...(uid ? { createdBy: uid } : {}),
  });
}

export type AddGameSourceFromYouTubeUploadInput = {
  videoId: string;
  label: string;
  createdByName?: string;
  durationSec?: number;
  youtubeChannelId?: string;
  youtubeChannelTitle?: string;
  youtubePrivacyStatus?: "private" | "unlisted" | "public";
  youtubeEmbeddable?: boolean;
};

/**
 * Attach a Game Cap YouTube upload as a `youtube` source on the user's channel.
 */
export async function addGameSourceFromYouTubeUpload(
  gameId: string,
  uid: string,
  input: AddGameSourceFromYouTubeUploadInput,
): Promise<string> {
  const videoId = input.videoId.trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error("Invalid YouTube video id.");
  }
  const label = input.label.trim() || "Camera";
  return addGameSource(gameId, {
    kind: "youtube",
    label,
    videoId,
    offsetFromGameTime: 0,
    uploadOwner: "parent",
    uploadedBy: uid,
    createdBy: uid,
    youtubePrivacyStatus: input.youtubePrivacyStatus ?? "unlisted",
    syncStatus: "unsynced",
    ...(trimOrUndef(input.createdByName)
      ? { createdByName: input.createdByName!.trim() }
      : {}),
    ...(typeof input.durationSec === "number" &&
    Number.isFinite(input.durationSec) &&
    input.durationSec > 0
      ? { durationSec: input.durationSec }
      : {}),
    ...(trimOrUndef(input.youtubeChannelId)
      ? { youtubeChannelId: input.youtubeChannelId!.trim() }
      : {}),
    ...(trimOrUndef(input.youtubeChannelTitle)
      ? { youtubeChannelTitle: input.youtubeChannelTitle!.trim() }
      : {}),
    ...(typeof input.youtubeEmbeddable === "boolean"
      ? { youtubeEmbeddable: input.youtubeEmbeddable }
      : {}),
  });
}

export type GameSourceYouTubeMetadataPatch = {
  durationSec?: number;
  youtubeChannelId?: string;
  youtubeChannelTitle?: string;
  youtubePrivacyStatus?: "private" | "unlisted" | "public";
  youtubeEmbeddable?: boolean;
};

/** Merge YouTube metadata onto an existing game source (refresh / post-upload). */
export async function updateGameSourceYouTubeMetadata(
  gameId: string,
  sourceId: string,
  patch: GameSourceYouTubeMetadataPatch,
): Promise<void> {
  await updateDoc(doc(sourcesCol(gameId), sourceId), {
    ...(typeof patch.durationSec === "number" &&
    Number.isFinite(patch.durationSec) &&
    patch.durationSec > 0
      ? { durationSec: patch.durationSec }
      : {}),
    ...(trimOrUndef(patch.youtubeChannelId)
      ? { youtubeChannelId: patch.youtubeChannelId!.trim() }
      : {}),
    ...(trimOrUndef(patch.youtubeChannelTitle)
      ? { youtubeChannelTitle: patch.youtubeChannelTitle!.trim() }
      : {}),
    ...(patch.youtubePrivacyStatus === "private" ||
    patch.youtubePrivacyStatus === "unlisted" ||
    patch.youtubePrivacyStatus === "public"
      ? { youtubePrivacyStatus: patch.youtubePrivacyStatus }
      : {}),
    ...(typeof patch.youtubeEmbeddable === "boolean"
      ? { youtubeEmbeddable: patch.youtubeEmbeddable }
      : {}),
  });
}

export type GameSourceSyncPatch = {
  offsetFromGameTime?: number;
  recordedStartTime?: string;
  deviceClockStart?: string;
  syncStatus?: GameVideoSource["syncStatus"];
  syncConfidence?: GameVideoSource["syncConfidence"];
};

/** Update sync / timeline fields on a game source. */
export async function updateGameSourceSync(
  gameId: string,
  sourceId: string,
  patch: GameSourceSyncPatch,
): Promise<void> {
  await updateDoc(doc(sourcesCol(gameId), sourceId), {
    ...(typeof patch.offsetFromGameTime === "number" &&
    Number.isFinite(patch.offsetFromGameTime)
      ? { offsetFromGameTime: patch.offsetFromGameTime }
      : {}),
    ...(patch.recordedStartTime !== undefined
      ? patch.recordedStartTime.trim()
        ? { recordedStartTime: patch.recordedStartTime.trim() }
        : { recordedStartTime: deleteField() }
      : {}),
    ...(patch.deviceClockStart !== undefined
      ? patch.deviceClockStart.trim()
        ? { deviceClockStart: patch.deviceClockStart.trim() }
        : { deviceClockStart: deleteField() }
      : {}),
    ...(patch.syncStatus === "unsynced" ||
    patch.syncStatus === "clock_synced" ||
    patch.syncStatus === "manually_synced" ||
    patch.syncStatus === "audio_synced"
      ? { syncStatus: patch.syncStatus }
      : {}),
    ...(patch.syncConfidence === "low" ||
    patch.syncConfidence === "medium" ||
    patch.syncConfidence === "high"
      ? { syncConfidence: patch.syncConfidence }
      : {}),
  });
}

// ---- Timeline events ---------------------------------------------------

const EVENT_TYPES: GameTimelineEventType[] = [
  "coach_mark",
  "sync_point",
  "note",
  "tag",
  "layout",
  "camera_switch",
];

export async function addGameEvent(
  gameId: string,
  event: GameTimelineEventInput,
): Promise<string> {
  if (!EVENT_TYPES.includes(event.type)) {
    throw new Error(`Unknown timeline event type: ${event.type}`);
  }
  const t =
    typeof event.t === "number" && Number.isFinite(event.t)
      ? Math.max(0, event.t)
      : 0;
  const ref = event.id
    ? doc(eventsCol(gameId), event.id)
    : doc(eventsCol(gameId));
  await setDoc(ref, {
    id: ref.id,
    type: event.type,
    t,
    createdAt: serverTimestamp(),
    ...(trimOrUndef(event.label) ? { label: event.label!.trim() } : {}),
    ...(trimOrUndef(event.sourceId) ? { sourceId: event.sourceId!.trim() } : {}),
    ...(event.payload && typeof event.payload === "object"
      ? { payload: event.payload }
      : {}),
    ...(trimOrUndef(event.createdBy)
      ? { createdBy: event.createdBy!.trim() }
      : {}),
    ...(trimOrUndef(event.createdByRole)
      ? { createdByRole: event.createdByRole!.trim() }
      : {}),
    ...(trimOrUndef(event.createdByName)
      ? { createdByName: event.createdByName!.trim() }
      : {}),
  });
  return ref.id;
}

function parseEvent(
  id: string,
  raw: Record<string, unknown>,
): GameTimelineEvent | null {
  const type = raw.type;
  if (!EVENT_TYPES.includes(type as GameTimelineEventType)) return null;
  if (typeof raw.t !== "number" || !Number.isFinite(raw.t)) return null;
  return {
    id,
    type: type as GameTimelineEventType,
    t: raw.t,
    ...(trimOrUndef(raw.label) ? { label: (raw.label as string).trim() } : {}),
    ...(trimOrUndef(raw.sourceId)
      ? { sourceId: (raw.sourceId as string).trim() }
      : {}),
    ...(raw.payload && typeof raw.payload === "object"
      ? { payload: raw.payload as Record<string, unknown> }
      : {}),
    ...(trimOrUndef(raw.createdBy)
      ? { createdBy: (raw.createdBy as string).trim() }
      : {}),
    ...(trimOrUndef(raw.createdByRole)
      ? { createdByRole: (raw.createdByRole as string).trim() }
      : {}),
    ...(trimOrUndef(raw.createdByName)
      ? { createdByName: (raw.createdByName as string).trim() }
      : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
  };
}

/** All timeline events for a game, ordered by game time ascending. */
export async function listGameEvents(
  gameId: string,
): Promise<GameTimelineEvent[]> {
  const snap = await getDocs(eventsCol(gameId));
  const out: GameTimelineEvent[] = [];
  snap.forEach((d) => {
    const e = parseEvent(d.id, d.data() as Record<string, unknown>);
    if (e) out.push(e);
  });
  out.sort((a, b) => a.t - b.t);
  return out;
}

// ---- Director tracks / cuts -------------------------------------------

const DIRECTOR_EVENT_TYPES: DirectorTrackEventType[] = [
  "layout",
  "camera_switch",
  "player_view",
  "note",
];

const CUT_VISIBILITIES: CutVisibility[] = ["private", "game", "team"];

export async function createDirectorTrack(
  gameId: string,
  data: DirectorTrackInput,
): Promise<string> {
  const ref = data.id ? doc(cutsCol(gameId), data.id) : doc(cutsCol(gameId));
  const now = serverTimestamp();
  const track = Array.isArray(data.track)
    ? data.track
        .filter(
          (e) =>
            e && typeof e === "object" && typeof e.t === "number" &&
            Number.isFinite(e.t),
        )
        .map((e) => ({
          t: Math.max(0, e.t),
          ...(DIRECTOR_EVENT_TYPES.includes(e.type as DirectorTrackEventType)
            ? { type: e.type }
            : {}),
          ...(trimOrUndef(e.layout) ? { layout: e.layout!.trim() } : {}),
          ...(trimOrUndef(e.activeSource)
            ? { activeSource: e.activeSource!.trim() }
            : {}),
          ...(trimOrUndef(e.playerView)
            ? { playerView: e.playerView!.trim() }
            : {}),
          ...(trimOrUndef(e.note) ? { note: e.note!.trim() } : {}),
        }))
    : [];
  const visibility = CUT_VISIBILITIES.includes(data.visibility as CutVisibility)
    ? (data.visibility as CutVisibility)
    : "private";
  const kind =
    data.kind === "highlight" || data.kind === "cut" ? data.kind : "cut";
  await setDoc(ref, {
    id: ref.id,
    gameId,
    kind,
    name: data.name.trim() || "Cut",
    track,
    visibility,
    createdAt: now,
    updatedAt: now,
    ...(trimOrUndef(data.description)
      ? { description: data.description!.trim() }
      : {}),
    ...(trimOrUndef(data.createdBy)
      ? { createdBy: data.createdBy!.trim() }
      : {}),
    ...(trimOrUndef(data.createdByName)
      ? { createdByName: data.createdByName!.trim() }
      : {}),
  });
  return ref.id;
}

/**
 * Duplicate an existing cut into a new one owned by `uid`. Copies the track and
 * description; the copy defaults to private so the new author opts in to
 * sharing. Returns the new cut id.
 */
export async function duplicateDirectorTrack(
  gameId: string,
  source: DirectorTrack,
  uid: string,
  opts?: { name?: string; createdByName?: string; visibility?: CutVisibility },
): Promise<string> {
  return createDirectorTrack(gameId, {
    name: opts?.name?.trim() || `${source.name} (copy)`,
    visibility: opts?.visibility ?? "private",
    track: source.track.map((e) => ({ ...e })),
    createdBy: uid,
    ...(opts?.createdByName ? { createdByName: opts.createdByName } : {}),
    ...(source.description ? { description: source.description } : {}),
  });
}

function parseDirectorTrack(
  id: string,
  raw: Record<string, unknown>,
): DirectorTrack {
  const trackRaw = Array.isArray(raw.track) ? raw.track : [];
  const track: DirectorTrackEvent[] = [];
  for (const row of trackRaw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.t !== "number" || !Number.isFinite(o.t)) continue;
    track.push({
      t: o.t,
      ...(DIRECTOR_EVENT_TYPES.includes(o.type as DirectorTrackEventType)
        ? { type: o.type as DirectorTrackEventType }
        : {}),
      ...(trimOrUndef(o.layout) ? { layout: (o.layout as string).trim() } : {}),
      ...(trimOrUndef(o.activeSource)
        ? { activeSource: (o.activeSource as string).trim() }
        : {}),
      ...(trimOrUndef(o.playerView)
        ? { playerView: (o.playerView as string).trim() }
        : {}),
      ...(trimOrUndef(o.note) ? { note: (o.note as string).trim() } : {}),
    });
  }
  track.sort((a, b) => a.t - b.t);
  // Coerce to CutVisibility; legacy link/public cuts read as game-visible.
  const visibility: CutVisibility =
    raw.visibility === "game" || raw.visibility === "team"
      ? raw.visibility
      : raw.visibility === "link" || raw.visibility === "public"
        ? "game"
        : "private";
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : "Cut",
    kind:
      raw.kind === "highlight" || raw.kind === "cut"
        ? raw.kind
        : undefined,
    visibility,
    track,
    ...(trimOrUndef(raw.gameId) ? { gameId: (raw.gameId as string).trim() } : {}),
    ...(trimOrUndef(raw.description)
      ? { description: (raw.description as string).trim() }
      : {}),
    ...(trimOrUndef(raw.createdBy)
      ? { createdBy: (raw.createdBy as string).trim() }
      : {}),
    ...(trimOrUndef(raw.createdByName)
      ? { createdByName: (raw.createdByName as string).trim() }
      : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

/**
 * List director tracks a user is allowed to see. When `uid` is provided this
 * runs two rule-satisfiable queries — the user's own cuts (any visibility) and
 * shared cuts (game/team) — and merges them, matching the hardened cut read
 * rule (an unconstrained list would be denied while private cuts exist). When
 * `uid` is omitted it falls back to an unconstrained read (legacy / open data).
 */
export async function listDirectorTracks(
  gameId: string,
  uid?: string,
): Promise<DirectorTrack[]> {
  const col = cutsCol(gameId);
  const byId = new Map<string, DirectorTrack>();
  const collect = (snap: Awaited<ReturnType<typeof getDocs>>) =>
    snap.forEach((d) => {
      const t = parseDirectorTrack(d.id, d.data() as Record<string, unknown>);
      byId.set(t.id, t);
    });

  if (uid) {
    const [mine, shared] = await Promise.all([
      getDocs(query(col, where("createdBy", "==", uid))),
      getDocs(query(col, where("visibility", "in", ["game", "team"]))),
    ]);
    collect(mine);
    collect(shared);
  } else {
    collect(await getDocs(col));
  }

  const out = Array.from(byId.values());
  out.sort(
    (a, b) =>
      (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
  );
  return out;
}

export async function getDirectorTrack(
  gameId: string,
  cutId: string,
): Promise<DirectorTrack | null> {
  const snap = await getDoc(doc(cutsCol(gameId), cutId));
  if (!snap.exists()) return null;
  return parseDirectorTrack(snap.id, snap.data() as Record<string, unknown>);
}

export type UpdateDirectorTrackPatch = {
  name?: string;
  description?: string;
  track?: DirectorTrackEvent[];
  visibility?: CutVisibility;
};

export async function updateDirectorTrack(
  gameId: string,
  cutId: string,
  patch: UpdateDirectorTrackPatch,
): Promise<void> {
  await updateDoc(doc(cutsCol(gameId), cutId), {
    updatedAt: serverTimestamp(),
    ...(patch.name !== undefined ? { name: patch.name.trim() || "Cut" } : {}),
    ...(patch.description !== undefined
      ? { description: patch.description }
      : {}),
    ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
    ...(patch.track !== undefined
      ? {
          track: patch.track
            .filter(
              (e) =>
                e &&
                typeof e === "object" &&
                typeof e.t === "number" &&
                Number.isFinite(e.t),
            )
            .map((e) => ({
              t: Math.max(0, e.t),
              ...(DIRECTOR_EVENT_TYPES.includes(e.type as DirectorTrackEventType)
                ? { type: e.type }
                : {}),
              ...(trimOrUndef(e.layout) ? { layout: e.layout!.trim() } : {}),
              ...(trimOrUndef(e.activeSource)
                ? { activeSource: e.activeSource!.trim() }
                : {}),
              ...(trimOrUndef(e.playerView)
                ? { playerView: e.playerView!.trim() }
                : {}),
              ...(trimOrUndef(e.note) ? { note: e.note!.trim() } : {}),
            })),
        }
      : {}),
  });
}

export async function deleteDirectorTrack(
  gameId: string,
  cutId: string,
): Promise<void> {
  await deleteDoc(doc(cutsCol(gameId), cutId));
}
