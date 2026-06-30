import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAutoApplyClockSync,
  isoHasTimeOfDay,
  recordedStartFromMeta,
  youtubeClockSyncPatch,
} from "./youtube-clock-sync";
import type { YouTubeVideoMeta } from "./youtube-video-meta-client";

function meta(partial: Partial<YouTubeVideoMeta>): YouTubeVideoMeta {
  return { videoId: "abc123", ...partial };
}

test("isoHasTimeOfDay only true for strings with a clock time", () => {
  assert.equal(isoHasTimeOfDay("2026-06-28T14:00:00Z"), true);
  assert.equal(isoHasTimeOfDay("2026-06-28"), false);
  assert.equal(isoHasTimeOfDay(undefined), false);
});

test("recordedStartFromMeta prefers the live broadcast actual start", () => {
  const r = recordedStartFromMeta(
    meta({
      actualStartTime: "2026-06-28T13:55:00Z",
      recordingDate: "2026-06-28T00:00:00Z",
      publishedAt: "2026-06-28T20:00:00Z",
    }),
  );
  assert.equal(r?.source, "live_actual_start");
  assert.equal(r?.recordedStartTime, "2026-06-28T13:55:00Z");
});

test("recordedStartFromMeta ignores upload (publishedAt) time", () => {
  // Only publishedAt present → not usable for alignment.
  assert.equal(recordedStartFromMeta(meta({ publishedAt: "2026-06-28T20:00:00Z" })), null);
});

test("recordedStartFromMeta ignores date-only recordingDate", () => {
  assert.equal(recordedStartFromMeta(meta({ recordingDate: "2026-06-28" })), null);
});

test("youtubeClockSyncPatch computes offset from kickoff minus broadcast start", () => {
  // Broadcast started 5 minutes before kickoff → kickoff is +300s into the video.
  const patch = youtubeClockSyncPatch(
    { scheduledStartAt: "2026-06-28T14:00:00Z" },
    meta({ actualStartTime: "2026-06-28T13:55:00Z" }),
  );
  assert.ok(patch);
  assert.equal(patch?.offsetFromGameTime, 300);
  assert.equal(patch?.syncStatus, "clock_synced");
});

test("youtubeClockSyncPatch returns null without a kickoff time-of-day", () => {
  const patch = youtubeClockSyncPatch(
    { scheduledStartAt: "2026-06-28" },
    meta({ actualStartTime: "2026-06-28T13:55:00Z" }),
  );
  assert.equal(patch, null);
});

test("youtubeClockSyncPatch returns null without a usable recording time", () => {
  const patch = youtubeClockSyncPatch(
    { scheduledStartAt: "2026-06-28T14:00:00Z" },
    meta({ publishedAt: "2026-06-28T20:00:00Z" }),
  );
  assert.equal(patch, null);
});

test("canAutoApplyClockSync never overrides a manual or audio alignment", () => {
  assert.equal(canAutoApplyClockSync({ syncStatus: undefined }), true);
  assert.equal(canAutoApplyClockSync({ syncStatus: "unsynced" }), true);
  assert.equal(canAutoApplyClockSync({ syncStatus: "clock_synced" }), true);
  assert.equal(canAutoApplyClockSync({ syncStatus: "manually_synced" }), false);
  assert.equal(canAutoApplyClockSync({ syncStatus: "audio_synced" }), false);
});
