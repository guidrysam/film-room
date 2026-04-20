import { NextRequest, NextResponse } from "next/server";

/** Matches canonical YouTube video id format (same idea as `lib/youtube-id.ts`). */
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

type CacheEntry = { title: string | null; expires: number };

const titleCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached(videoId: string): string | null | undefined {
  const row = titleCache.get(videoId);
  if (!row) return undefined;
  if (Date.now() > row.expires) {
    titleCache.delete(videoId);
    return undefined;
  }
  return row.title;
}

function setCached(videoId: string, title: string | null, ttlMs: number) {
  titleCache.set(videoId, {
    title,
    expires: Date.now() + ttlMs,
  });
}

/**
 * GET /api/youtube-title?videoId=xxxxxxxxxxx
 * Returns { title: string | null } — title is null if unknown or on lookup failure.
 */
export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId")?.trim() ?? "";
  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json(
      { error: "Invalid or missing videoId" },
      { status: 400 },
    );
  }

  const cached = getCached(videoId);
  if (cached !== undefined) {
    return NextResponse.json({ title: cached });
  }

  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) {
    console.error("[api/youtube-title] YOUTUBE_DATA_API_KEY is not set");
    return NextResponse.json(
      { title: null, error: "YouTube title lookup is not configured on the server." },
      { status: 503 },
    );
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = (await res.json()) as {
      items?: Array<{ snippet?: { title?: string } }>;
      error?: { message?: string; code?: number };
    };

    if (!res.ok) {
      console.error(
        "[api/youtube-title] YouTube API HTTP",
        res.status,
        data?.error ?? data,
      );
      setCached(videoId, null, 60_000);
      return NextResponse.json({ title: null }, { status: 200 });
    }

    const rawTitle = data?.items?.[0]?.snippet?.title;
    const title =
      typeof rawTitle === "string" && rawTitle.trim() !== ""
        ? rawTitle.trim()
        : null;

    setCached(videoId, title, CACHE_TTL_MS);
    return NextResponse.json({ title });
  } catch (err) {
    console.error("[api/youtube-title] fetch failed:", err);
    return NextResponse.json({ title: null }, { status: 200 });
  }
}
