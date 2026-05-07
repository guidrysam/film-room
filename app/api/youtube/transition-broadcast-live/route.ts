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

type BroadcastListResponse = {
  items?: Array<{
    status?: { lifeCycleStatus?: string; recordingStatus?: string };
    contentDetails?: { boundStreamId?: string };
    snippet?: { actualStartTime?: string; actualEndTime?: string };
  }>;
};

function normLifeCycle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

async function sleepMs(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
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
  const transitionResponseLifeCycleStatus =
    typeof transJson.status?.lifeCycleStatus === "string"
      ? transJson.status.lifeCycleStatus.trim()
      : null;

  // 3) Immediately read post-transition status for visible diagnostics.
  const postUrl =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
    `?part=status,contentDetails,snippet&id=${encodeURIComponent(broadcastId)}`;
  let postRes: Response;
  try {
    postRes = await fetch(postUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        route: ROUTE,
        endpoint: postUrl,
        message: err instanceof Error ? err.message : "Post-transition read failed.",
        broadcastId,
        streamId,
        streamStatus,
        healthStatus,
        streamReceiving,
        transitionAttempted: true,
        transitionResponseLifeCycleStatus,
        rawTransitionResponse: transBody,
      },
      { status: 502 },
    );
  }

  let postBody: unknown = null;
  try {
    postBody = await postRes.json();
  } catch {
    postBody = null;
  }
  if (!postRes.ok) {
    return youtubeApiErrorNextResponseFromFetch({
      route: ROUTE,
      endpoint: postUrl,
      res: postRes,
      rawBody: postBody,
      extra: {
        broadcastId,
        streamId,
        streamStatus,
        healthStatus,
        streamReceiving,
        transitionAttempted: true,
        transitionResponseLifeCycleStatus,
        rawTransitionResponse: transBody,
      },
    });
  }

  const postJson = postBody as BroadcastListResponse;
  const postItem = postJson.items?.[0];
  const postTransitionLifeCycleStatus =
    typeof postItem?.status?.lifeCycleStatus === "string"
      ? postItem.status.lifeCycleStatus.trim()
      : null;
  const postTransitionRecordingStatus =
    typeof postItem?.status?.recordingStatus === "string"
      ? postItem.status.recordingStatus.trim()
      : null;
  const postTransitionBoundStreamId =
    typeof postItem?.contentDetails?.boundStreamId === "string"
      ? postItem.contentDetails.boundStreamId.trim()
      : null;
  const postTransitionActualStartTime =
    typeof postItem?.snippet?.actualStartTime === "string"
      ? postItem.snippet.actualStartTime.trim()
      : null;
  const postTransitionActualEndTime =
    typeof postItem?.snippet?.actualEndTime === "string"
      ? postItem.snippet.actualEndTime.trim()
      : null;

  // 4) If YouTube is still finalizing (often "liveStarting" or "testing"), poll briefly.
  const shouldPoll =
    postTransitionLifeCycleStatus != null &&
    ["livestarting", "testing"].includes(
      postTransitionLifeCycleStatus.toLowerCase(),
    );

  const pollIntervalMs = 2000;
  const pollMaxMs = 20000;
  const pollMaxAttempts = Math.floor(pollMaxMs / pollIntervalMs);

  let pollAttempts = 0;
  let finalLifeCycleStatus: string | null = postTransitionLifeCycleStatus;
  let reachedLive = postTransitionLifeCycleStatus?.toLowerCase() === "live";

  let finalPostTransitionLifeCycleStatus: string | null =
    postTransitionLifeCycleStatus;
  let finalPostTransitionRecordingStatus: string | null =
    postTransitionRecordingStatus;
  let finalPostTransitionBoundStreamId: string | null =
    postTransitionBoundStreamId;
  let finalPostTransitionActualStartTime: string | null =
    postTransitionActualStartTime;
  let finalPostTransitionActualEndTime: string | null =
    postTransitionActualEndTime;
  let finalRawPostTransitionBroadcast: unknown = postBody;

  if (shouldPoll) {
    for (let i = 0; i < pollMaxAttempts; i += 1) {
      pollAttempts += 1;
      await sleepMs(pollIntervalMs);

      let pollRes: Response;
      try {
        pollRes = await fetch(postUrl, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
      } catch {
        // Ignore transient network errors during polling; keep last known status.
        continue;
      }

      let pollBody: unknown = null;
      try {
        pollBody = await pollRes.json();
      } catch {
        pollBody = null;
      }
      if (!pollRes.ok) {
        // Ignore API errors during polling; keep last known status.
        continue;
      }

      const pollJson = pollBody as BroadcastListResponse;
      const pollItem = pollJson.items?.[0];
      const polledLifeCycleStatus = normLifeCycle(pollItem?.status?.lifeCycleStatus);
      const polledRecordingStatus = normLifeCycle(pollItem?.status?.recordingStatus);
      const polledBoundStreamId = normLifeCycle(pollItem?.contentDetails?.boundStreamId);
      const polledActualStartTime = normLifeCycle(pollItem?.snippet?.actualStartTime);
      const polledActualEndTime = normLifeCycle(pollItem?.snippet?.actualEndTime);

      finalPostTransitionLifeCycleStatus = polledLifeCycleStatus;
      finalPostTransitionRecordingStatus = polledRecordingStatus;
      finalPostTransitionBoundStreamId = polledBoundStreamId;
      finalPostTransitionActualStartTime = polledActualStartTime;
      finalPostTransitionActualEndTime = polledActualEndTime;
      finalRawPostTransitionBroadcast = pollBody;

      finalLifeCycleStatus = polledLifeCycleStatus;
      if (polledLifeCycleStatus?.toLowerCase() === "live") {
        reachedLive = true;
        break;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    transitionAttempted: true,
    broadcastId,
    streamId,
    streamStatus,
    healthStatus,
    streamReceiving,
    transitionResponseLifeCycleStatus,
    postTransitionLifeCycleStatus: finalPostTransitionLifeCycleStatus,
    postTransitionRecordingStatus: finalPostTransitionRecordingStatus,
    postTransitionBoundStreamId: finalPostTransitionBoundStreamId,
    postTransitionActualStartTime: finalPostTransitionActualStartTime,
    postTransitionActualEndTime: finalPostTransitionActualEndTime,
    finalLifeCycleStatus,
    reachedLive,
    pollAttempts,
    rawTransitionResponse: transBody,
    rawPostTransitionBroadcast: finalRawPostTransitionBroadcast,
  });
}

