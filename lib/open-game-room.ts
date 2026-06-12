import { ref, set } from "firebase/database";
import { db } from "@/lib/firebase";
import type { GameVideoSource } from "@/lib/games";
import { markRoomHost } from "@/lib/room-host";
import { gameSourceToVideoAngle, type VideoAngle } from "@/lib/video-angle";

/**
 * Open a Game's YouTube sources in the existing Film Room.
 *
 * This does NOT rewrite the room player or generalize playback — it reuses the
 * current YouTube-backed multi-angle room by seeding RTDB `rooms/{roomId}` the
 * same way Stream Room / saved-session loads do, then navigating:
 *   - 1 source  → normal clip room
 *   - 2+ sources → sync/multi-angle room (angles + offsets preserved)
 *
 * Only YouTube-backed sources are playable today; uploads / external URLs are
 * skipped (a later phase adds player adapters).
 */

/** Convert Game sources to playable angles, preserving labels + offsets. */
export function gameSourcesToAngles(sources: GameVideoSource[]): VideoAngle[] {
  const out: VideoAngle[] = [];
  for (const s of sources) {
    const angle = gameSourceToVideoAngle(s);
    if (angle) out.push(angle);
  }
  return out;
}

const DEFAULT_PLAYBACK_RATE = 1;

function randomRoomId(): string {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Seed a fresh room from a Game's sources and return the room URL to navigate
 * to. Throws if no source is a playable YouTube video.
 */
export async function openGameInFilmRoom(
  game: { id: string },
  sources: GameVideoSource[],
  uid?: string,
): Promise<{ roomId: string; url: string }> {
  const angles = gameSourcesToAngles(sources);
  if (angles.length === 0) {
    throw new Error("No playable YouTube sources in this game yet.");
  }

  const roomId = randomRoomId();
  markRoomHost(roomId);

  const primary = angles[0]!;
  const multi = angles.length > 1;

  const payload: Record<string, unknown> = {
    ...(uid ? { ownerId: uid } : {}),
    videoId: primary.videoId,
    clips: [{ videoId: primary.videoId }],
    currentClipIndex: 0,
    isPlaying: false,
    currentTime: 0,
    playbackRate: DEFAULT_PLAYBACK_RATE,
    playbackCommand: null,
    chapters: [],
    angles: angles.map((a) => ({
      id: a.id,
      name: a.name,
      videoId: a.videoId,
      offsetFromGameTime: a.offsetFromGameTime ?? 0,
    })),
    currentAngleId: primary.id,
    // Multi-angle games carry per-source offsets as their declared alignment,
    // so open locked in sync mode (users can still re-sync in-room).
    ...(multi ? { manualSyncLocked: true } : {}),
    action: "init",
    actionId: 1,
    updatedAt: Date.now(),
  };

  await set(ref(db, `rooms/${roomId}`), payload);

  const qs = new URLSearchParams();
  qs.set("video", primary.videoId);
  if (multi) qs.set("view", "sync");
  // Bridge so in-room Coach Marks continue writing back to this Game.
  qs.set("gameId", game.id);

  return { roomId, url: `/room/${roomId}?${qs.toString()}` };
}
