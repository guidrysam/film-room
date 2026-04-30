import { NextResponse } from "next/server";

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;
const HANDLE_RE = /^[a-zA-Z0-9._-]{1,100}$/;

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
    if (!chRes.ok) {
      return NextResponse.json(
        { ok: false, error: "Could not resolve @handle to a channel." },
        { status: 404 },
      );
    }
    let chData: ChannelsListResponse;
    try {
      chData = (await chRes.json()) as ChannelsListResponse;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid channel response." },
        { status: 502 },
      );
    }
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
  ): Promise<string | null> {
    const u =
      "https://www.googleapis.com/youtube/v3/search" +
      `?part=id&channelId=${encodeURIComponent(resolvedChannelId)}` +
      `&type=video&eventType=${eventType}&maxResults=1` +
      `&key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) return null;
    let data: SearchListResponse;
    try {
      data = (await r.json()) as SearchListResponse;
    } catch {
      return null;
    }
    const vid = data.items?.[0]?.id?.videoId;
    return typeof vid === "string" && /^[a-zA-Z0-9_-]{11}$/.test(vid)
      ? vid
      : null;
  }

  try {
    let videoId = await searchLive("live");
    let mode: "live" | "upcoming" | null = videoId ? "live" : null;
    if (!videoId) {
      videoId = await searchLive("upcoming");
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
