/** Gemini YouTube URL ingest only works for public videos (not unlisted/private). */

export const GEMINI_YOUTUBE_PUBLIC_REQUIRED =
  "AI Tag/Sync needs a public YouTube video. Gemini cannot watch unlisted or private links. In YouTube Studio set the angle to Public, refresh the source, then retry.";

export function normalizeYoutubePrivacy(
  privacy: string | null | undefined,
): "public" | "unlisted" | "private" | "unknown" {
  const p = (privacy ?? "").trim().toLowerCase();
  if (p === "public" || p === "unlisted" || p === "private") return p;
  return "unknown";
}

export function geminiCanWatchYoutubePrivacy(
  privacy: string | null | undefined,
): boolean {
  const p = normalizeYoutubePrivacy(privacy);
  // Unknown: allow the API attempt; reject junk results after.
  return p === "public" || p === "unknown";
}

export function youtubePrivacyBlockReason(
  privacy: string | null | undefined,
  label?: string,
): string | null {
  const p = normalizeYoutubePrivacy(privacy);
  if (p === "public" || p === "unknown") return null;
  const who = label?.trim() ? `"${label.trim()}"` : "This video";
  return `${who} is ${p}. ${GEMINI_YOUTUBE_PUBLIC_REQUIRED}`;
}
