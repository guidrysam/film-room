import type { GameTimelineEvent, GameTimelineEventInput } from "@/lib/games";
import { withEventPlayerIds } from "@/lib/timeline-players";
import type { RoomGameMark } from "@/lib/room-game-marks";
// Type-only import: no runtime dependency on saved-sessions (avoids any cycle).
import type { SavedChapter } from "@/lib/saved-sessions";

/**
 * Converters between the legacy marker shapes (chapters, RoomGameMark) and the
 * unified typed timeline events. Event type names stay aligned with
 * `GameTimelineEventType`: coach_mark | sync_point | note | tag | layout |
 * camera_switch.
 *
 * These return event *inputs* (no id / no Firestore timestamp) suitable for
 * `addGameEvent`.
 */

/**
 * A saved chapter → a timeline event input.
 *
 * Chapters are labeled jump points, so they map to `coach_mark`. Canonical game
 * time prefers `gameTime` (the shared game clock) and falls back to `time`.
 * The original `videoId` (and `time`) are kept in `payload` for round-tripping.
 */
export function chapterToTimelineEvent(
  chapter: SavedChapter,
  opts?: { sourceId?: string },
): GameTimelineEventInput {
  const t =
    typeof chapter.gameTime === "number" && Number.isFinite(chapter.gameTime)
      ? chapter.gameTime
      : chapter.time;
  return {
    type: "coach_mark",
    t: Math.max(0, t),
    label: chapter.label,
    ...(opts?.sourceId ? { sourceId: opts.sourceId } : {}),
    payload: {
      videoId: chapter.videoId,
      sourceTime: chapter.time,
      ...(typeof chapter.gameTime === "number" ? { gameTime: chapter.gameTime } : {}),
    },
  };
}

/** A live room mark → a `coach_mark` timeline event input. */
export function roomGameMarkToTimelineEvent(
  mark: RoomGameMark,
  opts?: { sourceId?: string; playerIds?: string[] },
): GameTimelineEventInput {
  const sourceId = opts?.sourceId ?? mark.angleId;
  const basePayload = mark.angleId ? { angleId: mark.angleId } : undefined;
  const payload =
    opts?.playerIds && opts.playerIds.length > 0
      ? withEventPlayerIds(basePayload, opts.playerIds)
      : basePayload;
  return {
    type: "coach_mark",
    t: Math.max(0, mark.timestamp),
    label: mark.label,
    ...(sourceId ? { sourceId } : {}),
    ...(mark.createdByRole ? { createdByRole: mark.createdByRole } : {}),
    ...(mark.createdByName ? { createdByName: mark.createdByName } : {}),
    ...(payload ? { payload } : {}),
  };
}

/** Event types that represent a labeled point in time and can become a chapter. */
const CHAPTER_LIKE_TYPES = new Set(["coach_mark", "sync_point", "note", "tag"]);

/**
 * A timeline event → a saved chapter, or null when it can't be represented
 * (e.g. layout / camera_switch events, or no resolvable videoId).
 *
 * Resolves videoId from the event payload, then the provided fallback.
 */
export function timelineEventToChapter(
  event: GameTimelineEvent,
  opts?: { fallbackVideoId?: string },
): SavedChapter | null {
  if (!CHAPTER_LIKE_TYPES.has(event.type)) return null;
  const payloadVideoId =
    event.payload && typeof event.payload.videoId === "string"
      ? (event.payload.videoId as string).trim()
      : "";
  const videoId = payloadVideoId || (opts?.fallbackVideoId ?? "").trim();
  if (!videoId) return null;
  const label =
    typeof event.label === "string" && event.label.trim() !== ""
      ? event.label.trim()
      : event.type === "coach_mark"
        ? "Mark"
        : event.type;
  return {
    time: Math.max(0, event.t),
    label,
    videoId,
    gameTime: Math.max(0, event.t),
  };
}
