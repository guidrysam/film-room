import { NextResponse } from "next/server";

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;

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
};

type YouTubeApiErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      domain?: string;
      reason?: string;
      message?: string;
      locationType?: string;
      location?: string;
    }>;
    status?: string;
    details?: unknown;
  };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("videoId") ?? "").trim();
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
    `?part=snippet,liveStreamingDetails,status&id=${encodeURIComponent(videoId)}` +
    `&key=${encodeURIComponent(key)}`;

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
    const parsed = raw as YouTubeApiErrorResponse;
    const first = Array.isArray(parsed?.error?.errors)
      ? parsed.error.errors[0]
      : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: "YouTube API error",
        status: res.status,
        details: parsed?.error?.details ?? undefined,
        reason:
          typeof first?.reason === "string" && first.reason.trim() !== ""
            ? first.reason
            : typeof parsed?.error?.status === "string" && parsed.error.status.trim() !== ""
              ? parsed.error.status
              : undefined,
        message:
          typeof parsed?.error?.message === "string" && parsed.error.message.trim() !== ""
            ? parsed.error.message
            : typeof first?.message === "string" && first.message.trim() !== ""
              ? first.message
              : undefined,
      },
      { status: 502 },
    );
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

  const looksLikeActiveBroadcast =
    liveBroadcastContent === "live" ||
    inProgressWindow ||
    hasLiveChatWhileNotEnded ||
    hasPositiveViewersWhileNotEnded;

  let streamPhase: YouTubeStreamPhase;
  if (hasEnded) {
    streamPhase = "ended";
  } else if (looksLikeActiveBroadcast) {
    streamPhase = "active";
  } else if (liveBroadcastContent === "upcoming" || (hasScheduledStart && !hasActualStart)) {
    streamPhase = "upcoming";
  } else {
    streamPhase = "vod";
  }

  const isLive =
    liveBroadcastContent === "live" ||
    liveBroadcastContent === "upcoming" ||
    inProgressWindow ||
    hasLiveChatWhileNotEnded ||
    hasPositiveViewersWhileNotEnded;

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
  };

  return NextResponse.json({ ok: true, meta });
}
