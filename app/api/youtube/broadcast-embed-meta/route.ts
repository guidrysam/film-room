import { NextResponse } from "next/server";

import { youtubeApiErrorNextResponse } from "@/lib/youtube-api-error-diagnostic";

const ROUTE = "/api/youtube/broadcast-embed-meta";
const BROADCAST_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function bearerTokenFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h.trim());
  if (!m) return null;
  const token = m[1]?.trim() ?? "";
  return token ? token : null;
}

type BroadcastListResponse = {
  items?: Array<{
    id?: string;
    status?: {
      lifeCycleStatus?: string;
      privacyStatus?: string;
    };
    contentDetails?: {
      enableEmbed?: boolean;
      enableDvr?: boolean;
      recordFromStart?: boolean;
    };
  }>;
};

export async function GET(request: Request) {
  const token = bearerTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing Google OAuth access token (Authorization: Bearer ...).",
      },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const broadcastId = (searchParams.get("broadcastId") ?? "").trim();
  if (!broadcastId || !BROADCAST_ID_RE.test(broadcastId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing broadcastId." },
      { status: 400 },
    );
  }

  const url =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
    `?part=status,contentDetails&id=${encodeURIComponent(broadcastId)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "YouTube request failed.",
      },
      { status: 502 },
    );
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    return youtubeApiErrorNextResponse({
      route: ROUTE,
      endpoint: url,
      httpStatus: res.status,
      httpStatusText: res.statusText,
      rawBody: data,
      extra: { broadcastId },
    });
  }

  const item = (data as BroadcastListResponse).items?.[0];
  if (!item?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Broadcast not found (may not be a live broadcast id).",
        broadcastId,
      },
      { status: 404 },
    );
  }

  const enableEmbed =
    typeof item.contentDetails?.enableEmbed === "boolean"
      ? item.contentDetails.enableEmbed
      : null;
  const lifeCycleStatus =
    typeof item.status?.lifeCycleStatus === "string"
      ? item.status.lifeCycleStatus.trim()
      : null;
  const privacyStatus =
    typeof item.status?.privacyStatus === "string"
      ? item.status.privacyStatus.trim()
      : null;

  return NextResponse.json({
    ok: true,
    broadcastId: item.id,
    enableEmbed,
    lifeCycleStatus,
    privacyStatus,
    enableDvr:
      typeof item.contentDetails?.enableDvr === "boolean"
        ? item.contentDetails.enableDvr
        : undefined,
    recordFromStart:
      typeof item.contentDetails?.recordFromStart === "boolean"
        ? item.contentDetails.recordFromStart
        : undefined,
  });
}
