import { NextResponse } from "next/server";

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;

type YouTubeMeta = {
  videoId: string;
  title?: string;
  /** From `snippet.liveBroadcastContent`: none | live | upcoming */
  liveBroadcastContent?: string;
  /** True when the video is an active/upcoming broadcast or in-progress live DVR (not a finished VOD archive of a stream). */
  isLive?: boolean;
  actualStartTime?: string;
  scheduledStartTime?: string;
  embeddable?: boolean;
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
      snippet?: { title?: string; liveBroadcastContent?: string };
      liveStreamingDetails?: {
        actualStartTime?: string;
        actualEndTime?: string;
        scheduledStartTime?: string;
      };
      status?: { embeddable?: boolean };
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
  const isLive =
    liveBroadcastContent === "live" ||
    liveBroadcastContent === "upcoming" ||
    (hasActualStart && !hasEnded);

  const meta: YouTubeMeta = {
    videoId,
    ...(typeof item.snippet?.title === "string" && item.snippet.title.trim() !== ""
      ? { title: item.snippet.title }
      : {}),
    ...(liveBroadcastContent ? { liveBroadcastContent } : {}),
    isLive,
    ...(hasActualStart
      ? { actualStartTime: details!.actualStartTime }
      : {}),
    ...(typeof details?.scheduledStartTime === "string" &&
    details.scheduledStartTime.trim() !== ""
      ? { scheduledStartTime: details.scheduledStartTime }
      : {}),
    ...(typeof item.status?.embeddable === "boolean"
      ? { embeddable: item.status.embeddable }
      : {}),
  };

  return NextResponse.json({ ok: true, meta });
}

