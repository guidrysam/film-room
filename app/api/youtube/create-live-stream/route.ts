import { NextResponse } from "next/server";

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

function bearerTokenFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h.trim());
  if (!m) return null;
  const token = m[1]?.trim() ?? "";
  return token ? token : null;
}

function ytErrorMessage(
  status: number,
  body: unknown,
): {
  message: string;
  reason?: string;
  statusText?: string;
} {
  const parsed = body as YouTubeApiErrorResponse;
  const first = Array.isArray(parsed?.error?.errors)
    ? parsed.error.errors[0]
    : undefined;
  const reason =
    typeof first?.reason === "string" && first.reason.trim() !== ""
      ? first.reason.trim()
      : typeof parsed?.error?.status === "string" && parsed.error.status.trim() !== ""
        ? parsed.error.status.trim()
        : undefined;
  const msg =
    typeof parsed?.error?.message === "string" && parsed.error.message.trim() !== ""
      ? parsed.error.message.trim()
      : typeof first?.message === "string" && first.message.trim() !== ""
        ? first.message.trim()
        : `YouTube API request failed (HTTP ${status}).`;

  // Friendly mapping for common failure cases.
  if (
    status === 401 ||
    reason === "authError" ||
    reason === "invalidCredentials"
  ) {
    return {
      message: "User not authenticated with Google / YouTube.",
      reason,
    };
  }
  if (status === 403 && reason === "insufficientPermissions") {
    return {
      message:
        "Missing YouTube OAuth scope. Re-authenticate with scope `https://www.googleapis.com/auth/youtube`.",
      reason,
    };
  }
  if (
    status === 403 &&
    (reason === "liveStreamingNotEnabled" ||
      reason === "livePermissionBlocked" ||
      reason === "liveStreamingNotAllowed")
  ) {
    return {
      message:
        "YouTube Live is not enabled or the account is not eligible. Enable live streaming in YouTube Studio and ensure the channel is verified.",
      reason,
    };
  }
  if (
    status === 403 &&
    (reason === "quotaExceeded" || reason === "dailyLimitExceeded")
  ) {
    return {
      message:
        "YouTube API quota exceeded. Try again later or check quota limits in Google Cloud Console.",
      reason,
    };
  }
  return { message: msg, reason };
}

async function ytPostJson<T>(args: {
  url: string;
  token: string;
  body: unknown;
}): Promise<{ ok: true; data: T } | { ok: false; status: number; error: unknown }> {
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
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, data: data as T };
}

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;

async function ytGetJson<T>(args: {
  url: string;
  token: string;
}): Promise<{ ok: true; data: T } | { ok: false; status: number; error: unknown }> {
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
  if (!res.ok) return { ok: false, status: res.status, error: data };
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
    const info = ytErrorMessage(mine.status, mine.error);
    return NextResponse.json(
      { ok: false, error: info.message, reason: info.reason, status: mine.status },
      { status: 502 },
    );
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
      // These flags are supported for many channels; if unsupported YouTube may ignore them.
      enableAutoStart: true,
      enableAutoStop: true,
      latencyPreference: "low",
    },
  };

  type LiveBroadcastInsertResponse = {
    id?: string;
  };
  let broadcastId: string;
  try {
    const b = await ytPostJson<LiveBroadcastInsertResponse>({
      url: broadcastUrl,
      token,
      body: broadcastBody,
    });
    if (!b.ok) {
      const info = ytErrorMessage(b.status, b.error);
      return NextResponse.json(
        { ok: false, error: info.message, reason: info.reason, status: b.status },
        { status: 502 },
      );
    }
    const id = b.data?.id;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "YouTube returned no broadcast id." },
        { status: 502 },
      );
    }
    broadcastId = id.trim();
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
      const info = ytErrorMessage(s.status, s.error);
      return NextResponse.json(
        {
          ok: false,
          error: info.message,
          reason: info.reason,
          status: s.status,
          broadcastId,
        },
        { status: 502 },
      );
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
      const info = ytErrorMessage(bind.status, bind.error);
      return NextResponse.json(
        {
          ok: false,
          error: info.message,
          reason: info.reason,
          status: bind.status,
          broadcastId,
          streamId,
        },
        { status: 502 },
      );
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

  return NextResponse.json({
    ok: true,
    broadcastId,
    streamId,
    videoId: broadcastId,
    watchUrl,
    embedUrl,
    ingestionAddress,
    streamName,
    ...(channelId ? { channelId } : {}),
    ...(channelHandle ? { channelHandle } : {}),
    ...(persistentLiveUrl != null ? { persistentLiveUrl } : {}),
    lastWatchUrl: watchUrl,
  });
}

