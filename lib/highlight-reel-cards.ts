import type { Game } from "@/lib/games";
import type { Team } from "@/lib/teams";
import type { ReelStep } from "@/lib/highlight-draft";
import { formatGameCapMogoDisplayName } from "@/lib/youtube/mogo-match";

export const REEL_TITLE_HOLD_MS = 4800;
export const REEL_STAT_HOLD_MS = 1600;
export const REEL_THANKS_HOLD_MS = 3200;

export type ReelTitleLogoSource =
  | "auto"
  | "club"
  | "team"
  /** Explicit logo URL stored on the reel (any club/team crest the editor picks). */
  | "custom"
  | "none";

export type ReelTitleCard = {
  headline: string;
  subtitle?: string;
  logoUrl?: string;
};

export type ReelStatCard = {
  headline?: string;
  lines: string[];
};

export type ReelThankYouCard = {
  /** Main thank-you copy (customizable per reel). */
  headline: string;
  subtitle?: string;
  logos: Array<{ logoUrl: string; name?: string }>;
};

/**
 * One sponsor thank-you for a single black cut (cycles through the list).
 * Used between clips while YouTube chrome is covered.
 */
export function sponsorInterstitialForCut(
  sponsors: Array<{ logoUrl: string; name?: string }> | null | undefined,
  cutIndex: number,
  opts?: { message?: string | null },
): ReelInterstitial | null {
  const list = (sponsors ?? [])
    .map((s) => ({
      logoUrl: s.logoUrl.trim(),
    }))
    .filter((s) => s.logoUrl.length > 0);
  if (list.length === 0) return null;
  const i = ((cutIndex % list.length) + list.length) % list.length;
  const logo = list[i]!;
  const message =
    opts?.message?.trim() || "Thank you to our sponsors";
  return {
    kind: "thanks",
    headline: message,
    logos: [logo],
  };
}

/** End-card thanking sponsors (and optionally the team). */
export function buildReelThankYouCard(
  sponsors: Array<{ logoUrl: string; name?: string }> | null | undefined,
  opts?: { teamName?: string | null; message?: string | null },
): ReelThankYouCard | null {
  const logos = (sponsors ?? [])
    .map((s) => ({
      logoUrl: s.logoUrl.trim(),
      ...(s.name?.trim() ? { name: s.name.trim() } : {}),
    }))
    .filter((s) => s.logoUrl.length > 0);
  if (logos.length === 0) return null;
  const message = opts?.message?.trim();
  const teamName = opts?.teamName?.trim();
  return {
    headline: message || "Thank you to our sponsors",
    ...(teamName && !message
      ? { subtitle: teamName }
      : {}),
    logos,
  };
}

function formatGameDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso.trim();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return iso.trim();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function resolveReelTitleLogoUrl(opts: {
  clubLogoUrl?: string | null;
  teamLogoUrl?: string | null;
  customLogoUrl?: string | null;
  source?: ReelTitleLogoSource | null;
}): string | undefined {
  const club = opts.clubLogoUrl?.trim() || "";
  const team = opts.teamLogoUrl?.trim() || "";
  const custom = opts.customLogoUrl?.trim() || "";
  const source = opts.source ?? "auto";
  if (source === "none") return undefined;
  if (source === "custom") return custom || club || team || undefined;
  if (source === "club") return club || undefined;
  if (source === "team") return team || undefined;
  return club || team || undefined;
}

/** Title card shown on black before the reel starts. */
export function buildReelTitleCard(
  game: Game,
  team: Pick<Team, "name" | "logoUrl"> | null,
  reelName?: string,
  opts?: {
    club?: Pick<{ name?: string; logoUrl?: string }, "name" | "logoUrl"> | null;
    logoSource?: ReelTitleLogoSource | null;
    customLogoUrl?: string | null;
  },
): ReelTitleCard {
  const teamName = team?.name?.trim() ?? game.homeTeam?.trim();
  const opponent = game.opponent?.trim() ?? game.awayTeam?.trim();
  const rawHeadline =
    reelName?.trim() ||
    game.title?.trim() ||
    (teamName && opponent ? `${teamName} vs ${opponent}` : teamName) ||
    "Highlights";
  const headline = formatGameCapMogoDisplayName(rawHeadline);

  const meta: string[] = [];
  if (
    teamName &&
    opponent &&
    !headline.toLowerCase().includes(opponent.toLowerCase())
  ) {
    meta.push(`${teamName} vs ${opponent}`);
  } else if (
    teamName &&
    !headline.toLowerCase().includes(teamName.toLowerCase())
  ) {
    meta.push(teamName);
  }
  if (game.date?.trim()) meta.push(formatGameDate(game.date));
  if (game.location?.trim()) meta.push(game.location.trim());

  const logoUrl = resolveReelTitleLogoUrl({
    clubLogoUrl: opts?.club?.logoUrl,
    teamLogoUrl: team?.logoUrl,
    customLogoUrl: opts?.customLogoUrl,
    source: opts?.logoSource,
  });

  return {
    headline,
    ...(meta.length > 0 ? { subtitle: meta.join(" · ") } : {}),
    ...(logoUrl ? { logoUrl } : {}),
  };
}

/** Stat / attribution card for black-screen cuts between segments. */
export function buildReelStatCard(
  step: Pick<ReelStep, "label" | "playerOverlay">,
): ReelStatCard | null {
  const overlay = step.playerOverlay?.trim();
  if (!overlay) return null;
  const lines = overlay
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const label = step.label?.trim();
  const headline =
    label && /goal|assist/i.test(label)
      ? label
      : lines.length > 1
        ? "Goal + Assist"
        : undefined;
  return { ...(headline ? { headline } : {}), lines };
}

export type ReelInterstitial =
  | ({ kind: "title" } & ReelTitleCard)
  | ({ kind: "stat" } & ReelStatCard)
  | ({ kind: "thanks" } & ReelThankYouCard);

export function statInterstitialFromStep(
  step: ReelStep | undefined,
): ReelInterstitial | null {
  if (!step) return null;
  const card = buildReelStatCard(step);
  if (!card) return null;
  return { kind: "stat", ...card };
}
