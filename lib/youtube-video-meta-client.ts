/**
 * Client helper for `/api/youtube-video-meta`.
 */

export type YouTubeVideoMeta = {
  videoId: string;
  title?: string;
  channelId?: string;
  channelTitle?: string;
  durationSec?: number;
  privacyStatus?: string;
  embeddable?: boolean;
  uploadStatus?: string;
  isLive?: boolean;
  streamPhase?: string;
  /** Exact start of a live broadcast (`liveStreamingDetails.actualStartTime`). */
  actualStartTime?: string;
  /** Scheduled start of a (live) broadcast. */
  scheduledStartTime?: string;
  /** Upload publish time — not a recording time; do not use for alignment. */
  publishedAt?: string;
  /** Uploader-declared recording date (often date-only). */
  recordingDate?: string;
};

type MetaResponse = {
  ok?: boolean;
  error?: string;
  meta?: YouTubeVideoMeta;
};

/** Fetch public video metadata via the server route. */
export async function fetchYouTubeVideoMeta(
  videoId: string,
): Promise<YouTubeVideoMeta | null> {
  const trimmed = videoId.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(
      `/api/youtube-video-meta?videoId=${encodeURIComponent(trimmed)}`,
    );
    const data = (await res.json()) as MetaResponse;
    if (data.ok && data.meta) return data.meta;
  } catch {
    /* best-effort */
  }
  return null;
}

/** True when YouTube has the video id but playback metadata may still be settling. */
export function isYouTubeVideoProcessing(meta: YouTubeVideoMeta | null): boolean {
  if (!meta) return true;
  if (meta.uploadStatus === "uploaded") return true;
  if (meta.uploadStatus === "processed") return false;
  if (meta.durationSec == null && meta.streamPhase === "vod") return true;
  return false;
}

/** Poll metadata briefly after a fresh upload (YouTube indexing lag). */
export async function fetchYouTubeVideoMetaWithRetry(
  videoId: string,
  opts?: { attempts?: number; delayMs?: number },
): Promise<YouTubeVideoMeta | null> {
  const attempts = opts?.attempts ?? 4;
  const delayMs = opts?.delayMs ?? 2000;
  let last: YouTubeVideoMeta | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await fetchYouTubeVideoMeta(videoId);
    if (last && !isYouTubeVideoProcessing(last)) return last;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return last;
}

export function metaToSourcePatch(meta: YouTubeVideoMeta): {
  durationSec?: number;
  youtubeChannelId?: string;
  youtubeChannelTitle?: string;
  youtubePrivacyStatus?: "private" | "unlisted" | "public";
  youtubeEmbeddable?: boolean;
} {
  const privacy =
    meta.privacyStatus === "private" ||
    meta.privacyStatus === "unlisted" ||
    meta.privacyStatus === "public"
      ? meta.privacyStatus
      : undefined;
  return {
    ...(typeof meta.durationSec === "number" && meta.durationSec > 0
      ? { durationSec: meta.durationSec }
      : {}),
    ...(meta.channelId ? { youtubeChannelId: meta.channelId } : {}),
    ...(meta.channelTitle ? { youtubeChannelTitle: meta.channelTitle } : {}),
    ...(privacy ? { youtubePrivacyStatus: privacy } : {}),
    ...(typeof meta.embeddable === "boolean"
      ? { youtubeEmbeddable: meta.embeddable }
      : {}),
  };
}
