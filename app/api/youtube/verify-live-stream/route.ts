import { NextResponse } from "next/server";

type YouTubeApiErrorResponse = {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string }>;
    status?: string;
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

type LiveStreamsListResponse = {
  items?: Array<{
    id?: string;
    snippet?: { title?: string };
    cdn?: {
      ingestionInfo?: {
        ingestionAddress?: string;
        streamName?: string;
      };
    };
    status?: {
      streamStatus?: string;
      lifeCycleStatus?: string;
    };
  }>;
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }
  const streamIdRaw =
    typeof (payload as { streamId?: unknown })?.streamId === "string"
      ? (payload as { streamId: string }).streamId.trim()
      : "";
  if (!streamIdRaw) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid streamId." },
      { status: 400 },
    );
  }

  const url =
    "https://www.googleapis.com/youtube/v3/liveStreams" +
    `?part=cdn,status,snippet&id=${encodeURIComponent(streamIdRaw)}`;

  const ls = await ytGetJson<LiveStreamsListResponse>({ url, token });
  if (!ls.ok) {
    const parsed = ls.error as YouTubeApiErrorResponse;
    const msg =
      typeof parsed?.error?.message === "string" && parsed.error.message.trim() !== ""
        ? parsed.error.message.trim()
        : `YouTube liveStreams.list failed (HTTP ${ls.status}).`;
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const item = ls.data?.items?.[0];
  if (!item?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Reusable stream not found. Recreate camera preset.",
      },
      { status: 502 },
    );
  }

  const addr = item.cdn?.ingestionInfo?.ingestionAddress;
  const key = item.cdn?.ingestionInfo?.streamName;
  const ingestionAddress = typeof addr === "string" ? addr.trim() : "";
  const streamName = typeof key === "string" ? key.trim() : "";

  if (!ingestionAddress || !streamName) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Reusable stream is missing RTMP ingest info. Recreate camera preset.",
      },
      { status: 502 },
    );
  }

  const streamTitle =
    typeof item.snippet?.title === "string" ? item.snippet.title.trim() : "";
  const streamStatus =
    (typeof item.status?.streamStatus === "string"
      ? item.status.streamStatus.trim()
      : "") ||
    (typeof item.status?.lifeCycleStatus === "string"
      ? item.status.lifeCycleStatus.trim()
      : "") ||
    "";

  return NextResponse.json({
    ok: true,
    streamId: streamIdRaw,
    ingestionAddress,
    streamName,
    streamTitle,
    streamStatus,
  });
}
