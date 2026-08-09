import { ANGLE_SLOT_LABELS, type AngleSlot } from "@/lib/drive/angle-slots";

const ANGLE_PREFIX = Object.values(ANGLE_SLOT_LABELS)
  .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const ANGLE_PREFIX_RE = new RegExp(
  `^(?:${ANGLE_PREFIX})\\s*[—–-]\\s*`,
  "i",
);

/**
 * Normalize a movie / YouTube / sidecar name so
 * `Main — GameCapMOGO-….mov` matches `GameCapMOGO-….json` / YT title.
 */
export function normalizeMediaStem(name: string): string {
  let s = name.trim();
  if (!s) return "";
  s = s.replace(/^.*[/\\]/, "");
  s = s.replace(ANGLE_PREFIX_RE, "");
  s = s.replace(/\.(mov|mp4|m4v|webm|json)$/i, "");
  s = s.replace(/[_\s]+/g, " ").trim().toLowerCase();
  return s;
}

/** Compact form for fuzzy equality (spaces/hyphens/dots ignored). */
export function compactMediaStem(name: string): string {
  return normalizeMediaStem(name).replace(/[\s._-]+/g, "");
}

export function mediaStemsMatch(a: string, b: string): boolean {
  const na = normalizeMediaStem(a);
  const nb = normalizeMediaStem(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = compactMediaStem(a);
  const cb = compactMediaStem(b);
  return ca.length > 0 && ca === cb;
}

export function isJsonDriveName(name: string): boolean {
  return /\.json$/i.test(name.trim());
}

/** Prefer Main when choosing among multiple matched sources. */
export function rankSourceForSidecar(source: {
  kind?: string;
  angleSlot?: string;
  label?: string;
}): number {
  let score = 0;
  if (source.kind === "youtube" || source.kind === "youtube_live") score += 40;
  if (source.angleSlot === ("main" as AngleSlot)) score += 30;
  if (typeof source.label === "string" && /main/i.test(source.label)) {
    score += 10;
  }
  return score;
}
