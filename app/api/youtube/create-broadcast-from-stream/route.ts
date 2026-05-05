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

  type LiveBroadcastInsertResponse = { id?: string };
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

  const videoId = broadcastId;
  const watchUrl = `https://www.youtube.com/watch?v=${broadcastId}`;
  const embedUrl = `https://www.youtube.com/embed/${broadcastId}`;

  return NextResponse.json({
    ok: true,
    broadcastId,
    videoId,
    watchUrl,
    embedUrl,
  });
}
