/** Parsed Facebook video reference for Film Room embed + RTDB keys. */
export type FacebookVideoRef = {
  /** Numeric video id stored in room `videoId` / clip queue. */
  videoKey: string;
  /** Canonical href for the Facebook embedded video player. */
  href: string;
};

const FB_HOSTS = new Set(["facebook.com", "fb.com", "fb.watch", "m.facebook.com"]);

function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function refFromNumericId(id: string, href: string): FacebookVideoRef | null {
  const trimmed = id.trim();
  if (!/^\d{8,25}$/.test(trimmed)) return null;
  return { videoKey: trimmed, href };
}

/**
 * Parse common Facebook video URL shapes. Returns null when unrecognized.
 *
 * Supported:
 * - facebook.com/watch?v=ID
 * - facebook.com/.../videos/ID
 * - facebook.com/reel/ID
 * - facebook.com/video.php?v=ID
 * - fb.watch/… (stores short href; server may resolve to numeric id)
 */
export function extractFacebookVideoRef(raw: string): FacebookVideoRef | null {
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

  const host = normalizeHost(url.hostname);
  if (!FB_HOSTS.has(host) && !host.endsWith(".facebook.com")) return null;

  if (host === "fb.watch") {
    const slug = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!slug) return null;
    return { videoKey: `fbwatch:${slug}`, href: url.href.split("?")[0]! };
  }

  const vParam = url.searchParams.get("v");
  if (vParam) {
    const hit = refFromNumericId(
      vParam,
      `https://www.facebook.com/watch?v=${vParam}`,
    );
    if (hit) return hit;
  }

  if (/\/video\.php/i.test(url.pathname)) {
    const vid = url.searchParams.get("v");
    if (vid) {
      const hit = refFromNumericId(
        vid,
        `https://www.facebook.com/watch?v=${vid}`,
      );
      if (hit) return hit;
    }
  }

  const reelMatch = url.pathname.match(/\/reels?\/(\d+)/i);
  if (reelMatch?.[1]) {
    const id = reelMatch[1];
    return refFromNumericId(id, `${url.origin}${url.pathname}`);
  }

  const videosMatch = url.pathname.match(/\/videos\/(\d+)/i);
  if (videosMatch?.[1]) {
    const id = videosMatch[1];
    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return refFromNumericId(id, `${url.origin}${path}`);
  }

  return null;
}

/** True when `videoId` looks like a Facebook numeric id (not YouTube 11-char). */
export function isFacebookVideoKey(key: string): boolean {
  const t = key.trim();
  return /^\d{8,25}$/.test(t) || t.startsWith("fbwatch:");
}
