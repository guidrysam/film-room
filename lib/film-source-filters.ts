import type { FilmSource } from "@/lib/film-sources";

export type FilmReviewFilter = "all" | "unreviewed" | "reviewed";
export type FilmLengthFilter = "all" | "under10";

export const FILM_HIGHLIGHT_MAX_SEC = 10 * 60;

export function isFilmUnderTenMinutes(
  source: FilmSource,
  maxSec = FILM_HIGHLIGHT_MAX_SEC,
): boolean {
  if (typeof source.durationSec === "number" && source.durationSec > 0) {
    return source.durationSec <= maxSec;
  }
  return source.filmKind === "highlight";
}

export function isFilmReviewed(source: FilmSource): boolean {
  return Boolean(source.reviewGameId?.trim());
}

/** Prefer YouTube publish time, else inbox createdAt. */
export function filmSourceDateMs(source: FilmSource): number | null {
  const published = source.publishedAt?.trim();
  if (published) {
    const t = Date.parse(published);
    if (!Number.isNaN(t)) return t;
  }
  const created = source.createdAt?.toMillis?.();
  return typeof created === "number" && Number.isFinite(created)
    ? created
    : null;
}

/** Local calendar day → start ms (inclusive). */
export function localDateInputStartMs(yyyyMmDd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

/** Local calendar day → end ms (inclusive). */
export function localDateInputEndMs(yyyyMmDd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

export type FilmSourceFilterInput = {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  review?: FilmReviewFilter;
  length?: FilmLengthFilter;
};

export function filterFilmSources(
  sources: FilmSource[],
  filters: FilmSourceFilterInput,
): FilmSource[] {
  const q = filters.query?.trim().toLowerCase() ?? "";
  const review = filters.review ?? "all";
  const length = filters.length ?? "all";
  const fromMs = filters.dateFrom
    ? localDateInputStartMs(filters.dateFrom)
    : null;
  const toMs = filters.dateTo ? localDateInputEndMs(filters.dateTo) : null;

  return sources.filter((source) => {
    if (review === "unreviewed" && isFilmReviewed(source)) return false;
    if (review === "reviewed" && !isFilmReviewed(source)) return false;
    if (length === "under10" && !isFilmUnderTenMinutes(source)) return false;

    if (fromMs != null || toMs != null) {
      const when = filmSourceDateMs(source);
      if (when == null) return false;
      if (fromMs != null && when < fromMs) return false;
      if (toMs != null && when > toMs) return false;
    }

    if (q) {
      const label = (source.label || "").toLowerCase();
      const device = (source.captureDevice || "").toLowerCase();
      const kind = (source.filmKind || "").toLowerCase();
      const hay = `${label} ${device} ${kind} ${source.organizeKind}`;
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}
