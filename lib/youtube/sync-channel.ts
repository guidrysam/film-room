import "server-only";

import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { getUserYouTubeUploadAccessToken } from "@/lib/youtube/user-upload-oauth";
import {
  classifyGameCapChannelUpload,
  isGameCapChannelYouTubeVideo,
} from "@/lib/youtube/channel-match";
import { parseIso8601DurationToSeconds } from "@/lib/youtube-duration";

/** Full games run long; highlight cuts are usually under this. */
export const HIGHLIGHT_MAX_DURATION_SEC = 10 * 60;

export type ChannelVideoRow = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl?: string;
  durationSec?: number;
};

export { isGameCapMogoYouTubeVideo } from "@/lib/youtube/mogo-match";
export { isGameCapTripodYouTubeVideo } from "@/lib/youtube/tripod-match";
export { isGameCapChannelYouTubeVideo } from "@/lib/youtube/channel-match";

async function ytJson<T>(
  accessToken: string,
  url: string,
): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `YouTube API ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

export async function listRecentChannelUploads(
  accessToken: string,
  maxResults = 25,
): Promise<ChannelVideoRow[]> {
  const channels = await ytJson<{
    items?: Array<{
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  }>(
    accessToken,
    "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
  );
  const uploadsId =
    channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads?.trim() ??
    "";
  if (!uploadsId) return [];

  const want = Math.min(150, Math.max(1, maxResults));
  const rows: ChannelVideoRow[] = [];
  let pageToken = "";

  while (rows.length < want) {
    const pageSize = Math.min(50, want - rows.length);
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId: uploadsId,
      maxResults: String(pageSize),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const playlist = await ytJson<{
      nextPageToken?: string;
      items?: Array<{
        contentDetails?: { videoId?: string };
        snippet?: {
          title?: string;
          description?: string;
          publishedAt?: string;
          thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
        };
      }>;
    }>(
      accessToken,
      "https://www.googleapis.com/youtube/v3/playlistItems?" + params.toString(),
    );

    for (const item of playlist.items ?? []) {
      const videoId = item.contentDetails?.videoId?.trim() ?? "";
      if (!videoId) continue;
      const title = item.snippet?.title?.trim() ?? videoId;
      const description = item.snippet?.description?.trim() ?? "";
      const publishedAt = item.snippet?.publishedAt?.trim() ?? "";
      const thumbnailUrl =
        item.snippet?.thumbnails?.medium?.url?.trim() ||
        item.snippet?.thumbnails?.default?.url?.trim() ||
        undefined;
      rows.push({
        videoId,
        title,
        description,
        publishedAt,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      });
    }

    pageToken = playlist.nextPageToken?.trim() ?? "";
    if (!pageToken || !(playlist.items?.length ?? 0)) break;
  }

  return rows;
}

/** Batch-fetch ISO durations via videos.list (50 ids per call). */
export async function attachChannelVideoDurations(
  accessToken: string,
  rows: ChannelVideoRow[],
): Promise<ChannelVideoRow[]> {
  if (rows.length === 0) return rows;
  const byId = new Map(rows.map((r) => [r.videoId, { ...r }]));
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await ytJson<{
      items?: Array<{
        id?: string;
        contentDetails?: { duration?: string };
      }>;
    }>(
      accessToken,
      "https://www.googleapis.com/youtube/v3/videos?" +
        new URLSearchParams({
          part: "contentDetails",
          id: chunk.join(","),
        }).toString(),
    );
    for (const item of data.items ?? []) {
      const id = item.id?.trim() ?? "";
      const row = id ? byId.get(id) : undefined;
      if (!row) continue;
      const durationSec = parseIso8601DurationToSeconds(
        item.contentDetails?.duration ?? "",
      );
      if (typeof durationSec === "number") {
        byId.set(id, { ...row, durationSec });
      }
    }
  }
  return rows.map((r) => byId.get(r.videoId) ?? r);
}

export type SyncChannelOptions = {
  /**
   * When set, only import Game Cap matches at or under this length
   * (e.g. 600 for highlight-length clips).
   */
  maxDurationSec?: number;
};

export type SyncChannelResult = {
  scanned: number;
  matched: number;
  imported: number;
  skippedExisting: number;
  skippedDismissed: number;
  skippedTooLong: number;
  sources: Array<{ id: string; videoId: string; label: string }>;
};

/**
 * Pull recent channel uploads, match Game Cap MOGO + Tripod naming, and stack
 * new work items in My Film (unless already imported or dismissed).
 */
export async function syncGameCapMogoChannelToInbox(
  uid: string,
  opts?: SyncChannelOptions,
): Promise<SyncChannelResult> {
  const { accessToken } = await getUserYouTubeUploadAccessToken(uid);
  // Page through recent uploads so older Tripod / highlight cuts still surface.
  const recent = await listRecentChannelUploads(accessToken, 100);
  const nameMatched = recent.filter((r) =>
    isGameCapChannelYouTubeVideo(r.title, r.description),
  );
  const withDuration = await attachChannelVideoDurations(
    accessToken,
    nameMatched,
  );
  const maxDurationSec =
    typeof opts?.maxDurationSec === "number" &&
    Number.isFinite(opts.maxDurationSec) &&
    opts.maxDurationSec > 0
      ? opts.maxDurationSec
      : undefined;
  let skippedTooLong = 0;
  const matched = maxDurationSec
    ? withDuration.filter((r) => {
        if (typeof r.durationSec !== "number") {
          // No duration → skip when filtering shorts so we don't pull full games.
          skippedTooLong += 1;
          return false;
        }
        if (r.durationSec > maxDurationSec) {
          skippedTooLong += 1;
          return false;
        }
        return true;
      })
    : withDuration;

  const filmCol = adminFirestore
    .collection("users")
    .doc(uid)
    .collection("filmSources");
  const dismissCol = adminFirestore
    .collection("users")
    .doc(uid)
    .collection("youtubeDismissals");

  let imported = 0;
  let skippedExisting = 0;
  let skippedDismissed = 0;
  const sources: Array<{ id: string; videoId: string; label: string }> = [];

  for (const row of matched) {
    const dismissed = await dismissCol.doc(row.videoId).get();
    if (dismissed.exists) {
      skippedDismissed += 1;
      continue;
    }

    const classified = classifyGameCapChannelUpload(row.title, row.description);
    const label =
      classified?.label ||
      row.title.replace(/\.mov$/i, "").trim() ||
      row.videoId;
    const shortEnough =
      typeof row.durationSec === "number" &&
      row.durationSec > 0 &&
      row.durationSec <= HIGHLIGHT_MAX_DURATION_SEC;
    const isHighlight = Boolean(classified?.isHighlight || shortEnough);

    const patchExisting = async (
      ref: DocumentReference,
      existingLabel: string,
    ) => {
      // Backfill duration / highlight flags so Under 10 min works on older rows.
      const patch: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        status: "ready",
        workQueue: true,
      };
      if (typeof row.durationSec === "number") patch.durationSec = row.durationSec;
      if (isHighlight) patch.filmKind = "highlight";
      if (classified?.device) patch.captureDevice = classified.device;
      if (row.publishedAt) patch.publishedAt = row.publishedAt;
      if (row.thumbnailUrl) patch.thumbnailUrl = row.thumbnailUrl;
      if (!existingLabel.trim() && label) patch.label = label;
      await ref.set(patch, { merge: true });
    };

    const existing = await filmCol
      .where("youtubeVideoId", "==", row.videoId)
      .limit(1)
      .get();
    if (!existing.empty) {
      skippedExisting += 1;
      const doc = existing.docs[0]!;
      const existingLabel =
        typeof doc.data().label === "string" ? doc.data().label : "";
      await patchExisting(doc.ref, existingLabel);
      sources.push({
        id: doc.id,
        videoId: row.videoId,
        label: existingLabel || label,
      });
      continue;
    }

    // Also match legacy videoId field.
    const existingVid = await filmCol
      .where("videoId", "==", row.videoId)
      .limit(1)
      .get();
    if (!existingVid.empty) {
      skippedExisting += 1;
      const doc = existingVid.docs[0]!;
      const existingLabel =
        typeof doc.data().label === "string" ? doc.data().label : "";
      await patchExisting(doc.ref, existingLabel);
      sources.push({
        id: doc.id,
        videoId: row.videoId,
        label: existingLabel || label,
      });
      continue;
    }

    const sourceRef = filmCol.doc();
    await sourceRef.set({
      id: sourceRef.id,
      ownerUid: uid,
      kind: "youtube",
      label,
      organizeKind: "game",
      status: "ready",
      workQueue: true,
      videoId: row.videoId,
      youtubeVideoId: row.videoId,
      youtubePrivacyStatus: "unlisted",
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(row.videoId)}`,
      uploadedBy: uid,
      createdBy: uid,
      source: "youtube_channel_sync",
      ...(classified?.device ? { captureDevice: classified.device } : {}),
      ...(isHighlight ? { filmKind: "highlight" } : {}),
      ...(typeof row.durationSec === "number"
        ? { durationSec: row.durationSec }
        : {}),
      ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
      ...(row.thumbnailUrl ? { thumbnailUrl: row.thumbnailUrl } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    imported += 1;
    sources.push({ id: sourceRef.id, videoId: row.videoId, label });
  }

  return {
    scanned: recent.length,
    matched: matched.length,
    imported,
    skippedExisting,
    skippedDismissed,
    skippedTooLong,
    sources,
  };
}

export async function dismissYouTubeWorkItem(opts: {
  uid: string;
  videoId?: string;
  sourceId?: string;
}): Promise<void> {
  let videoId = opts.videoId?.trim() ?? "";
  const sourceId = opts.sourceId?.trim() ?? "";

  if (!videoId && sourceId) {
    const snap = await adminFirestore
      .collection("users")
      .doc(opts.uid)
      .collection("filmSources")
      .doc(sourceId)
      .get();
    if (!snap.exists) throw new Error("SOURCE_NOT_FOUND");
    const data = snap.data() ?? {};
    videoId =
      (typeof data.youtubeVideoId === "string" && data.youtubeVideoId.trim()) ||
      (typeof data.videoId === "string" && data.videoId.trim()) ||
      "";
    await snap.ref.set(
      {
        status: "dismissed",
        workQueue: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (!videoId) throw new Error("MISSING_VIDEO_ID");

  await adminFirestore
    .collection("users")
    .doc(opts.uid)
    .collection("youtubeDismissals")
    .doc(videoId)
    .set(
      {
        videoId,
        dismissedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  // Soft-dismiss any matching open sources so they leave the stack.
  const open = await adminFirestore
    .collection("users")
    .doc(opts.uid)
    .collection("filmSources")
    .where("youtubeVideoId", "==", videoId)
    .limit(5)
    .get();
  for (const doc of open.docs) {
    await doc.ref.set(
      {
        status: "dismissed",
        workQueue: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}
