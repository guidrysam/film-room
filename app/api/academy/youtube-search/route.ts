import { NextResponse } from "next/server";
import type { AcademyYouTubeSuggestion } from "@/lib/academy/youtube-search-query";
import { youtubeApiErrorNextResponseFromFetch } from "@/lib/youtube-api-error-diagnostic";

const ROUTE = "/api/academy/youtube-search";
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

type SearchListResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      description?: string;
      thumbnails?: {
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
  }>;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (query.length < 3 || query.length > 180) {
    return NextResponse.json(
      { ok: false, error: "Search query must be 3–180 characters." },
      { status: 400 },
    );
  }

  const envKey = process.env.YOUTUBE_DATA_API_KEY;
  if (typeof envKey !== "string" || !envKey.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing YOUTUBE_DATA_API_KEY server configuration" },
      { status: 500 },
    );
  }
  const apiKey = envKey.trim();
  const redactKey = (url: string) => url.replace(apiKey, "<redacted>");

  const endpoint =
    "https://www.googleapis.com/youtube/v3/search" +
    `?part=snippet&type=video&maxResults=3&safeSearch=strict` +
    `&videoEmbeddable=true&relevanceLanguage=en` +
    `&q=${encodeURIComponent(query)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      next: { revalidate: 86_400 },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "YouTube search request failed." },
      { status: 502 },
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return youtubeApiErrorNextResponseFromFetch({
      route: ROUTE,
      endpoint: redactKey(endpoint),
      res: response,
      rawBody: body,
    });
  }

  const data = body as SearchListResponse;
  const videos: AcademyYouTubeSuggestion[] = (data.items ?? []).flatMap(
    (item) => {
      const videoId = item.id?.videoId;
      if (typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId)) return [];
      const title = item.snippet?.title?.trim() || "Untitled video";
      const channelTitle = item.snippet?.channelTitle?.trim() || "YouTube";
      const thumbnailUrl =
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.high?.url ??
        null;
      return [
        {
          videoId,
          title,
          channelTitle,
          thumbnailUrl,
          watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
        },
      ];
    },
  );

  return NextResponse.json({
    ok: true,
    query,
    videos,
    note: "Auto-searched teaching examples. Confirm suitability before using with players.",
  });
}
