import { NextResponse } from "next/server";

import { youtubeApiErrorNextResponseFromFetch } from "@/lib/youtube-api-error-diagnostic";
import { ensureBroadcastEmbeddable } from "@/lib/youtube-ensure-embeddable";

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

  const broadcastReadUrl =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
    `?part=status,contentDetails,snippet&id=${encodeURIComponent(broadcastId)}`;

  const readBroadcastLifecycle = async (): Promise<{
    ok: boolean;
    body: unknown;
    lifeCycleStatus: string | null;
    recordingStatus: string | null;
    boundStreamId: string | null;
    actualStartTime: string | null;
    actualEndTime: string | null;
  }> => {
    let res: Response;
    try {
      res = await fetch(broadcastReadUrl, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      return {
        ok: false,
        body: null,
        lifeCycleStatus: null,
        recordingStatus: null,
        boundStreamId: null,
        actualStartTime: null,
        actualEndTime: null,
      };
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        body,
        lifeCycleStatus: null,
        recordingStatus: null,
        boundStreamId: null,
        actualStartTime: null,
        actualEndTime: null,
      };
    }

    const json = body as BroadcastListResponse;
    const it = json.items?.[0];
    return {
      ok: true,
      body,
      lifeCycleStatus: normLifeCycle(it?.status?.lifeCycleStatus),
      recordingStatus: normLifeCycle(it?.status?.recordingStatus),
      boundStreamId: normLifeCycle(it?.contentDetails?.boundStreamId),
      actualStartTime: normLifeCycle(it?.snippet?.actualStartTime),
      actualEndTime: normLifeCycle(it?.snippet?.actualEndTime),
    };
  };

  const transitionBroadcast = async (broadcastStatus: "testing" | "live") => {
    const url =
      "https://www.googleapis.com/youtube/v3/liveBroadcasts/transition" +
      `?part=status,contentDetails&id=${encodeURIComponent(broadcastId)}` +
      `&broadcastStatus=${broadcastStatus}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch (err) {
      return {
        ok: false as const,
        url,
        res: null as Response | null,
        body: null as unknown,
        errMsg: err instanceof Error ? err.message : "Fetch failed.",
      };
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return {
      ok: res.ok,
      url,
      res,
      body,
      errMsg: res.ok ? null : `HTTP ${res.status}`,
    };
  };

  // 1b) Repair embedding while the broadcast is still pre-live. Once it is in
  // testing/live the API can no longer change enableEmbed, so this must run
  // before the transitions below.
  const embedResult = await ensureBroadcastEmbeddable(token, broadcastId);

  // 2) Read lifecycle before any transitions (to decide if we need testing → live)
  const beforeRead = await readBroadcastLifecycle();
  const lifecycleBeforeTesting = beforeRead.lifeCycleStatus;

  let attemptedTestingTransition = false;
  let testingTransitionSucceeded = false;
  let lifecycleAfterTesting: string | null = null;

  if (
    lifecycleBeforeTesting != null &&
    ["ready", "created"].includes(lifecycleBeforeTesting.toLowerCase())
  ) {
    attemptedTestingTransition = true;
    const testingTrans = await transitionBroadcast("testing");
    if (testingTrans.ok) {
      testingTransitionSucceeded = true;
      await sleepMs(2000);
      const afterTestingRead = await readBroadcastLifecycle();
      lifecycleAfterTesting = afterTestingRead.lifeCycleStatus;
    } else {
      testingTransitionSucceeded = false;
      // Intentionally continue to try "live" transition; Studio manual action may still be required.
    }
  }

  // 3) liveBroadcasts.transition → live
  const attemptedLiveTransition = true;
  const liveTrans = await transitionBroadcast("live");
  const transitionUrl = liveTrans.url;

  if (!liveTrans.ok || !liveTrans.res) {
    return NextResponse.json(
      {
        ok: false,
        route: ROUTE,
        endpoint: transitionUrl,
        message:
          liveTrans.errMsg ??
          "Live transition request failed.",
        broadcastId,
        streamId,
        streamStatus,
        healthStatus,
        streamReceiving,
        transitionAttempted: true,
        attemptedTestingTransition,
        testingTransitionSucceeded,
        lifecycleBeforeTesting,
        lifecycleAfterTesting,
        attemptedLiveTransition,
      },
      { status: 502 },
    );
  }

  const transRes = liveTrans.res;
  const transBody = liveTrans.body;

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
        attemptedTestingTransition,
        testingTransitionSucceeded,
        lifecycleBeforeTesting,
        lifecycleAfterTesting,
        attemptedLiveTransition,
      },
    });
  }

  const transJson = transBody as BroadcastTransitionResponse;
  const transitionResponseLifeCycleStatus =
    typeof transJson.status?.lifeCycleStatus === "string"
      ? transJson.status.lifeCycleStatus.trim()
      : null;

  // 4) Immediately read post-live-transition status for visible diagnostics.
  const afterLiveRead = await readBroadcastLifecycle();
  const lifecycleAfterLiveTransition = afterLiveRead.lifeCycleStatus;
  const postTransitionLifeCycleStatus = afterLiveRead.lifeCycleStatus;
  const postTransitionRecordingStatus = afterLiveRead.recordingStatus;
  const postTransitionBoundStreamId = afterLiveRead.boundStreamId;
  const postTransitionActualStartTime = afterLiveRead.actualStartTime;
  const postTransitionActualEndTime = afterLiveRead.actualEndTime;
  const postBody = afterLiveRead.body;

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
        pollRes = await fetch(broadcastReadUrl, {
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
    embeddable: embedResult.embeddable ?? undefined,
    embedRejected: embedResult.embedRejected,
    embedRepairReason: embedResult.reason,
    embedRepairLifeCycleStatus: embedResult.lifeCycleStatus,
    attemptedTestingTransition,
    testingTransitionSucceeded,
    lifecycleBeforeTesting,
    lifecycleAfterTesting,
    attemptedLiveTransition,
    lifecycleAfterLiveTransition,
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

