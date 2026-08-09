import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { getUserYouTubeUploadAccessToken } from "@/lib/youtube/user-upload-oauth";
import { isGameCapMogoYouTubeVideo } from "@/lib/youtube/mogo-match";

export type ChannelVideoRow = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl?: string;
};

export { isGameCapMogoYouTubeVideo } from "@/lib/youtube/mogo-match";

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

  const playlist = await ytJson<{
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
    "https://www.googleapis.com/youtube/v3/playlistItems?" +
      new URLSearchParams({
        part: "snippet,contentDetails",
        playlistId: uploadsId,
        maxResults: String(Math.min(50, Math.max(1, maxResults))),
      }).toString(),
  );

  const rows: ChannelVideoRow[] = [];
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
  return rows;
}

export type SyncChannelResult = {
  scanned: number;
  matched: number;
  imported: number;
  skippedExisting: number;
  skippedDismissed: number;
  sources: Array<{ id: string; videoId: string; label: string }>;
};

/**
 * Pull recent channel uploads, match Game Cap MOGO naming, and stack new
 * work items in My Film (unless already imported or dismissed).
 */
export async function syncGameCapMogoChannelToInbox(
  uid: string,
): Promise<SyncChannelResult> {
  const { accessToken } = await getUserYouTubeUploadAccessToken(uid);
  const recent = await listRecentChannelUploads(accessToken, 30);
  const matched = recent.filter((r) =>
    isGameCapMogoYouTubeVideo(r.title, r.description),
  );

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

    const existing = await filmCol
      .where("youtubeVideoId", "==", row.videoId)
      .limit(1)
      .get();
    if (!existing.empty) {
      skippedExisting += 1;
      const doc = existing.docs[0]!;
      sources.push({
        id: doc.id,
        videoId: row.videoId,
        label:
          typeof doc.data().label === "string"
            ? doc.data().label
            : row.title,
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
      continue;
    }

    const sourceRef = filmCol.doc();
    const label = row.title.replace(/\.mov$/i, "").trim() || row.videoId;
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
