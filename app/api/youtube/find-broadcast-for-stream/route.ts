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
  return { message: msg, reason };
}

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

const STREAM_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

type LiveBroadcastListResponse = {
  items?: Array<{
    id?: string;
    snippet?: { title?: string };
    status?: { lifeCycleStatus?: string };
    contentDetails?: { boundStreamId?: string };
  }>;
};

function pickBoundBroadcast(
  list: LiveBroadcastListResponse,
  streamId: string,
): { broadcastId: string; boundStreamId: string; lifeCycleStatus: string } | null {
  const items = Array.isArray(list.items) ? list.items : [];
  for (const it of items) {
    const boundStreamIdRaw = it.contentDetails?.boundStreamId;
    const boundStreamId =
      typeof boundStreamIdRaw === "string" ? boundStreamIdRaw.trim() : "";
    if (!boundStreamId || boundStreamId !== streamId) continue;
    const idRaw = it.id;
    const broadcastId = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!broadcastId) continue;
    const lsRaw = it.status?.lifeCycleStatus;
    const lifeCycleStatus = typeof lsRaw === "string" ? lsRaw.trim() : "";
    return { broadcastId, boundStreamId, lifeCycleStatus };
  }
  return null;
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
  const authToken: string = token;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }
  const p = (payload ?? {}) as { streamId?: unknown };
  const streamIdRaw = typeof p.streamId === "string" ? p.streamId.trim() : "";
  if (!streamIdRaw || !STREAM_ID_RE.test(streamIdRaw)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid streamId." },
      { status: 400 },
    );
  }
  const streamId = streamIdRaw;

  async function listByStatus(
    broadcastStatus: "active" | "upcoming",
  ): Promise<
    | { ok: true; match: { broadcastId: string; boundStreamId: string; lifeCycleStatus: string } }
    | { ok: true; match: null }
    | { ok: false; status: number; error: unknown }
  > {
    const url =
      "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
      `?part=snippet,contentDetails,status&broadcastStatus=${broadcastStatus}` +
      "&mine=true&maxResults=50";
    const r = await ytGetJson<LiveBroadcastListResponse>({ url, token: authToken });
    if (!r.ok) return r;
    return { ok: true, match: pickBoundBroadcast(r.data, streamId) };
  }

  const active = await listByStatus("active");
  if (!active.ok) {
    const info = ytErrorMessage(active.status, active.error);
    return NextResponse.json(
      { ok: false, error: info.message, reason: info.reason, status: active.status },
      { status: 502 },
    );
  }
  if (active.match) {
    const { broadcastId, boundStreamId, lifeCycleStatus } = active.match;
    return NextResponse.json({
      ok: true,
      found: true,
      broadcastId,
      videoId: broadcastId,
      watchUrl: `https://youtube.com/live/${broadcastId}`,
      standardWatchUrl: `https://www.youtube.com/watch?v=${broadcastId}`,
      status: "active",
      lifeCycleStatus,
      boundStreamId,
    });
  }

  const upcoming = await listByStatus("upcoming");
  if (!upcoming.ok) {
    const info = ytErrorMessage(upcoming.status, upcoming.error);
    return NextResponse.json(
      { ok: false, error: info.message, reason: info.reason, status: upcoming.status },
      { status: 502 },
    );
  }
  if (upcoming.match) {
    const { broadcastId, boundStreamId, lifeCycleStatus } = upcoming.match;
    return NextResponse.json({
      ok: true,
      found: true,
      broadcastId,
      videoId: broadcastId,
      watchUrl: `https://youtube.com/live/${broadcastId}`,
      standardWatchUrl: `https://www.youtube.com/watch?v=${broadcastId}`,
      status: "upcoming",
      lifeCycleStatus,
      boundStreamId,
    });
  }

  return NextResponse.json({ ok: true, found: false });
}

