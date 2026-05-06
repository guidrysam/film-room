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

function normLifeCycle(ls: string): string {
  return ls.trim().toLowerCase();
}

/** Locally filtered states we consider (no broadcastStatus API param). */
const FILTER_LIFECYCLES = new Set(["live", "livestarting", "ready", "testing"]);

/**
 * Selection priority (lower = preferred): live > liveStarting > testing > ready
 */
function selectionPriorityRank(lifeCycleStatus: string): number | null {
  const s = normLifeCycle(lifeCycleStatus);
  if (!FILTER_LIFECYCLES.has(s)) return null;
  if (s === "live") return 0;
  if (s === "livestarting") return 1;
  if (s === "testing") return 2;
  if (s === "ready") return 3;
  return null;
}

type BoundRow = {
  broadcastId: string;
  boundStreamId: string;
  lifeCycleStatus: string;
};

function collectBoundRows(
  data: LiveBroadcastListResponse,
  streamId: string,
): BoundRow[] {
  const items = Array.isArray(data.items) ? data.items : [];
  const out: BoundRow[] = [];
  for (const it of items) {
    const boundRaw = it.contentDetails?.boundStreamId;
    const bound =
      typeof boundRaw === "string" ? boundRaw.trim() : "";
    if (!bound || bound !== streamId) continue;
    const idRaw = it.id;
    const broadcastId = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!broadcastId) continue;
    const lsRaw = it.status?.lifeCycleStatus;
    const lifeCycleStatus = typeof lsRaw === "string" ? lsRaw.trim() : "";
    if (!lifeCycleStatus || selectionPriorityRank(lifeCycleStatus) === null) continue;
    out.push({ broadcastId, boundStreamId: bound, lifeCycleStatus });
  }
  return out;
}

function partitionActiveUpcoming(rows: BoundRow[]): {
  activeBoundBroadcasts: BoundRow[];
  upcomingBoundBroadcasts: BoundRow[];
} {
  const active: BoundRow[] = [];
  const upcoming: BoundRow[] = [];
  for (const r of rows) {
    const n = normLifeCycle(r.lifeCycleStatus);
    if (n === "live" || n === "livestarting") {
      active.push(r);
    } else if (n === "ready" || n === "testing") {
      upcoming.push(r);
    }
  }
  return {
    activeBoundBroadcasts: active,
    upcomingBoundBroadcasts: upcoming,
  };
}

function pickPreferredBroadcast(rows: BoundRow[]): BoundRow | null {
  if (rows.length === 0) return null;
  let best = rows[0]!;
  let bestRank = selectionPriorityRank(best.lifeCycleStatus) ?? 999;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const rank = selectionPriorityRank(r.lifeCycleStatus) ?? 999;
    if (rank < bestRank) {
      best = r;
      bestRank = rank;
    }
  }
  return best;
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

  /** Do not use broadcastStatus — it is incompatible with mine=true per YouTube API. */
  const listUrl =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
    "?part=snippet,contentDetails,status&mine=true&maxResults=50";

  const listed = await ytGetJson<LiveBroadcastListResponse>({
    url: listUrl,
    token: authToken,
  });
  if (!listed.ok) {
    return youtubeApiErrorNextResponse({
      route: ROUTE,
      endpoint: listUrl,
      httpStatus: listed.status,
      httpStatusText: listed.statusText,
      rawBody: listed.error,
    });
  }

  const relevantRows = collectBoundRows(listed.data, streamId);
  const { activeBoundBroadcasts, upcomingBoundBroadcasts } =
    partitionActiveUpcoming(relevantRows);

  const foundActiveBoundCount = activeBoundBroadcasts.length;
  const foundUpcomingBoundCount = upcomingBoundBroadcasts.length;

  const preferred = pickPreferredBroadcast(relevantRows);

  if (!preferred) {
    return NextResponse.json({
      ok: true,
      noCreateAttempted: true,
      foundActiveBoundCount,
      foundUpcomingBoundCount,
      foundAcceptableLive: false,
      foundOnlyUpcomingBound: false,
      selectedBroadcastId: null,
      selectedVideoId: null,
    });
  }

  const n = normLifeCycle(preferred.lifeCycleStatus);
  const isLiveOrStarting = n === "live" || n === "livestarting";

  if (isLiveOrStarting) {
    const { broadcastId, boundStreamId, lifeCycleStatus } = preferred;
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
    foundOnlyUpcomingBound: true,
    selectedBroadcastId: null,
    selectedVideoId: null,
  });
}
