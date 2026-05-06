import { NextResponse } from "next/server";

import { youtubeApiErrorNextResponseFromFetch } from "@/lib/youtube-api-error-diagnostic";

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;
const HANDLE_RE = /^[a-zA-Z0-9._-]{1,100}$/;
const ROUTE = "/api/youtube-resolve-live";

type SearchListResponse = {
  items?: Array<{ id?: { videoId?: string } }>;
};

type ChannelsListResponse = {
  items?: Array<{ id?: string }>;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channelIdParam = (searchParams.get("channelId") ?? "").trim();
  const handleParam = (searchParams.get("handle") ?? "").trim();

  const envKey = process.env.YOUTUBE_DATA_API_KEY;
  if (typeof envKey !== "string" || !envKey.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing YOUTUBE_DATA_API_KEY server configuration" },
      { status: 500 },
    );
  }
  const apiKey = envKey.trim();
  const redactKey = (u: string) => u.replace(apiKey, "<redacted>");

  let channelId = channelIdParam;
  if (handleParam) {
    if (!HANDLE_RE.test(handleParam)) {
      return NextResponse.json(
        { ok: false, error: "Invalid handle." },
        { status: 400 },
      );
    }
    const chUrl =
      "https://www.googleapis.com/youtube/v3/channels" +
      `?part=id&forHandle=${encodeURIComponent(handleParam)}&key=${encodeURIComponent(apiKey)}`;
    let chRes: Response;
    try {
      chRes = await fetch(chUrl, { cache: "no-store" });
    } catch {
      return NextResponse.json(
        { ok: false, error: "YouTube channel request failed." },
        { status: 502 },
      );
    }
    let chBody: unknown = null;
    try {
      chBody = await chRes.json();
    } catch {
      chBody = null;
    }
    if (!chRes.ok) {
      return youtubeApiErrorNextResponseFromFetch({
        route: ROUTE,
        endpoint: redactKey(chUrl),
        res: chRes,
        rawBody: chBody,
      });
    }
    const chData = chBody as ChannelsListResponse;
    const cid = chData.items?.[0]?.id;
    if (typeof cid !== "string" || !CHANNEL_ID_RE.test(cid)) {
      return NextResponse.json(
        { ok: false, error: "Channel not found for this handle." },
        { status: 404 },
      );
    }
    channelId = cid;
  }

  if (!channelId || !CHANNEL_ID_RE.test(channelId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing channelId." },
      { status: 400 },
    );
  }
  const resolvedChannelId = channelId;

  async function searchLive(
    eventType: "live" | "upcoming",
  ): Promise<
    | { ok: true; videoId: string | null }
    | { ok: false; res: Response; rawBody: unknown; endpoint: string }
  > {
    const u =
      "https://www.googleapis.com/youtube/v3/search" +
      `?part=id&channelId=${encodeURIComponent(resolvedChannelId)}` +
      `&type=video&eventType=${eventType}&maxResults=1` +
      `&key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(u, { cache: "no-store" });
    let data: unknown = null;
    try {
      data = await r.json();
    } catch {
      data = null;
    }
    if (!r.ok) {
      return { ok: false, res: r, rawBody: data, endpoint: redactKey(u) };
    }
    const parsed = data as SearchListResponse;
    const vid = parsed.items?.[0]?.id?.videoId;
    const videoId =
      typeof vid === "string" && /^[a-zA-Z0-9_-]{11}$/.test(vid) ? vid : null;
    return { ok: true, videoId };
  }

  try {
    const live = await searchLive("live");
    if (!live.ok) {
      return youtubeApiErrorNextResponseFromFetch({
        route: ROUTE,
        endpoint: live.endpoint,
        res: live.res,
        rawBody: live.rawBody,
      });
    }
    let videoId = live.videoId;
    let mode: "live" | "upcoming" | null = videoId ? "live" : null;
    if (!videoId) {
      const upcoming = await searchLive("upcoming");
      if (!upcoming.ok) {
        return youtubeApiErrorNextResponseFromFetch({
          route: ROUTE,
          endpoint: upcoming.endpoint,
          res: upcoming.res,
          rawBody: upcoming.rawBody,
        });
      }
      videoId = upcoming.videoId;
      mode = videoId ? "upcoming" : null;
    }
    if (!videoId) {
      return NextResponse.json({
        ok: true,
        videoId: null,
        channelId: resolvedChannelId,
        mode: "idle",
        message:
          "No active or upcoming broadcast for this channel. The /live URL is still valid — start the stream, then refresh.",
      });
    }
    return NextResponse.json({
      ok: true,
      videoId,
      channelId: resolvedChannelId,
      mode,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "YouTube search failed." },
      { status: 502 },
    );
  }
}
