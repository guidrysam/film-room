/** Titles/descriptions Game Cap MOGO writes (default file name or description tag). */
export function isGameCapMogoYouTubeVideo(
  title: string,
  description = "",
): boolean {
  const t = title.trim();
  const d = description.trim();
  if (!t && !d) return false;
  if (/GameCapMOGO/i.test(t)) return true;
  if (/Game\s*Cap\s*MOGO/i.test(t)) return true;
  if (/Uploaded from Game Cap MOGO/i.test(d)) return true;
  // Drive-style / spaced session names
  if (/GameCapMOGO[-_\s]+\d{4}/i.test(t)) return true;
  return false;
}

const ANGLE_PREFIX_RE =
  /^(Main|Goal A|Goal B|Offense|Defense)\s*[—–-]\s*/i;

/**
 * MOGO stamps filenames with an ISO-like token. Colons (and sometimes other
 * separators) become hyphens or spaces, e.g.
 * `GameCapMOGO-2026-08-08T21-49-23.592Z-282e4e1`
 * `GameCapMOGO 2026 08 08T21 49 23 592Z 282ae4a1`
 */
const MOGO_STAMP_RE =
  /GameCapMOGO[-_\s]+(\d{4})[-_\s]*(\d{2})[-_\s]*(\d{2})T(\d{2})[-:_\s]*(\d{2})[-:_\s]*(\d{2})(?:[.\-_\s]+(\d{1,3}))?Z?/i;

const TRAILING_HEX_ID_RE = /^[a-f0-9]{6,10}\b/i;

export function parseGameCapMogoRecordedAt(raw: string): Date | null {
  const m = MOGO_STAMP_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = (frac ?? "0").padEnd(3, "0").slice(0, 3);
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Turn a MOGO coded title into a plain-English label, e.g.
 * `Main — GameCapMOGO-2026-08-08T21-49-23.592Z-…` → `Main · Aug 8, 2026, 5:49 PM`
 * `GameCapMOGO 2026 08 08T21 49 23 592Z … highlights` → `Aug 8, 2026, 5:49 PM · highlights`
 * Falls back to the original string when it isn't a MOGO stamp.
 */
export function formatGameCapMogoDisplayName(
  raw: string,
  opts?: { timeZone?: string },
): string {
  const title = raw.trim().replace(/\.(mov|mp4|m4v|webm)$/i, "");
  if (!title) return raw.trim();

  const recordedAt = parseGameCapMogoRecordedAt(title);
  if (!recordedAt) return title;

  const angleMatch = ANGLE_PREFIX_RE.exec(title);
  const angle = angleMatch?.[1]?.trim();

  const when = recordedAt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(opts?.timeZone ? { timeZone: opts.timeZone } : {}),
  });

  const rest = title
    .replace(ANGLE_PREFIX_RE, "")
    .replace(MOGO_STAMP_RE, "")
    .replace(/^[.\-_\/\s]+/, "")
    .replace(TRAILING_HEX_ID_RE, "")
    .replace(/^[.\-_\/\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  const base = angle ? `${angle} · ${when}` : when;
  return rest ? `${base} · ${rest}` : base;
}
