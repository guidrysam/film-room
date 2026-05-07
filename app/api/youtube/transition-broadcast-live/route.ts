import { NextResponse } from "next/server";

import { youtubeApiErrorNextResponseFromFetch } from "@/lib/youtube-api-error-diagnostic";

const ROUTE = "/api/youtube/transition-broadcast-live";

function bearerTokenFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h.trim());
  if (!m) return null;
  const token = m[1]?.trim() ?? "";
  return token ? token : null;
}

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

type LiveStreamsListResponse = {
  items?: Array<{
    id?: string;
    status?: {
      streamStatus?: string;
      healthStatus?: { status?: string };
    };
    snippet?: { title?: string };
    cdn?: { ingestionInfo?: { ingestionAddress?: string; streamName?: string } };
  }>;
};

type BroadcastTransitionResponse = {
  status?: { lifeCycleStatus?: string };
};

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

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }
  const p = (payload ?? {}) as { broadcastId?: unknown; streamId?: unknown };
  const broadcastId =
    typeof p.broadcastId === "string" ? p.broadcastId.trim() : "";
  const streamId = typeof p.streamId === "string" ? p.streamId.trim() : "";

  if (!broadcastId || !ID_RE.test(broadcastId)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid broadcastId." },
      { status: 400 },
    );
  }
  if (!streamId || !ID_RE.test(streamId)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid streamId." },
      { status: 400 },
    );
  }

  // 1) liveStreams.list (status + health)
  const streamsUrl =
    "https://www.googleapis.com/youtube/v3/liveStreams" +
    `?part=status,cdn,snippet&id=${encodeURIComponent(streamId)}`;

  let streamsRes: Response;
  try {
    streamsRes = await fetch(streamsUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        route: ROUTE,
        endpoint: streamsUrl,
        message: err instanceof Error ? err.message : "Fetch failed.",
      },
      { status: 502 },
    );
  }

  let streamsBody: unknown = null;
  try {
    streamsBody = await streamsRes.json();
  } catch {
    streamsBody = null;
  }
  if (!streamsRes.ok) {
    return youtubeApiErrorNextResponseFromFetch({
      route: ROUTE,
      endpoint: streamsUrl,
      res: streamsRes,
      rawBody: streamsBody,
    });
  }

  const streamsJson = streamsBody as LiveStreamsListResponse;
  const item = streamsJson.items?.[0];
  const streamStatus =
    typeof item?.status?.streamStatus === "string"
      ? item.status.streamStatus.trim()
      : null;
  const healthStatus =
    typeof item?.status?.healthStatus?.status === "string"
      ? item.status.healthStatus.status.trim()
      : null;

  const streamReceiving =
    streamStatus === "active" ||
    (healthStatus != null && healthStatus.toLowerCase() !== "nodata");

  // 2) liveBroadcasts.transition → live (attempt even if status fields missing; return diagnostics)
  const transitionUrl =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts/transition" +
    `?part=status,contentDetails&id=${encodeURIComponent(broadcastId)}` +
    "&broadcastStatus=live";

  let transRes: Response;
  try {
    transRes = await fetch(transitionUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        route: ROUTE,
        endpoint: transitionUrl,
        message: err instanceof Error ? err.message : "Transition request failed.",
        broadcastId,
        streamId,
        streamStatus,
        healthStatus,
        streamReceiving,
        transitionAttempted: true,
      },
      { status: 502 },
    );
  }

  let transBody: unknown = null;
  try {
    transBody = await transRes.json();
  } catch {
    transBody = null;
  }

  if (!transRes.ok) {
    return youtubeApiErrorNextResponseFromFetch({
      route: ROUTE,
      endpoint: transitionUrl,
      res: transRes,
      rawBody: transBody,
      extra: {
        broadcastId,
        streamId,
        streamStatus,
        healthStatus,
        streamReceiving,
        transitionAttempted: true,
      },
    });
  }

  const transJson = transBody as BroadcastTransitionResponse;
  const lifeCycleStatus =
    typeof transJson.status?.lifeCycleStatus === "string"
      ? transJson.status.lifeCycleStatus.trim()
      : null;

  return NextResponse.json({
    ok: true,
    broadcastId,
    streamId,
    lifeCycleStatus,
    streamStatus,
    healthStatus,
    streamReceiving,
    transitionAttempted: true,
  });
}

