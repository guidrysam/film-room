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

/**
 * Daily-use "live now": bound to this stream AND lifecycle indicates the broadcast is live.
 * YouTube uses lifeCycleStatus `live` / `liveStarting` for an actual live signal.
 * We do not treat `ready` / `testing` / `created` as live even if listed under broadcastStatus=active.
 */
function isAcceptableLiveBroadcast(lifeCycleStatus: string): boolean {
  const s = lifeCycleStatus.trim().toLowerCase();
  /** `live` / `liveStarting`: streaming; `active` included per API variance */
  return s === "live" || s === "livestarting" || s === "active";
}

function countBoundToStream(
  list: LiveBroadcastListResponse,
  streamId: string,
): number {
  const items = Array.isArray(list.items) ? list.items : [];
  let n = 0;
  for (const it of items) {
    const bound =
      typeof it.contentDetails?.boundStreamId === "string"
        ? it.contentDetails.boundStreamId.trim()
        : "";
    if (bound === streamId) n += 1;
  }
  return n;
}

function pickLiveBoundBroadcast(
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
    if (!isAcceptableLiveBroadcast(lifeCycleStatus)) continue;
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
    | { ok: true; data: LiveBroadcastListResponse }
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
    return { ok: true, data: r.data };
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

  const foundActiveBoundCount = countBoundToStream(active.data, streamId);
  const foundUpcomingBoundCount = countBoundToStream(upcoming.data, streamId);
  const liveMatch = pickLiveBoundBroadcast(active.data, streamId);

  if (liveMatch) {
    const { broadcastId, boundStreamId, lifeCycleStatus } = liveMatch;
    return NextResponse.json({
      ok: true,
      noCreateAttempted: true,
      foundActiveBoundCount,
      foundUpcomingBoundCount,
      foundAcceptableLive: true,
      foundOnlyUpcomingBound: false,
      broadcastId,
      videoId: broadcastId,
      watchUrl: `https://youtube.com/live/${broadcastId}`,
      standardWatchUrl: `https://www.youtube.com/watch?v=${broadcastId}`,
      broadcastStatusFilter: "active",
      lifeCycleStatus,
      boundStreamId,
      selectedBroadcastId: broadcastId,
      selectedVideoId: broadcastId,
    });
  }

  return NextResponse.json({
    ok: true,
    noCreateAttempted: true,
    foundActiveBoundCount,
    foundUpcomingBoundCount,
    foundAcceptableLive: false,
    foundOnlyUpcomingBound: foundUpcomingBoundCount > 0,
    selectedBroadcastId: null,
    selectedVideoId: null,
  });
}
