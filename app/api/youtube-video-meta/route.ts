import { NextResponse } from "next/server";

import {
  logYoutubeApiErrorFromParts,
  youtubeApiErrorNextResponseFromFetch,
} from "@/lib/youtube-api-error-diagnostic";
import { parseIso8601DurationToSeconds } from "@/lib/youtube-duration";

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;
const ROUTE = "/api/youtube-video-meta";

export type YouTubeStreamPhase = "active" | "upcoming" | "ended" | "vod";

type YouTubeMeta = {
  videoId: string;
  title?: string;
  /** From `snippet.liveBroadcastContent`: none | live | upcoming */
  liveBroadcastContent?: string;
  /**
   * True for active/upcoming broadcast context, in-progress DVR, or signals like
   * active live chat / concurrent viewers while not ended (see `streamPhase` for nuance).
   */
  isLive?: boolean;
  /** Narrower: stream appears to be broadcasting now (not upcoming-only, not ended). */
  streamPhase?: YouTubeStreamPhase;
  actualStartTime?: string;
  actualEndTime?: string;
  scheduledStartTime?: string;
  concurrentViewers?: number;
  activeLiveChatId?: string;
  embeddable?: boolean;
  /** From `status` part */
  uploadStatus?: string;
  privacyStatus?: string;
  license?: string;
  /** From `snippet` */
  publishedAt?: string;
  /** From `recordingDetails.recordingDate` (often date-only). */
  recordingDate?: string;
  /** Broadcaster channel (for persistent /live URL hints). */
  channelId?: string;
  /** From `snippet.channelTitle`. */
  channelTitle?: string;
  /** Parsed from `contentDetails.duration` (ISO 8601). */
  durationSec?: number;
  /** From `channels.list` when `includeChannel=1` — use for `@handle/live` suggestions. */
  channelCustomUrl?: string;
};

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("videoId") ?? "").trim();
  const includeChannel = searchParams.get("includeChannel") === "1";
  if (!YT_ID.test(videoId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid videoId." },
      { status: 400 },
    );
  }

  const key = process.env.YOUTUBE_DATA_API_KEY;
  if (!key || !key.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing YOUTUBE_DATA_API_KEY server configuration" },
      { status: 500 },
    );
  }

  const url =
    "https://www.googleapis.com/youtube/v3/videos" +
    `?part=snippet,contentDetails,status,liveStreamingDetails,recordingDetails&id=${encodeURIComponent(videoId)}` +
    `&key=${encodeURIComponent(key)}`;
  const redactKey = (u: string) => u.replace(key, "<redacted>");

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    return NextResponse.json(
      { ok: false, error: "YouTube request failed." },
      { status: 502 },
    );
  }

  if (!res.ok) {
    let raw: unknown = null;
    try {
      raw = await res.json();
    } catch {
      raw = null;
    }
    return youtubeApiErrorNextResponseFromFetch({
      route: ROUTE,
      endpoint: url,
      res,
      rawBody: raw,
    });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid YouTube response." },
      { status: 502 },
    );
  }

  const root = data as {
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        liveBroadcastContent?: string;
        publishedAt?: string;
        channelId?: string;
        channelTitle?: string;
      };
      contentDetails?: {
        duration?: string;
      };
      liveStreamingDetails?: {
        actualStartTime?: string;
        actualEndTime?: string;
        scheduledStartTime?: string;
        concurrentViewers?: string | number;
        activeLiveChatId?: string;
      };
      status?: {
        embeddable?: boolean;
        uploadStatus?: string;
        privacyStatus?: string;
        license?: string;
      };
      recordingDetails?: {
        recordingDate?: string;
      };
    }>;
  };

  const item = Array.isArray(root.items) ? root.items[0] : undefined;
  if (!item || item.id !== videoId) {
    return NextResponse.json(
      { ok: false, error: "Video not found." },
      { status: 404 },
    );
  }

  const lbcRaw = item.snippet?.liveBroadcastContent;
  const liveBroadcastContent =
    typeof lbcRaw === "string" && lbcRaw.trim() !== ""
      ? lbcRaw.trim()
      : undefined;
  const details = item.liveStreamingDetails;
  const hasActualStart =
    typeof details?.actualStartTime === "string" &&
    details.actualStartTime.trim() !== "";
  const hasEnded =
    typeof details?.actualEndTime === "string" &&
    details.actualEndTime.trim() !== "";
  const hasScheduledStart =
    typeof details?.scheduledStartTime === "string" &&
    details.scheduledStartTime.trim() !== "";

  const activeLiveChatIdRaw = details?.activeLiveChatId;
  const activeLiveChatId =
    typeof activeLiveChatIdRaw === "string" && activeLiveChatIdRaw.trim() !== ""
      ? activeLiveChatIdRaw.trim()
      : undefined;

  let concurrentViewers: number | undefined;
  const cvRaw = details?.concurrentViewers;
  if (typeof cvRaw === "number" && Number.isFinite(cvRaw)) {
    concurrentViewers = cvRaw;
  } else if (typeof cvRaw === "string" && cvRaw.trim() !== "") {
    const n = Number.parseInt(cvRaw, 10);
    if (Number.isFinite(n)) concurrentViewers = n;
  }

  const inProgressWindow = hasActualStart && !hasEnded;
  /** Strong signal of an ongoing public broadcast (embeddable streams often still report this). */
  const hasLiveChatWhileNotEnded =
    Boolean(activeLiveChatId) && !hasEnded;
  /** Concurrent viewers are a strong hint the watch page is a live broadcast (when not ended). */
  const hasPositiveViewersWhileNotEnded =
    concurrentViewers !== undefined &&
    concurrentViewers > 0 &&
    !hasEnded;

  /**
   * Phase is driven first by `snippet.liveBroadcastContent` and `actualEndTime` so an
   * in-progress broadcast is "active" even when `actualStartTime` is missing/delayed.
   */
  let streamPhase: YouTubeStreamPhase;
  if (hasEnded) {
    streamPhase = "ended";
  } else if (liveBroadcastContent === "live") {
    streamPhase = "active";
  } else if (liveBroadcastContent === "upcoming") {
    streamPhase = "upcoming";
  } else if (hasScheduledStart && !hasActualStart && !hasEnded) {
    /* Scheduled webcast not yet marked `upcoming` on snippet */
    streamPhase = "upcoming";
  } else {
    streamPhase = "vod";
  }

  const broaderLiveContext =
    liveBroadcastContent === "upcoming" ||
    inProgressWindow ||
    hasLiveChatWhileNotEnded ||
    hasPositiveViewersWhileNotEnded;

  const isLive =
    !hasEnded &&
    (liveBroadcastContent === "live" || broaderLiveContext);

  const snippetChannelIdRaw = item.snippet?.channelId;
  const snippetChannelId =
    typeof snippetChannelIdRaw === "string" &&
    snippetChannelIdRaw.trim() !== "" &&
    CHANNEL_ID_RE.test(snippetChannelIdRaw.trim())
      ? snippetChannelIdRaw.trim()
      : undefined;

  const snippetChannelTitleRaw = item.snippet?.channelTitle;
  const channelTitle =
    typeof snippetChannelTitleRaw === "string" &&
    snippetChannelTitleRaw.trim() !== ""
      ? snippetChannelTitleRaw.trim()
      : undefined;

  const durationRaw = item.contentDetails?.duration;
  const durationSec =
    typeof durationRaw === "string" && durationRaw.trim() !== ""
      ? parseIso8601DurationToSeconds(durationRaw.trim())
      : undefined;

  let channelCustomUrl: string | undefined;
  if (includeChannel && snippetChannelId && key) {
    const chUrl =
      "https://www.googleapis.com/youtube/v3/channels" +
      `?part=snippet&id=${encodeURIComponent(snippetChannelId)}&key=${encodeURIComponent(key)}`;
    try {
      const chRes = await fetch(chUrl, { cache: "no-store" });
      if (chRes.ok) {
        const chJson = (await chRes.json()) as {
          items?: Array<{ snippet?: { customUrl?: string } }>;
        };
        const cu = chJson.items?.[0]?.snippet?.customUrl;
        if (typeof cu === "string" && cu.trim() !== "") {
          channelCustomUrl = cu.trim().replace(/^@/, "");
        }
      } else {
        let chRaw: unknown = null;
        try {
          chRaw = await chRes.json();
        } catch {
          chRaw = null;
        }
        logYoutubeApiErrorFromParts({
          route: ROUTE,
          endpoint: redactKey(chUrl),
          httpStatus: chRes.status,
          httpStatusText: chRes.statusText,
          rawBody: chRaw,
        });
      }
    } catch {
      /* optional */
    }
  }

  const meta: YouTubeMeta = {
    videoId,
    ...(typeof item.snippet?.title === "string" && item.snippet.title.trim() !== ""
      ? { title: item.snippet.title }
      : {}),
    ...(liveBroadcastContent ? { liveBroadcastContent } : {}),
    isLive,
    streamPhase,
    ...(hasActualStart
      ? { actualStartTime: details!.actualStartTime }
      : {}),
    ...(hasEnded ? { actualEndTime: details!.actualEndTime } : {}),
    ...(typeof details?.scheduledStartTime === "string" &&
    details.scheduledStartTime.trim() !== ""
      ? { scheduledStartTime: details.scheduledStartTime }
      : {}),
    ...(concurrentViewers !== undefined ? { concurrentViewers } : {}),
    ...(activeLiveChatId ? { activeLiveChatId } : {}),
    ...(typeof item.status?.embeddable === "boolean"
      ? { embeddable: item.status.embeddable }
      : {}),
    ...(typeof item.status?.uploadStatus === "string" &&
    item.status.uploadStatus.trim() !== ""
      ? { uploadStatus: item.status.uploadStatus.trim() }
      : {}),
    ...(typeof item.status?.privacyStatus === "string" &&
    item.status.privacyStatus.trim() !== ""
      ? { privacyStatus: item.status.privacyStatus.trim() }
      : {}),
    ...(typeof item.status?.license === "string" && item.status.license.trim() !== ""
      ? { license: item.status.license.trim() }
      : {}),
    ...(typeof item.snippet?.publishedAt === "string" &&
    item.snippet.publishedAt.trim() !== ""
      ? { publishedAt: item.snippet.publishedAt.trim() }
      : {}),
    ...(typeof item.recordingDetails?.recordingDate === "string" &&
    item.recordingDetails.recordingDate.trim() !== ""
      ? { recordingDate: item.recordingDetails.recordingDate.trim() }
      : {}),
    ...(snippetChannelId ? { channelId: snippetChannelId } : {}),
    ...(channelTitle ? { channelTitle } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(channelCustomUrl ? { channelCustomUrl } : {}),
  };

  return NextResponse.json({ ok: true, meta });
}
