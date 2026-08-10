import type { ReelStep } from "@/lib/highlight-draft";
import type { ReelTitleCard } from "@/lib/highlight-reel-cards";
import type { ScoreboardTick } from "@/lib/game-scoreboard";
import {
  normalizeHighlightSoundtrack,
  type HighlightSoundtrack,
} from "@/lib/highlight-soundtrack";
import {
  normalizeHighlightSponsors,
  type HighlightSponsorLogo,
} from "@/lib/highlight-sponsors";

export const HIGHLIGHT_REEL_SHARE_SCHEMA = "highlight_reel_share_v1" as const;

export type HighlightReelShareSource = {
  id: string;
  videoId: string;
  label?: string;
};

export type HighlightReelShareScoreboard = {
  ticks: ScoreboardTick[];
  homeName: string;
  awayName: string;
};

export type HighlightReelSharePayload = {
  schema: typeof HIGHLIGHT_REEL_SHARE_SCHEMA;
  reelName: string;
  gameTitle: string;
  titleCard: ReelTitleCard;
  steps: ReelStep[];
  sources: HighlightReelShareSource[];
  /** Optional — older shares omit this. */
  scoreboard?: HighlightReelShareScoreboard;
  /** Drive soundtrack metadata (stream via /api/reel/{shareId}/soundtrack). */
  soundtrack?: HighlightSoundtrack;
  /** Sponsor logos for black-cut thank-yous. */
  sponsors?: HighlightSponsorLogo[];
  /** Custom thank-you copy on sponsor cuts. */
  thankYouMessage?: string;
};

export type SharedHighlightReelLookupResult =
  | {
      ok: true;
      gameId: string;
      cutId: string;
      payload: HighlightReelSharePayload;
      createdByName?: string;
    }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "expired" }
  | { ok: false; kind: "query_failed"; message: string; code?: string };

function parseShareScoreboard(raw: unknown): HighlightReelShareScoreboard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.homeName !== "string" || typeof o.awayName !== "string") {
    return null;
  }
  if (!Array.isArray(o.ticks)) return null;
  const ticks: ScoreboardTick[] = [];
  for (const row of o.ticks) {
    if (!row || typeof row !== "object") continue;
    const t = row as Record<string, unknown>;
    if (
      typeof t.t !== "number" ||
      typeof t.home !== "number" ||
      typeof t.away !== "number"
    ) {
      continue;
    }
    ticks.push({ t: t.t, home: t.home, away: t.away });
  }
  if (ticks.length === 0) return null;
  return {
    ticks,
    homeName: o.homeName.trim() || "Home",
    awayName: o.awayName.trim() || "Away",
  };
}

export function parseHighlightReelSharePayload(
  raw: unknown,
): HighlightReelSharePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (v.schema !== HIGHLIGHT_REEL_SHARE_SCHEMA) return null;
  if (typeof v.reelName !== "string" || typeof v.gameTitle !== "string") {
    return null;
  }
  if (!v.titleCard || typeof v.titleCard !== "object") return null;
  const titleCard = v.titleCard as Record<string, unknown>;
  if (typeof titleCard.headline !== "string") return null;
  const steps = Array.isArray(v.steps) ? (v.steps as ReelStep[]) : null;
  if (!steps || steps.length === 0) return null;
  const sourcesRaw = Array.isArray(v.sources) ? v.sources : [];
  const sources: HighlightReelShareSource[] = [];
  for (const row of sourcesRaw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.videoId !== "string") continue;
    sources.push({
      id: o.id,
      videoId: o.videoId,
      ...(typeof o.label === "string" && o.label.trim()
        ? { label: o.label.trim() }
        : {}),
    });
  }
  if (sources.length === 0) return null;
  const scoreboard = parseShareScoreboard(v.scoreboard);
  const soundtrack = normalizeHighlightSoundtrack(v.soundtrack);
  const sponsors = normalizeHighlightSponsors(v.sponsors);
  const thankYouMessage =
    typeof v.thankYouMessage === "string" && v.thankYouMessage.trim()
      ? v.thankYouMessage.trim()
      : undefined;
  return {
    schema: HIGHLIGHT_REEL_SHARE_SCHEMA,
    reelName: v.reelName.trim() || "Highlight reel",
    gameTitle: v.gameTitle.trim() || "Highlights",
    titleCard: {
      headline: titleCard.headline,
      ...(typeof titleCard.subtitle === "string" && titleCard.subtitle.trim()
        ? { subtitle: titleCard.subtitle.trim() }
        : {}),
      ...(typeof titleCard.logoUrl === "string" && titleCard.logoUrl.trim()
        ? { logoUrl: titleCard.logoUrl.trim() }
        : {}),
    },
    steps,
    sources,
    ...(scoreboard ? { scoreboard } : {}),
    ...(soundtrack ? { soundtrack } : {}),
    ...(sponsors.length > 0 ? { sponsors } : {}),
    ...(thankYouMessage ? { thankYouMessage } : {}),
  };
}
