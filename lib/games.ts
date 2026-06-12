import {
  collection,
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

export type DirectorTrackEvent = {
  /** Canonical game time in seconds. */
  t: number;
  /** Layout name, e.g. "single" | "quad" | "stacked". */
  layout?: string;
  /** Source id to make active/primary at this time. */
  activeSource?: string;
};

export type DirectorTrack = {
  id: string;
  name: string;
  visibility?: GameVisibility;
  /** Ordered view/layout/camera-switch instructions (NOT rendered video). */
  track: DirectorTrackEvent[];
  createdBy?: string;
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
    ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
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
          ...(trimOrUndef(e.layout) ? { layout: e.layout!.trim() } : {}),
          ...(trimOrUndef(e.activeSource)
            ? { activeSource: e.activeSource!.trim() }
            : {}),
        }))
    : [];
  await setDoc(ref, {
    id: ref.id,
    name: data.name.trim() || "Cut",
    track,
    visibility: data.visibility ?? "private",
    createdAt: now,
    updatedAt: now,
    ...(trimOrUndef(data.createdBy)
      ? { createdBy: data.createdBy!.trim() }
      : {}),
  });
  return ref.id;
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
      ...(trimOrUndef(o.layout) ? { layout: (o.layout as string).trim() } : {}),
      ...(trimOrUndef(o.activeSource)
        ? { activeSource: (o.activeSource as string).trim() }
        : {}),
    });
  }
  track.sort((a, b) => a.t - b.t);
  const visibility =
    raw.visibility === "link" || raw.visibility === "public"
      ? raw.visibility
      : "private";
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : "Cut",
    visibility,
    track,
    ...(trimOrUndef(raw.createdBy)
      ? { createdBy: (raw.createdBy as string).trim() }
      : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

export async function listDirectorTracks(
  gameId: string,
): Promise<DirectorTrack[]> {
  const snap = await getDocs(cutsCol(gameId));
  const out: DirectorTrack[] = [];
  snap.forEach((d) =>
    out.push(parseDirectorTrack(d.id, d.data() as Record<string, unknown>)),
  );
  out.sort(
    (a, b) =>
      (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
  );
  return out;
}
