/**
 * Game Cap Tripod YouTube uploads — older code-stamped titles and newer
 * normalized "Team v Opponent" titles. Tripod usually stamps "tripod" in the
 * description.
 */

/** ISO-like stamp parallel to MOGO: GameCapTripod-2026-08-08T21-49-23… */
const TRIPOD_STAMP_RE =
  /GameCapTripod[-_\s]+(\d{4})[-_\s]*(\d{2})[-_\s]*(\d{2})T(\d{2})[-:_\s]*(\d{2})[-:_\s]*(\d{2})(?:[.\-_\s]+(\d{1,3}))?Z?/i;

/** Older generic Game Cap code titles (device omitted or abbreviated). */
const GAMECAP_CODE_RE =
  /GameCap(?:Tripod)?[-_\s]+\d{4}[-_\s]*\d{2}[-_\s]*\d{2}/i;

/** Normalized match titles: "Home v Away" / "Home vs Away". */
const NORMALIZED_V_TITLE_RE = /\s+v(?:s\.?)?\s+/i;

export function parseGameCapTripodRecordedAt(raw: string): Date | null {
  const m = TRIPOD_STAMP_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = (frac ?? "0").padEnd(3, "0").slice(0, 3);
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isNormalizedGameCapMatchTitle(title: string): boolean {
  const t = title.trim();
  if (!t || t.length < 5) return false;
  return NORMALIZED_V_TITLE_RE.test(t);
}

export function isGameCapTripodCodeTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (/GameCapTripod/i.test(t)) return true;
  if (/Game\s*Cap\s*Tripod/i.test(t)) return true;
  if (TRIPOD_STAMP_RE.test(t) || GAMECAP_CODE_RE.test(t)) return true;
  return false;
}

export function descriptionMentionsTripod(description: string): boolean {
  return /\btripod\b/i.test(description.trim());
}

/**
 * True when this channel upload looks like a Game Cap Tripod capture.
 * Own-channel sync: "tripod" in the description is the strongest signal.
 */
export function isGameCapTripodYouTubeVideo(
  title: string,
  description = "",
): boolean {
  const t = title.trim();
  const d = description.trim();
  if (!t && !d) return false;

  if (descriptionMentionsTripod(d)) return true;
  if (/Uploaded from Game Cap Tripod/i.test(d)) return true;
  if (/Game\s*Cap\s*Tripod/i.test(d)) return true;

  if (isGameCapTripodCodeTitle(t)) return true;

  // Normalized "v"/"vs" title only when Game Cap is also mentioned.
  if (
    isNormalizedGameCapMatchTitle(t) &&
    (/game\s*cap/i.test(d) || /game\s*cap/i.test(t))
  ) {
    return true;
  }

  return false;
}

/** Highlight cut / reel naming on Game Cap uploads. */
export function looksLikeHighlightReelTitle(
  title: string,
  description = "",
): boolean {
  const blob = `${title}\n${description}`;
  return /\bhighlights?\b/i.test(blob) || /\bhl\s*reel\b/i.test(blob);
}

/**
 * Friendly label for Tripod code stamps; leave normalized titles alone.
 */
export function formatGameCapTripodDisplayName(
  raw: string,
  opts?: { timeZone?: string },
): string {
  const title = raw.trim().replace(/\.(mov|mp4|m4v|webm)$/i, "");
  if (!title) return raw.trim();

  const recordedAt = parseGameCapTripodRecordedAt(title);
  if (!recordedAt) return title;

  const when = recordedAt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(opts?.timeZone ? { timeZone: opts.timeZone } : {}),
  });

  const rest = title
    .replace(TRIPOD_STAMP_RE, "")
    .replace(/GameCapTripod/gi, "")
    .replace(/^[.\-_\/\s]+/, "")
    .replace(/^[a-f0-9]{6,10}\b/i, "")
    .replace(/^[.\-_\/\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  return rest ? `${when} · ${rest}` : when;
}
