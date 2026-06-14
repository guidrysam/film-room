import { NextResponse } from "next/server";

import {
  youtubeApiErrorNextResponse,
  youtubeErrorReason,
} from "@/lib/youtube-api-error-diagnostic";
import { ensureBroadcastEmbeddable } from "@/lib/youtube-ensure-embeddable";

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

const ROUTE = "/api/youtube/create-live-stream";

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
    title?: unknown;
    description?: unknown;
    privacyStatus?: unknown;
  };
  const title =
    typeof p.title === "string" && p.title.trim() !== ""
      ? p.title.trim()
      : "Practice Stream";
  const description =
    typeof p.description === "string" ? p.description.trim() : "";
  const privacyStatus =
    p.privacyStatus === "private" || p.privacyStatus === "public" || p.privacyStatus === "unlisted"
      ? (p.privacyStatus as "private" | "public" | "unlisted")
      : ("unlisted" as const);

  type ChannelsMineListResponse = {
    items?: Array<{
      id?: string;
      snippet?: { customUrl?: string };
    }>;
  };

  const mineUrl =
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";
  const mine = await ytGetJson<ChannelsMineListResponse>({
    url: mineUrl,
    token,
  });
  if (!mine.ok) {
    return youtubeApiErrorNextResponse({
      route: ROUTE,
      endpoint: mineUrl,
      httpStatus: mine.status,
      httpStatusText: mine.statusText,
      rawBody: mine.error,
    });
  }
  const channel = mine.data?.items?.[0];
  const rawChannelId = typeof channel?.id === "string" ? channel.id.trim() : "";
  const channelId =
    rawChannelId && CHANNEL_ID_RE.test(rawChannelId) ? rawChannelId : undefined;
  const rawCustom = channel?.snippet?.customUrl;
  const channelHandle =
    typeof rawCustom === "string" && rawCustom.trim() !== ""
      ? rawCustom.trim().replace(/^@/, "")
      : undefined;

  const persistentLiveUrl =
    channelId != null
      ? `https://www.youtube.com/channel/${channelId}/live`
      : channelHandle != null
        ? `https://www.youtube.com/@${channelHandle}/live`
        : null;

  // Smallest workable default: schedule immediately.
  const scheduledStartTime = new Date(Date.now() + 60_000).toISOString();

  // 1) liveBroadcasts.insert (creates “event/page”)
  const broadcastUrl =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
    "?part=snippet,status,contentDetails";
  // Make Film Room-created broadcasts embeddable + archived from the start.
  // `recordFromStart` + `enableDvr` give immediate post-broadcast playback.
  // (There is no `enableArchive` field on Data API v3 insert.)
  const baseContentDetails = {
    enableDvr: true,
    recordFromStart: true,
    // These flags are supported for many channels; if unsupported YouTube may ignore them.
    enableAutoStart: true,
    enableAutoStop: true,
    latencyPreference: "low",
  };
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
      ...baseContentDetails,
      enableEmbed: true,
    },
  };

  type LiveBroadcastContentDetails = {
    enableEmbed?: boolean;
    enableDvr?: boolean;
    recordFromStart?: boolean;
  };
  type LiveBroadcastInsertResponse = {
    id?: string;
    contentDetails?: LiveBroadcastContentDetails;
  };
  let broadcastId: string;
  let insertContentDetails: LiveBroadcastContentDetails | undefined;
  let embedRequested = true;
  let embedRejected = false;
  try {
    let b = await ytPostJson<LiveBroadcastInsertResponse>({
      url: broadcastUrl,
      token,
      body: broadcastBody,
    });
    // If YouTube refuses embedding for this channel/broadcast, retry once
    // WITHOUT enableEmbed so the broadcast is still created (non-embeddable
    // fallback). enableEmbed is only set at insert — never updated later.
    if (!b.ok && youtubeErrorReason(b.error) === "invalidEmbedSetting") {
      embedRejected = true;
      embedRequested = false;
      b = await ytPostJson<LiveBroadcastInsertResponse>({
        url: broadcastUrl,
        token,
        body: { ...broadcastBody, contentDetails: baseContentDetails },
      });
    }
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
    insertContentDetails = b.data?.contentDetails;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "YouTube broadcast request failed.",
      },
      { status: 502 },
    );
  }

  // 2) liveStreams.insert (creates RTMP ingest)
  const streamUrl =
    "https://www.googleapis.com/youtube/v3/liveStreams" +
    "?part=snippet,cdn,contentDetails,status";
  const streamBody = {
    snippet: {
      title,
      description,
    },
    cdn: {
      ingestionType: "rtmp",
      resolution: "1080p",
      frameRate: "30fps",
    },
    contentDetails: {
      /** Same RTMP ingest can be bound to new broadcasts each session. */
      isReusable: true,
    },
  };

  type LiveStreamInsertResponse = {
    id?: string;
    cdn?: {
      ingestionInfo?: {
        ingestionAddress?: string;
        streamName?: string;
      };
    };
  };
  let streamId: string;
  let ingestionAddress = "";
  let streamName = "";
  try {
    const s = await ytPostJson<LiveStreamInsertResponse>({
      url: streamUrl,
      token,
      body: streamBody,
    });
    if (!s.ok) {
      return youtubeApiErrorNextResponse({
        route: ROUTE,
        endpoint: streamUrl,
        httpStatus: s.status,
        httpStatusText: s.statusText,
        rawBody: s.error,
        extra: { broadcastId },
      });
    }
    const id = s.data?.id;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "YouTube returned no stream id.", broadcastId },
        { status: 502 },
      );
    }
    streamId = id.trim();
    const addr = s.data?.cdn?.ingestionInfo?.ingestionAddress;
    const name = s.data?.cdn?.ingestionInfo?.streamName;
    ingestionAddress = typeof addr === "string" ? addr.trim() : "";
    streamName = typeof name === "string" ? name.trim() : "";
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "YouTube stream request failed.",
        broadcastId,
      },
      { status: 502 },
    );
  }

  // 3) liveBroadcasts.bind (connects ingest → watch page)
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

  const watchUrl = `https://www.youtube.com/watch?v=${broadcastId}`;
  const embedUrl = `https://www.youtube.com/embed/${broadcastId}`;

  // Verification + repair: ensure enableEmbed is on while still pre-live.
  const embedResult = await ensureBroadcastEmbeddable(token, broadcastId);
  if (embedResult.embedRejected) embedRejected = true;

  const embeddable =
    embedResult.embeddable !== null
      ? embedResult.embeddable
      : embedRejected
        ? false
        : typeof insertContentDetails?.enableEmbed === "boolean"
          ? insertContentDetails.enableEmbed
          : undefined;
  const dvr =
    typeof insertContentDetails?.enableDvr === "boolean"
      ? insertContentDetails.enableDvr
      : undefined;
  const archive =
    typeof insertContentDetails?.recordFromStart === "boolean"
      ? insertContentDetails.recordFromStart
      : undefined;

  return NextResponse.json({
    ok: true,
    broadcastId,
    streamId,
    videoId: broadcastId,
    watchUrl,
    embedUrl,
    embeddable,
    dvr,
    archive,
    embedRequested,
    embedRejected,
    embedRepairReason: embedResult.reason,
    embedRepairLifeCycleStatus: embedResult.lifeCycleStatus,
    ingestionAddress,
    streamName,
    ...(channelId ? { channelId } : {}),
    ...(channelHandle ? { channelHandle } : {}),
    ...(persistentLiveUrl != null ? { persistentLiveUrl } : {}),
    lastWatchUrl: watchUrl,
  });
}

