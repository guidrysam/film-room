import { NextResponse } from "next/server";

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;

type YouTubeMeta = {
  videoId: string;
  title?: string;
  actualStartTime?: string;
  scheduledStartTime?: string;
  embeddable?: boolean;
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
      { ok: false, error: "Missing server configuration." },
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
    return NextResponse.json(
      { ok: false, error: "YouTube API error." },
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
      snippet?: { title?: string };
      liveStreamingDetails?: {
        actualStartTime?: string;
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

  const meta: YouTubeMeta = {
    videoId,
    ...(typeof item.snippet?.title === "string" && item.snippet.title.trim() !== ""
      ? { title: item.snippet.title }
      : {}),
    ...(typeof item.liveStreamingDetails?.actualStartTime === "string" &&
    item.liveStreamingDetails.actualStartTime.trim() !== ""
      ? { actualStartTime: item.liveStreamingDetails.actualStartTime }
      : {}),
    ...(typeof item.liveStreamingDetails?.scheduledStartTime === "string" &&
    item.liveStreamingDetails.scheduledStartTime.trim() !== ""
      ? { scheduledStartTime: item.liveStreamingDetails.scheduledStartTime }
      : {}),
    ...(typeof item.status?.embeddable === "boolean"
      ? { embeddable: item.status.embeddable }
      : {}),
  };

  return NextResponse.json({ ok: true, meta });
}

