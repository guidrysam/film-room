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
  console.log("[YT TITLE] request videoId=", videoId || "(empty)");

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    console.log("[YT TITLE] invalid or missing videoId (reject)");
    return NextResponse.json(
      { error: "Invalid or missing videoId" },
      { status: 400 },
    );
  }

  const cached = getCached(videoId);
  if (cached !== undefined) {
    console.log(
      "[YT TITLE] cache hit title=",
      cached === null ? "null" : JSON.stringify(cached),
    );
    return NextResponse.json({ title: cached });
  }

  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[YT TITLE] missing API key (YOUTUBE_DATA_API_KEY)");
    setCached(videoId, null, 60_000);
    return NextResponse.json({ title: null }, { status: 200 });
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    console.log("[YT TITLE] response", res.ok ? "ok" : `not ok (${res.status})`);

    const data = (await res.json()) as {
      items?: Array<{ snippet?: { title?: string } }>;
      error?: { message?: string; code?: number };
    };

    if (!res.ok) {
      console.warn(
        "[YT TITLE] YouTube HTTP error body:",
        data?.error ?? data,
      );
      setCached(videoId, null, 60_000);
      console.log("[YT TITLE] title=null");
      return NextResponse.json({ title: null }, { status: 200 });
    }

    const rawTitle = data?.items?.[0]?.snippet?.title;
    const title =
      typeof rawTitle === "string" && rawTitle.trim() !== ""
        ? rawTitle.trim()
        : null;

    console.log("[YT TITLE] title=", title === null ? "null" : JSON.stringify(title));
    setCached(videoId, title, CACHE_TTL_MS);
    return NextResponse.json({ title });
  } catch (err) {
    console.warn("[YT TITLE] fetch threw:", err);
    console.log("[YT TITLE] title=null");
    return NextResponse.json({ title: null }, { status: 200 });
  }
}
