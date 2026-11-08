/**
 * Open selected season highlight YouTube clips as a Film Room *clip queue*
 * (not multi-angle sync). Each VOD is its own playlist item so marks stay
 * scoped to that video — same mental model as a teaching session.
 */

import { ref, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { markRoomHost } from "@/lib/room-host";

export type SeasonRoomClip = {
  youtubeVideoId: string;
  label: string;
};

export type SeasonRoomChapterSeed = {
  time: number;
  label: string;
  videoId: string;
};

function randomRoomId(): string {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Seed a Film Room with the selected clips in queue order and return its URL.
 * Links back to the season game for Review / reel studio.
 */
export async function openSeasonHighlightInFilmRoom(
  gameId: string,
  clips: SeasonRoomClip[],
  chapters: SeasonRoomChapterSeed[],
  uid?: string,
): Promise<{ roomId: string; url: string }> {
  if (clips.length === 0) {
    throw new Error("Select at least one clip.");
  }

  const roomClips = clips.map((c) => ({
    videoId: c.youtubeVideoId,
    label: c.label,
    provider: "youtube" as const,
  }));
  const primary = roomClips[0]!;

  const roomId = randomRoomId();
  markRoomHost(roomId);

  await set(ref(db, `rooms/${roomId}`), {
    ...(uid ? { ownerId: uid } : {}),
    videoId: primary.videoId,
    clips: roomClips,
    currentClipIndex: 0,
    isPlaying: false,
    currentTime: 0,
    playbackRate: 1,
    playbackCommand: null,
    chapters,
    angles: [],
    currentAngleId: null,
    action: "init",
    actionId: 1,
    updatedAt: Date.now(),
    seasonHighlight: true,
  });

  const qs = new URLSearchParams();
  qs.set("video", primary.videoId);
  qs.set("gameId", gameId);
  qs.set("season", "1");

  return { roomId, url: `/room/${roomId}?${qs.toString()}` };
}
