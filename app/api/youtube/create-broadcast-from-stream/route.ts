import { NextResponse } from "next/server";

import { youtubeApiErrorNextResponse } from "@/lib/youtube-api-error-diagnostic";

const ROUTE = "/api/youtube/create-broadcast-from-stream";

function bearerTokenFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h.trim());
  if (!m) return null;
  const token = m[1]?.trim() ?? "";
  return token ? token : null;
}

async function ytPostJson<T>(args: {
  url: string;
  token: string;
  body: unknown;
}): Promise<
  | { ok: true; data: T }
  | { ok: false; status: number; statusText: string; error: unknown }
> {
  const { url, token, body } = args;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok)
    return { ok: false, status: res.status, statusText: res.statusText, error: data };
  return { ok: true, data: data as T };
}

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;

async function ytGetJson<T>(args: {
  url: string;
  token: string;
}): Promise<
  | { ok: true; data: T }
  | { ok: false; status: number; statusText: string; error: unknown }
> {
  const res = await fetch(args.url, {
    headers: { Authorization: `Bearer ${args.token}` },
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok)
    return { ok: false, status: res.status, statusText: res.statusText, error: data };
  return { ok: true, data: data as T };
}

export async function POST(request: Request) {
  const token = bearerTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "User not authenticated. Missing Google OAuth access token (Authorization: Bearer ...).",
      },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }
  const p = (payload ?? {}) as {
    streamId?: unknown;
    title?: unknown;
    description?: unknown;
    privacyStatus?: unknown;
  };
  const streamIdRaw = typeof p.streamId === "string" ? p.streamId.trim() : "";
  if (!streamIdRaw) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid streamId." },
      { status: 400 },
    );
  }
  const streamId = streamIdRaw;

  const title =
    typeof p.title === "string" && p.title.trim() !== ""
      ? p.title.trim()
      : "Practice Session";
  const description =
    typeof p.description === "string" ? p.description.trim() : "";
  const privacyStatus =
    p.privacyStatus === "private" ||
    p.privacyStatus === "public" ||
    p.privacyStatus === "unlisted"
      ? (p.privacyStatus as "private" | "public" | "unlisted")
      : ("unlisted" as const);

  const scheduledStartTime = new Date(Date.now() + 60_000).toISOString();

  const broadcastUrl =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
    "?part=snippet,status,contentDetails";
  const broadcastBody = {
    snippet: {
      title,
      description,
      scheduledStartTime,
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
    contentDetails: {
      enableDvr: true,
      latencyPreference: "low",
    },
  };

  type LiveBroadcastInsertResponse = {
    id?: string;
    snippet?: { channelId?: string };
  };
  let broadcastId: string;
  let insertSnippetChannelId: string | undefined;
  try {
    const b = await ytPostJson<LiveBroadcastInsertResponse>({
      url: broadcastUrl,
      token,
      body: broadcastBody,
    });
    if (!b.ok) {
      return youtubeApiErrorNextResponse({
        route: ROUTE,
        endpoint: broadcastUrl,
        httpStatus: b.status,
        httpStatusText: b.statusText,
        rawBody: b.error,
      });
    }
    const id = b.data?.id;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "YouTube returned no broadcast id." },
        { status: 502 },
      );
    }
    broadcastId = id.trim();
    const chRaw = b.data?.snippet?.channelId;
    if (typeof chRaw === "string" && CHANNEL_ID_RE.test(chRaw.trim())) {
      insertSnippetChannelId = chRaw.trim();
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "YouTube broadcast request failed.",
      },
      { status: 502 },
    );
  }

  const bindUrl =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts/bind" +
    `?part=id,contentDetails&id=${encodeURIComponent(broadcastId)}` +
    `&streamId=${encodeURIComponent(streamId)}`;
  try {
    const bind = await ytPostJson<{ id?: string }>({
      url: bindUrl,
      token,
      body: {},
    });
    if (!bind.ok) {
      return youtubeApiErrorNextResponse({
        route: ROUTE,
        endpoint: bindUrl,
        httpStatus: bind.status,
        httpStatusText: bind.statusText,
        rawBody: bind.error,
        extra: { broadcastId, streamId },
      });
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "YouTube bind request failed.",
        broadcastId,
        streamId,
      },
      { status: 502 },
    );
  }

  type BroadcastGetResponse = {
    items?: Array<{
      contentDetails?: { boundStreamId?: string };
      status?: { privacyStatus?: string };
      snippet?: { channelId?: string };
    }>;
  };

  const broadcastGetUrl =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
    `?part=contentDetails,status,snippet&id=${encodeURIComponent(broadcastId)}`;

  const broadcastGet = await ytGetJson<BroadcastGetResponse>({
    url: broadcastGetUrl,
    token,
  });
  if (!broadcastGet.ok) {
    return youtubeApiErrorNextResponse({
      route: ROUTE,
      endpoint: broadcastGetUrl,
      httpStatus: broadcastGet.status,
      httpStatusText: broadcastGet.statusText,
      rawBody: broadcastGet.error,
      extra: { broadcastId, requestedStreamId: streamId },
    });
  }

  const boundStreamIdRaw =
    broadcastGet.data?.items?.[0]?.contentDetails?.boundStreamId;
  const boundStreamId =
    typeof boundStreamIdRaw === "string" ? boundStreamIdRaw.trim() : "";
  const boundMatchesRequested =
    boundStreamId !== "" && boundStreamId === streamId;

  if (!boundMatchesRequested) {
    return NextResponse.json(
      {
        ok: false,
        error: "Broadcast was not bound to requested reusable stream",
        requestedStreamId: streamId,
        boundStreamId: boundStreamId || undefined,
        broadcastId,
      },
      { status: 502 },
    );
  }

  type LiveStreamsListResponse = {
    items?: Array<{
      id?: string;
      snippet?: { title?: string };
      cdn?: {
        ingestionInfo?: {
          ingestionAddress?: string;
          streamName?: string;
        };
      };
      status?: {
        streamStatus?: string;
        lifeCycleStatus?: string;
      };
    }>;
  };

  const liveStreamsUrl =
    "https://www.googleapis.com/youtube/v3/liveStreams" +
    `?part=cdn,status,snippet&id=${encodeURIComponent(streamId)}`;

  const ls = await ytGetJson<LiveStreamsListResponse>({
    url: liveStreamsUrl,
    token,
  });
  if (!ls.ok) {
    return youtubeApiErrorNextResponse({
      route: ROUTE,
      endpoint: liveStreamsUrl,
      httpStatus: ls.status,
      httpStatusText: ls.statusText,
      rawBody: ls.error,
      extra: { broadcastId, requestedStreamId: streamId },
    });
  }

  const streamItem = ls.data?.items?.[0];
  if (!streamItem?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Reusable stream not found. Recreate camera preset.",
        broadcastId,
        requestedStreamId: streamId,
      },
      { status: 502 },
    );
  }

  const addr = streamItem.cdn?.ingestionInfo?.ingestionAddress;
  const streamKey = streamItem.cdn?.ingestionInfo?.streamName;
  const ingestionAddress = typeof addr === "string" ? addr.trim() : "";
  const streamName = typeof streamKey === "string" ? streamKey.trim() : "";

  if (!ingestionAddress || !streamName) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Reusable stream is missing RTMP ingest info. Recreate camera preset.",
        broadcastId,
        requestedStreamId: streamId,
      },
      { status: 502 },
    );
  }

  const streamTitle =
    typeof streamItem.snippet?.title === "string"
      ? streamItem.snippet.title.trim()
      : "";
  const streamStatus =
    (typeof streamItem.status?.streamStatus === "string"
      ? streamItem.status.streamStatus.trim()
      : "") ||
    (typeof streamItem.status?.lifeCycleStatus === "string"
      ? streamItem.status.lifeCycleStatus.trim()
      : "") ||
    "";

  const videoId = broadcastId;
  const watchUrl = `https://www.youtube.com/watch?v=${broadcastId}`;
  const embedUrl = `https://www.youtube.com/embed/${broadcastId}`;

  let channelId = insertSnippetChannelId;
  if (!channelId) {
    const list = await ytGetJson<{
      items?: Array<{ snippet?: { channelId?: string } }>;
    }>({
      url:
        "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
        `?part=snippet&id=${encodeURIComponent(broadcastId)}`,
      token,
    });
    if (list.ok) {
      const raw = list.data?.items?.[0]?.snippet?.channelId;
      if (typeof raw === "string" && CHANNEL_ID_RE.test(raw.trim())) {
        channelId = raw.trim();
      }
    }
  }

  let channelHandle: string | undefined;
  if (channelId) {
    const ch = await ytGetJson<{
      items?: Array<{ snippet?: { customUrl?: string } }>;
    }>({
      url:
        "https://www.googleapis.com/youtube/v3/channels" +
        `?part=snippet&id=${encodeURIComponent(channelId)}`,
      token,
    });
    if (ch.ok) {
      const cu = ch.data?.items?.[0]?.snippet?.customUrl;
      if (typeof cu === "string" && cu.trim() !== "") {
        channelHandle = cu.trim().replace(/^@/, "");
      }
    }
  }

  let persistentLiveUrl: string | undefined;
  if (channelId) {
    persistentLiveUrl = `https://www.youtube.com/channel/${channelId}/live`;
  } else if (channelHandle) {
    persistentLiveUrl = `https://www.youtube.com/@${channelHandle}/live`;
  }

  return NextResponse.json({
    ok: true,
    broadcastId,
    videoId,
    watchUrl,
    embedUrl,
    streamId,
    boundStreamId,
    boundMatchesRequested,
    ingestionAddress,
    streamName,
    streamTitle,
    streamStatus,
    lastWatchUrl: watchUrl,
    ...(channelId ? { channelId } : {}),
    ...(channelHandle ? { channelHandle } : {}),
    ...(persistentLiveUrl ? { persistentLiveUrl } : {}),
  });
}
