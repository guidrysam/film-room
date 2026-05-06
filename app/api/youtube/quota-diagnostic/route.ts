import { NextResponse } from "next/server";

import { youtubeApiErrorNextResponseFromFetch } from "@/lib/youtube-api-error-diagnostic";

/** Known public video — `videos.list` with `part=id` is a minimal quota cost. */
const SAMPLE_VIDEO_ID = "dQw4w9WgXcQ";

const ROUTE = "/api/youtube/quota-diagnostic";

export async function GET() {
  const key = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        route: ROUTE,
        message: "YOUTUBE_DATA_API_KEY is not configured.",
      },
      { status: 500 },
    );
  }

  const endpointDisplay =
    "https://www.googleapis.com/youtube/v3/videos" +
    `?part=id&id=${encodeURIComponent(SAMPLE_VIDEO_ID)}&key=<redacted>`;

  const url =
    "https://www.googleapis.com/youtube/v3/videos" +
    `?part=id&id=${encodeURIComponent(SAMPLE_VIDEO_ID)}&key=${encodeURIComponent(key)}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        route: ROUTE,
        endpoint: endpointDisplay,
        message: err instanceof Error ? err.message : "Fetch failed.",
      },
      { status: 502 },
    );
  }

  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    raw = null;
  }

  if (!res.ok) {
    return youtubeApiErrorNextResponseFromFetch({
      route: ROUTE,
      endpoint: endpointDisplay,
      res,
      rawBody: raw,
    });
  }

  return NextResponse.json({
    ok: true,
    route: ROUTE,
    endpoint: endpointDisplay,
    status: res.status,
    videoId: SAMPLE_VIDEO_ID,
    rawResponse: raw,
  });
}
