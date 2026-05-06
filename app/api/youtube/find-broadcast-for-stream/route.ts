import { NextResponse } from "next/server";

import { youtubeApiErrorNextResponse } from "@/lib/youtube-api-error-diagnostic";

const ROUTE = "/api/youtube/find-broadcast-for-stream";

function bearerTokenFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h.trim());
  if (!m) return null;
  const token = m[1]?.trim() ?? "";
  return token ? token : null;
}

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
    | {
        ok: false;
        status: number;
        statusText: string;
        error: unknown;
        endpoint: string;
      }
  > {
    const url =
      "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
      `?part=snippet,contentDetails,status&broadcastStatus=${broadcastStatus}` +
      "&mine=true&maxResults=50";
    const r = await ytGetJson<LiveBroadcastListResponse>({ url, token: authToken });
    if (!r.ok)
      return {
        ok: false,
        status: r.status,
        statusText: r.statusText,
        error: r.error,
        endpoint: url,
      };
    return { ok: true, match: pickBoundBroadcast(r.data, streamId) };
  }

  const active = await listByStatus("active");
  if (!active.ok) {
    return youtubeApiErrorNextResponse({
      route: ROUTE,
      endpoint: active.endpoint,
      httpStatus: active.status,
      httpStatusText: active.statusText,
      rawBody: active.error,
    });
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
    return youtubeApiErrorNextResponse({
      route: ROUTE,
      endpoint: upcoming.endpoint,
      httpStatus: upcoming.status,
      httpStatusText: upcoming.statusText,
      rawBody: upcoming.error,
    });
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

