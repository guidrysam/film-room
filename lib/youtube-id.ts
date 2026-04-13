/** YouTube video IDs are 11 characters from this character set. */
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function normalizeVideoId(segment: string | null | undefined): string | null {
  if (segment == null) return null;
  const id = segment.trim();
  if (!YOUTUBE_ID_RE.test(id)) return null;
  return id;
}

/**
 * Parses common YouTube URL shapes and returns a clean 11-character video id, or null.
 */
export function extractYouTubeVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be") {
    const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return normalizeVideoId(first.split("?")[0]);
  }

  const isYoutube =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com";

  if (!isYoutube) return null;

  const { pathname, searchParams } = url;

  if (pathname === "/watch" || pathname.startsWith("/watch/")) {
    return normalizeVideoId(searchParams.get("v"));
  }

  if (pathname.startsWith("/embed/")) {
    const rest = pathname.slice("/embed/".length);
    const id = rest.split("/")[0] ?? "";
    return normalizeVideoId(id);
  }

  if (pathname.startsWith("/shorts/")) {
    const rest = pathname.slice("/shorts/".length);
    const id = rest.split("/")[0] ?? "";
    return normalizeVideoId(id);
  }

  return null;
}
