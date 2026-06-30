import { get, ref, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { gameTimeToSourceTime } from "@/lib/game-timeline";
import type { GameTimelineEvent, GameVideoSource } from "@/lib/games";
import { parseGameStat } from "@/lib/game-stats";
import { gameSourcesToAngles } from "@/lib/open-game-room";
import type { VideoAngle } from "@/lib/video-angle";
import { markRoomHost } from "@/lib/room-host";
import type { SavedChapter } from "@/lib/saved-sessions";

const DEFAULT_PLAYBACK_RATE = 1;

const FILM_ROOM_EVENT_TYPES = new Set<GameTimelineEvent["type"]>([
  "coach_mark",
  "sync_point",
  "note",
  "tag",
  "stat",
]);

/** Stable RTDB room id for a game's shared Team Film Room. */
export function teamFilmRoomId(gameId: string): string {
  return `g-${gameId.trim()}`;
}

/** Entry route that loads sources/events and seeds RTDB before redirecting. */
export function teamFilmRoomRoute(
  gameId: string,
  opts?: { viewer?: boolean; reelId?: string },
): string {
  const params = new URLSearchParams();
  if (opts?.viewer) params.set("viewer", "1");
  if (opts?.reelId?.trim()) params.set("reel", opts.reelId.trim());
  const q = params.toString();
  return q ? `/game/${gameId}/room?${q}` : `/game/${gameId}/room`;
}

export function buildTeamFilmRoomNavigateUrl(
  roomId: string,
  gameId: string,
  primaryVideoId: string,
  multi: boolean,
  opts?: { viewer?: boolean; reelId?: string },
): string {
  const qs = new URLSearchParams();
  qs.set("video", primaryVideoId);
  if (multi) qs.set("view", "sync");
  qs.set("gameId", gameId);
  qs.set("teamRoom", "1");
  if (opts?.viewer) qs.set("viewer", "1");
  if (opts?.reelId?.trim()) qs.set("reel", opts.reelId.trim());
  return `/room/${roomId}?${qs.toString()}`;
}

function resolveEventSource(
  event: GameTimelineEvent,
  sources: GameVideoSource[],
  primarySource: GameVideoSource | null,
): GameVideoSource | null {
  const sid = event.sourceId?.trim();
  if (sid) {
    const match = sources.find((s) => s.id === sid);
    if (match?.videoId?.trim()) return match;
  }
  return primarySource;
}

function formatFilmRoomChapterLabel(event: GameTimelineEvent): string {
  if (event.type === "stat") {
    const stat = parseGameStat(event);
    if (stat) {
      const base = stat.label?.trim() || stat.statType;
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
  }
  if (typeof event.label === "string" && event.label.trim() !== "") {
    return event.label.trim();
  }
  switch (event.type) {
    case "coach_mark":
      return "Mark";
    case "sync_point":
      return "Sync point";
    case "note":
      return "Note";
    case "tag":
      return "Tag";
    default:
      return event.type;
  }
}

/**
 * Convert a Review timeline event into a room chapter with source playback time.
 */
export function timelineEventToFilmRoomChapter(
  event: GameTimelineEvent,
  sources: GameVideoSource[],
  opts?: { primarySource?: GameVideoSource | null; primaryVideoId?: string },
): SavedChapter | null {
  if (!FILM_ROOM_EVENT_TYPES.has(event.type)) return null;

  const primarySource = opts?.primarySource ?? sources[0] ?? null;
  const primaryVideoId = opts?.primaryVideoId ?? primarySource?.videoId?.trim() ?? "";
  const source = resolveEventSource(event, sources, primarySource);

  const payloadVideoId =
    event.payload && typeof event.payload.videoId === "string"
      ? (event.payload.videoId as string).trim()
      : "";
  const videoId =
    source?.videoId?.trim() || payloadVideoId || primaryVideoId;
  if (!videoId) return null;

  const gameTime = Math.max(0, event.t);
  let sourceTime: number;
  if (source) {
    sourceTime = gameTimeToSourceTime(gameTime, source);
  } else if (
    event.payload &&
    typeof event.payload.sourceTime === "number" &&
    Number.isFinite(event.payload.sourceTime)
  ) {
    sourceTime = event.payload.sourceTime;
  } else {
    sourceTime = gameTime;
  }

  return {
    time: Math.max(0, sourceTime),
    label: formatFilmRoomChapterLabel(event),
    videoId,
    gameTime,
  };
}

/** Sorted chapters for all chapter-like Review events on a game. */
export function timelineEventsToFilmRoomChapters(
  events: GameTimelineEvent[],
  sources: GameVideoSource[],
  angles: VideoAngle[],
): SavedChapter[] {
  const primarySource = sources.find((s) => s.id === angles[0]?.id) ?? sources[0] ?? null;
  const primaryVideoId = angles[0]?.videoId?.trim() ?? primarySource?.videoId?.trim() ?? "";

  const chapters: SavedChapter[] = [];
  for (const event of events) {
    const ch = timelineEventToFilmRoomChapter(event, sources, {
      primarySource,
      primaryVideoId,
    });
    if (ch) chapters.push(ch);
  }

  chapters.sort((a, b) => (a.gameTime ?? a.time) - (b.gameTime ?? b.time));
  return chapters;
}

export type SeedTeamFilmRoomInput = {
  gameId: string;
  sources: GameVideoSource[];
  events: GameTimelineEvent[];
  uid?: string;
  asViewer?: boolean;
  reelId?: string;
};

export type SeedTeamFilmRoomResult = {
  roomId: string;
  url: string;
};

/**
 * Seed or refresh the stable Team Film Room in RTDB from game sources and
 * Review marks, then return the `/room/...` URL to navigate to.
 */
export async function seedTeamFilmRoom(
  input: SeedTeamFilmRoomInput,
): Promise<SeedTeamFilmRoomResult> {
  const angles = gameSourcesToAngles(input.sources);
  if (angles.length === 0) {
    throw new Error("No playable YouTube sources in this game yet.");
  }

  const gameId = input.gameId.trim();
  const roomId = teamFilmRoomId(gameId);
  if (!input.asViewer) {
    markRoomHost(roomId);
  }

  const primary = angles[0]!;
  const multi = angles.length > 1;
  const chapters = timelineEventsToFilmRoomChapters(
    input.events,
    input.sources,
    angles,
  );

  const roomRef = ref(db, `rooms/${roomId}`);
  const existingSnap = await get(roomRef);
  const existing = existingSnap.val() as Record<string, unknown> | null;

  const payload: Record<string, unknown> = {
    ...(input.uid ? { ownerId: input.uid } : {}),
    gameId,
    videoId: primary.videoId,
    clips: [{ videoId: primary.videoId }],
    currentClipIndex: 0,
    isPlaying: false,
    currentTime: 0,
    playbackRate: DEFAULT_PLAYBACK_RATE,
    playbackCommand: null,
    chapters,
    angles: angles.map((a) => ({
      id: a.id,
      name: a.name,
      videoId: a.videoId,
      offsetFromGameTime: a.offsetFromGameTime ?? 0,
    })),
    currentAngleId: primary.id,
    ...(multi ? { manualSyncLocked: true } : {}),
    action: "init",
    actionId: 1,
    updatedAt: Date.now(),
  };

  if (existing && typeof existing === "object") {
    if (typeof existing.isPlaying === "boolean") {
      payload.isPlaying = existing.isPlaying;
    }
    if (typeof existing.currentTime === "number" && Number.isFinite(existing.currentTime)) {
      payload.currentTime = existing.currentTime;
    }
    if (
      typeof existing.currentClipIndex === "number" &&
      Number.isFinite(existing.currentClipIndex)
    ) {
      payload.currentClipIndex = existing.currentClipIndex;
    }
    if (typeof existing.currentAngleId === "string" && existing.currentAngleId.trim()) {
      payload.currentAngleId = existing.currentAngleId.trim();
    }
    if (typeof existing.playbackRate === "number" && Number.isFinite(existing.playbackRate)) {
      payload.playbackRate = existing.playbackRate;
    }
  }

  await set(roomRef, payload);

  const url = buildTeamFilmRoomNavigateUrl(roomId, gameId, primary.videoId, multi, {
    viewer: input.asViewer,
    reelId: input.reelId,
  });

  return { roomId, url };
}
