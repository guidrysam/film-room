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
 *
 * `…/channel/<UC…>/live` and `…/@handle/live` always return null (not video URLs).
 *
 * Accepted examples (query/hash ignored except `v` on /watch):
 * - https://www.youtube.com/watch?v=VIDEO_ID&t=123&feature=share
 * - https://youtube.com/live/VIDEO_ID?si=abc
 * - https://youtu.be/VIDEO_ID?feature=share
 * - VIDEO_ID (raw 11-char id)
 */
export function extractYouTubeVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Raw id only (e.g. dQw4w9WgXcQ) — avoids mis-parsing as a bogus https URL hostname.
  const asRaw = normalizeVideoId(trimmed);
  if (asRaw) return asRaw;

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

  const isNocookie = host === "youtube-nocookie.com";

  if (!isYoutube && !isNocookie) return null;

  const { pathname, searchParams } = url;
  const normPath = pathname.replace(/\/+$/, "") || "/";

  // Mobile / app share wrapper: ?u=/watch?v=VIDEO_ID
  if (isYoutube && normPath === "/attribution_link") {
    const inner = searchParams.get("u");
    if (inner) {
      try {
        const decoded = decodeURIComponent(inner);
        const innerUrl = decoded.startsWith("/")
          ? `https://www.youtube.com${decoded}`
          : decoded;
        const nested = extractYouTubeVideoId(innerUrl);
        if (nested) return nested;
      } catch {
        /* ignore */
      }
    }
  }

  // Persistent channel or @handle live URLs must never be parsed as /live/<videoId>.
  if (/^\/channel\/[^/]+\/live$/i.test(normPath)) {
    return null;
  }
  if (/^\/@[^/]+\/live$/i.test(normPath)) {
    return null;
  }

  if (pathname === "/watch" || pathname.startsWith("/watch/")) {
    return normalizeVideoId(searchParams.get("v"));
  }

  if (pathname.startsWith("/live/")) {
    const rest = pathname.slice("/live/".length);
    const id = rest.split("/")[0] ?? "";
    return normalizeVideoId(id);
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

  // Fallback: v= anywhere on a YouTube-family URL.
  const fromV = normalizeVideoId(searchParams.get("v"));
  if (fromV) return fromV;

  return null;
}

/** True for `youtube.com/watch?...` (including `m.youtube.com`). */
export function isYoutubeWatchVideoUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "youtube.com" && host !== "m.youtube.com") return false;
    return url.pathname === "/watch" || url.pathname.startsWith("/watch/");
  } catch {
    return false;
  }
}

/**
 * True for channel `@handle/live`, `…/channel/UC…/live`, or any URL path containing `/live`
 * (including `youtube.com/live/VIDEO_ID`). Used to avoid treating YouTube Data API lag as
 * “offline” for persistent live entry points.
 */
export function isPersistentYouTubeLiveUrl(url: string): boolean {
  const u = url.trim();
  return u.includes("/live") || (u.includes("/@") && u.endsWith("/live"));
}

/** Canonical persistent live entry points only (not e.g. `youtube.com/live/VIDEO_ID`). */
export function isPersistentChannelOrHandleLiveUrl(url: string): boolean {
  const u = url.trim();
  return (
    (u.includes("/channel/") && u.endsWith("/live")) ||
    (u.includes("/@") && u.endsWith("/live"))
  );
}

export type PersistentLiveUrlTarget =
  | { kind: "video"; videoId: string }
  | { kind: "channel_live"; channelId: string }
  | { kind: "handle_live"; handle: string };

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;

/**
 * Resolve Stream Room URLs: normal video ids, `/channel/UC…/live`, or `/@handle/live`.
 * Does not call the network — use `/api/youtube-resolve-live` for channel/handle targets.
 */
export function parsePersistentLiveUrlTarget(
  raw: string,
): PersistentLiveUrlTarget | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    url = new URL(withScheme);
  } catch {
    const vidOnly = extractYouTubeVideoId(trimmed);
    return vidOnly ? { kind: "video", videoId: vidOnly } : null;
  }

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtube.com" || host === "m.youtube.com") {
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // Resolve persistent live URLs before any /live/<videoId> or watch?v= extraction.
    const chLive = /^\/channel\/([^/]+)\/live$/i.exec(path);
    if (chLive) {
      const id = decodeURIComponent(chLive[1]!);
      if (CHANNEL_ID_RE.test(id)) {
        return { kind: "channel_live", channelId: id };
      }
      return null;
    }

    const atLive = /^\/@([^/]+)\/live$/i.exec(path);
    if (atLive) {
      const h = decodeURIComponent(atLive[1]!);
      if (h.trim() !== "") {
        return { kind: "handle_live", handle: h };
      }
      return null;
    }
  }

  const vid = extractYouTubeVideoId(trimmed);
  return vid ? { kind: "video", videoId: vid } : null;
}
