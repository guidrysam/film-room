/**
 * Auto-alignment for *linked* YouTube videos.
 *
 * Uploaded phone clips get a recording time from their file metadata (see
 * lib/video-capture-time.ts). A pasted YouTube link has no file to read, so we
 * derive a recording start from the YouTube Data API metadata instead and feed
 * it through the same {@link estimateClockSync} path used for uploads.
 *
 * Only signals that carry an explicit time-of-day are usable:
 *   - `liveStreamingDetails.actualStartTime` — exact broadcast start (best; this
 *     is the common "official team feed" live stream case).
 *   - `recordingDetails.recordingDate` — only when it includes a time component.
 *
 * `publishedAt` (upload time) is intentionally ignored: it is when the video was
 * uploaded, not when filming started, so using it would misalign the clip.
 */

import { estimateClockSync } from "@/lib/game-timeline";
import type { Game, GameSourceSyncPatch, GameVideoSource } from "@/lib/games";
import type { YouTubeVideoMeta } from "@/lib/youtube-video-meta-client";

/** True when an ISO-ish string includes an explicit time-of-day (not date-only). */
export function isoHasTimeOfDay(value: string | undefined): boolean {
  if (!value) return false;
  return /T\d{2}:\d{2}/.test(value.trim());
}

export type RecordedStartSource = "live_actual_start" | "recording_date";

export type RecordedStartFromMeta = {
  recordedStartTime: string;
  source: RecordedStartSource;
};

/** Pick a usable recording start time from YouTube metadata, or null. */
export function recordedStartFromMeta(
  meta: YouTubeVideoMeta,
): RecordedStartFromMeta | null {
  if (isoHasTimeOfDay(meta.actualStartTime)) {
    return {
      recordedStartTime: meta.actualStartTime!.trim(),
      source: "live_actual_start",
    };
  }
  if (isoHasTimeOfDay(meta.recordingDate)) {
    return {
      recordedStartTime: meta.recordingDate!.trim(),
      source: "recording_date",
    };
  }
  return null;
}

/**
 * Build an auto clock-sync patch for a YouTube source from its metadata and the
 * game's kickoff. Returns null when there isn't enough information: no usable
 * recording time, or the game has no explicit kickoff time-of-day (which would
 * otherwise produce a wildly wrong offset against midnight).
 */
export function youtubeClockSyncPatch(
  game: Pick<Game, "scheduledStartAt">,
  meta: YouTubeVideoMeta,
): GameSourceSyncPatch | null {
  if (!isoHasTimeOfDay(game.scheduledStartAt)) return null;
  const rec = recordedStartFromMeta(meta);
  if (!rec) return null;
  const est = estimateClockSync(game, {
    recordedStartTime: rec.recordedStartTime,
  });
  if (!est) return null;
  return {
    recordedStartTime: rec.recordedStartTime,
    offsetFromGameTime: est.offsetFromGameTime,
    syncStatus: est.syncStatus,
    syncConfidence: est.syncConfidence,
  };
}

/**
 * Auto-sync should never override an alignment a human (or audio match) set.
 * Only apply when the source is unaligned or was previously clock-synced.
 */
export function canAutoApplyClockSync(
  source: Pick<GameVideoSource, "syncStatus">,
): boolean {
  const s = source.syncStatus;
  return s == null || s === "unsynced" || s === "clock_synced";
}
