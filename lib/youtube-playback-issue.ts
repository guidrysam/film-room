import { extractYouTubeVideoId } from "@/lib/youtube-id";
import type { GameVideoSource } from "@/lib/games";
import {
  isYouTubeVideoProcessing,
  type YouTubeVideoMeta,
} from "@/lib/youtube-video-meta-client";

export type YouTubePlaybackIssueCode =
  | "ok"
  | "invalid_video_id"
  | "not_youtube"
  | "video_not_found"
  | "still_processing"
  | "embedding_unconfirmed"
  | "private_video"
  | "not_embeddable"
  | "live_embed_disabled";

export type YouTubePlaybackDiagnosis = {
  code: YouTubePlaybackIssueCode;
  severity: "ok" | "info" | "warning" | "error";
  headline: string;
  detail?: string;
  steps: string[];
  /** OAuth owner can try videos.update embed repair. */
  canAutoFix: boolean;
  videoId?: string;
  watchUrl?: string;
  studioUrl?: string;
};

export function watchUrlForVideoId(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function studioUrlForVideoId(videoId: string): string {
  return `https://studio.youtube.com/video/${videoId}/edit`;
}

function baseDiagnosis(
  partial: Omit<YouTubePlaybackDiagnosis, "canAutoFix"> & {
    canAutoFix?: boolean;
  },
): YouTubePlaybackDiagnosis {
  return {
    canAutoFix: partial.canAutoFix ?? false,
    ...partial,
  };
}

export function diagnoseFromYouTubeMeta(
  meta: YouTubeVideoMeta | null,
  opts?: {
    videoId?: string;
    /** Set after an OAuth embed repair still failed (likely channel kids audience). */
    autoFixFailed?: boolean;
  },
): YouTubePlaybackDiagnosis {
  const videoId = (opts?.videoId ?? meta?.videoId ?? "").trim();

  if (!videoId) {
    return baseDiagnosis({
      code: "invalid_video_id",
      severity: "error",
      headline: "Enter a valid YouTube URL or 11-character video ID",
      steps: [
        "Copy the link from YouTube (Share → Copy link) or paste the video ID.",
      ],
    });
  }

  const watchUrl = watchUrlForVideoId(videoId);
  const studioUrl = studioUrlForVideoId(videoId);

  if (!meta) {
    return baseDiagnosis({
      code: "video_not_found",
      severity: "error",
      headline: "Video not found or not visible to Film Room",
      detail:
        "YouTube did not return metadata. The link may be wrong, deleted, or set to Private on a channel Film Room cannot read.",
      steps: [
        "Open the link on YouTube and confirm it plays for you while signed in.",
        "If it is yours, set visibility to Unlisted (not Private) in YouTube Studio.",
        "Re-paste the link here, or upload through Game Cap so we set the right permissions.",
      ],
      videoId,
      watchUrl,
      studioUrl,
    });
  }

  if (isYouTubeVideoProcessing(meta)) {
    return baseDiagnosis({
      code: "still_processing",
      severity: "info",
      headline: "YouTube is still processing this video",
      detail:
        "The upload is attached, but embedding and sync may not work until processing finishes.",
      steps: [
        "Wait a few minutes, then tap Re-check or Sync from YouTube.",
        "Keep the video Unlisted with embedding allowed once processing completes.",
      ],
      videoId,
      watchUrl,
      studioUrl,
    });
  }

  if (meta.privacyStatus === "private") {
    return baseDiagnosis({
      code: "private_video",
      severity: "error",
      headline: "Private — won't play for your team in Film Room",
      detail:
        "Private videos only play for the uploader's Google account. Coaches and other parents cannot see them inside the app.",
      steps: [
        "YouTube Studio → Content → this video → Visibility → change to Unlisted.",
        "Unlisted keeps it off YouTube search but lets anyone with the game link use it in Film Room.",
        "Or upload through Game Cap — we default to Unlisted + embeddable.",
      ],
      canAutoFix: false,
      videoId,
      watchUrl,
      studioUrl,
    });
  }

  const liveBlocked =
    (meta.streamPhase === "active" || meta.isLive === true) &&
    meta.embeddable === false;

  if (liveBlocked) {
    return baseDiagnosis({
      code: "live_embed_disabled",
      severity: "error",
      headline: "Live stream — embedding is turned off",
      detail:
        "Film Room plays video inside an iframe. This live broadcast does not allow embedding.",
      steps: [
        "YouTube Studio → Live → this stream → enable Allow embedding.",
        "If you created the stream outside Film Room, paste the watch link after embedding is on.",
        "After the game, the archived VOD may embed even when live did not — try Re-check when the stream ends.",
      ],
      canAutoFix: true,
      videoId,
      watchUrl,
      studioUrl,
    });
  }

  if (meta.embeddable === false) {
    const madeForKidsHint = opts?.autoFixFailed
      ? "Auto-fix did not help — your whole channel may be set to Made for Kids, which disables embedding."
      : "The usual cause is Made for Kids audience settings, which disable embeds.";

    return baseDiagnosis({
      code: "not_embeddable",
      severity: "error",
      headline: "Won't play inside Film Room — embedding blocked",
      detail: madeForKidsHint,
      steps: opts?.autoFixFailed
        ? [
            "YouTube Studio → Settings → Channel → Audience → set channel to not Made for Kids (if appropriate).",
            "YouTube Studio → Content → this video → Audience → No, it's not made for kids.",
            "Tap Re-check here after saving in Studio.",
          ]
        : [
            "Tap Try auto-fix if this is your upload (Film Room will re-assert embeddable + not made for kids).",
            "YouTube Studio → Content → this video → Audience → No, it's not made for kids.",
            "If still blocked, check channel-level Audience in YouTube Studio → Settings → Channel.",
          ],
      canAutoFix: true,
      videoId,
      watchUrl,
      studioUrl,
    });
  }

  if (meta.embeddable !== true) {
    return baseDiagnosis({
      code: "embedding_unconfirmed",
      severity: "info",
      headline: "Embedding not confirmed yet",
      detail:
        "YouTube has not confirmed whether this video can play inside Film Room.",
      steps: [
        "Wait a minute after upload, then tap Re-check or Sync from YouTube.",
        "If it stays unconfirmed, open the video in YouTube Studio and confirm it is Unlisted with embedding allowed.",
      ],
      canAutoFix: true,
      videoId,
      watchUrl,
      studioUrl,
    });
  }

  return baseDiagnosis({
    code: "ok",
    severity: "ok",
    headline: "Ready for Film Room",
    steps: [],
    videoId,
    watchUrl,
    studioUrl,
  });
}

/** Diagnose from stored game source fields (no network). Returns null when playable or non-YouTube. */
export function diagnoseFromGameSource(
  source: GameVideoSource,
): YouTubePlaybackDiagnosis | null {
  if (source.kind !== "youtube" && source.kind !== "youtube_live") {
    return baseDiagnosis({
      code: "not_youtube",
      severity: "warning",
      headline: "Not a YouTube source — won't play in Film Room yet",
      steps: [
        "Film Room currently plays YouTube angles only.",
        "Upload to YouTube via Game Cap, or paste a YouTube link.",
      ],
    });
  }

  const videoId = source.videoId?.trim();
  if (!videoId) {
    return baseDiagnosis({
      code: "invalid_video_id",
      severity: "error",
      headline: "Missing YouTube video ID",
      steps: ["Remove this source and attach a valid YouTube URL or ID."],
    });
  }

  if (source.youtubePrivacyStatus === "private") {
    return diagnoseFromYouTubeMeta({
      videoId,
      privacyStatus: "private",
    });
  }

  if (source.youtubeEmbeddable === false) {
    return diagnoseFromYouTubeMeta({
      videoId,
      embeddable: false,
      privacyStatus: source.youtubePrivacyStatus,
    });
  }

  return null;
}

export function diagnosePasteInput(
  urlOrId: string,
  meta: YouTubeVideoMeta | null,
): YouTubePlaybackDiagnosis {
  const videoId = extractYouTubeVideoId(urlOrId.trim());
  if (!videoId) {
    return baseDiagnosis({
      code: "invalid_video_id",
      severity: "error",
      headline: "Enter a valid YouTube URL or video ID",
      steps: ["Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    });
  }
  return diagnoseFromYouTubeMeta(meta, { videoId });
}

export function playbackIssueBadgeLabel(
  code: YouTubePlaybackIssueCode,
): string | null {
  switch (code) {
    case "private_video":
      return "Private";
    case "not_embeddable":
    case "live_embed_disabled":
      return "Won't embed";
    case "still_processing":
    case "embedding_unconfirmed":
      return "Processing";
    case "video_not_found":
      return "Not found";
    case "invalid_video_id":
      return "Invalid link";
    case "not_youtube":
      return "Not YouTube";
    default:
      return null;
  }
}

export function playbackIssueBadgeClass(code: YouTubePlaybackIssueCode): string {
  switch (code) {
    case "still_processing":
      return "border-sky-500/35 bg-sky-950/40 text-sky-200";
    case "not_youtube":
      return "border-amber-500/35 bg-amber-950/40 text-amber-200";
    default:
      return "border-amber-500/40 bg-amber-950/45 text-amber-100";
  }
}
