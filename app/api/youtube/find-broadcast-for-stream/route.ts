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
    snippet?: {
      title?: string;
      scheduledStartTime?: string;
      actualStartTime?: string;
      actualEndTime?: string;
    };
    status?: { lifeCycleStatus?: string; privacyStatus?: string };
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
  title: string;
  privacyStatus: string;
  actualStartTime: string | null;
  scheduledStartTime: string | null;
  actualEndTime: string | null;
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
    const titleRaw = it.snippet?.title;
    const title =
      typeof titleRaw === "string" && titleRaw.trim() !== "" ? titleRaw.trim() : "";
    const privacyRaw = it.status?.privacyStatus;
    const privacyStatus =
      typeof privacyRaw === "string" && privacyRaw.trim() !== ""
        ? privacyRaw.trim()
        : "";
    const actualStartRaw = it.snippet?.actualStartTime;
    const actualStartTime =
      typeof actualStartRaw === "string" && actualStartRaw.trim() !== ""
        ? actualStartRaw.trim()
        : null;
    const scheduledStartRaw = it.snippet?.scheduledStartTime;
    const scheduledStartTime =
      typeof scheduledStartRaw === "string" && scheduledStartRaw.trim() !== ""
        ? scheduledStartRaw.trim()
        : null;
    const actualEndRaw = it.snippet?.actualEndTime;
    const actualEndTime =
      typeof actualEndRaw === "string" && actualEndRaw.trim() !== ""
        ? actualEndRaw.trim()
        : null;

    out.push({
      broadcastId,
      boundStreamId: bound,
      lifeCycleStatus,
      title,
      privacyStatus,
      actualStartTime,
      scheduledStartTime,
      actualEndTime,
    });
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

function toMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function pickPreferredBroadcast(rows: BoundRow[]): BoundRow | null {
  // Reject ended broadcasts entirely.
  const eligible = rows.filter((r) => !r.actualEndTime);
  if (eligible.length === 0) return null;

  // A) Prefer: lifeCycleStatus === live AND actualStartTime exists AND actualEndTime missing.
  const liveStrict = eligible.filter((r) => {
    const n = normLifeCycle(r.lifeCycleStatus);
    return n === "live" && r.actualStartTime != null;
  });
  if (liveStrict.length > 0) {
    liveStrict.sort(
      (a, b) => (toMs(b.actualStartTime) ?? 0) - (toMs(a.actualStartTime) ?? 0),
    );
    return liveStrict[0]!;
  }

  // B/C/D) Fall back by lifecycle priority; break ties by most recent start time (actual or scheduled).
  const tieMs = (r: BoundRow) =>
    toMs(r.actualStartTime) ?? toMs(r.scheduledStartTime) ?? 0;
  const sorted = [...eligible].sort((a, b) => {
    const ra = selectionPriorityRank(a.lifeCycleStatus) ?? 999;
    const rb = selectionPriorityRank(b.lifeCycleStatus) ?? 999;
    if (ra !== rb) return ra - rb;
    return tieMs(b) - tieMs(a);
  });
  return sorted[0] ?? null;
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
  const boundCandidates = relevantRows.map((r) => ({
    id: r.broadcastId,
    title: r.title,
    lifeCycleStatus: r.lifeCycleStatus,
    privacyStatus: r.privacyStatus,
    actualStartTime: r.actualStartTime,
    scheduledStartTime: r.scheduledStartTime,
    actualEndTime: r.actualEndTime,
    boundStreamId: r.boundStreamId,
  }));

  if (!preferred) {
    return NextResponse.json({
      ok: true,
      found: false,
      noCreateAttempted: true,
      foundActiveBoundCount,
      foundUpcomingBoundCount,
      foundAcceptableLive: false,
      foundOnlyUpcomingBound: false,
      selectedBroadcastId: null,
      selectedVideoId: null,
      boundCandidates,
    });
  }

  const n = normLifeCycle(preferred.lifeCycleStatus);
  const isLiveOrStarting = n === "live" || n === "livestarting";

  if (isLiveOrStarting) {
    const { broadcastId, boundStreamId, lifeCycleStatus } = preferred;
    return NextResponse.json({
      ok: true,
      found: true,
      noCreateAttempted: true,
      foundActiveBoundCount,
      foundUpcomingBoundCount,
      foundAcceptableLive: true,
      foundOnlyUpcomingBound: false,
      broadcastId,
      videoId: broadcastId,
      watchUrl: `https://youtube.com/live/${broadcastId}`,
      standardWatchUrl: `https://www.youtube.com/watch?v=${broadcastId}`,
      selectedBroadcastId: broadcastId,
      selectedVideoId: broadcastId,
      selectedLifeCycleStatus: lifeCycleStatus,
      selectedActualStartTime: preferred.actualStartTime,
      lifeCycleStatus,
      boundStreamId,
      boundCandidates,
    });
  }

  return NextResponse.json({
    ok: true,
    found: false,
    noCreateAttempted: true,
    foundActiveBoundCount,
    foundUpcomingBoundCount,
    foundAcceptableLive: false,
    foundOnlyUpcomingBound: true,
    selectedBroadcastId: null,
    selectedVideoId: null,
    boundCandidates,
  });
}
