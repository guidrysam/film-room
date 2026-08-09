import type { GameVideoSource } from "@/lib/games";

/** YouTube id Gemini / audio-sync can watch for a game source. */
export function youtubeVideoIdForAnalysis(
  source: Pick<GameVideoSource, "kind" | "videoId" | "aiProxyVideoId"> | {
    kind?: unknown;
    videoId?: unknown;
    aiProxyVideoId?: unknown;
  },
): string | null {
  const proxy =
    typeof source.aiProxyVideoId === "string"
      ? source.aiProxyVideoId.trim()
      : "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(proxy)) return proxy;

  const kind = source.kind;
  const videoId =
    typeof source.videoId === "string" ? source.videoId.trim() : "";
  if (
    (kind === "youtube" || kind === "youtube_live") &&
    /^[a-zA-Z0-9_-]{11}$/.test(videoId)
  ) {
    return videoId;
  }
  return null;
}

export function isAiAnalyzableSource(
  source: Parameters<typeof youtubeVideoIdForAnalysis>[0],
): boolean {
  return youtubeVideoIdForAnalysis(source) != null;
}
