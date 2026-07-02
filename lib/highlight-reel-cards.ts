import type { Game } from "@/lib/games";
import type { Team } from "@/lib/teams";
import type { ReelStep } from "@/lib/highlight-draft";

export const REEL_TITLE_HOLD_MS = 2800;
export const REEL_STAT_HOLD_MS = 1600;

export type ReelTitleCard = {
  headline: string;
  subtitle?: string;
  logoUrl?: string;
};

export type ReelStatCard = {
  headline?: string;
  lines: string[];
};

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

/** Title card shown on black before the reel starts. */
export function buildReelTitleCard(
  game: Game,
  team: Pick<Team, "name" | "logoUrl"> | null,
  reelName?: string,
): ReelTitleCard {
  const teamName = team?.name?.trim() ?? game.homeTeam?.trim();
  const opponent = game.opponent?.trim() ?? game.awayTeam?.trim();
  const headline =
    reelName?.trim() ||
    game.title?.trim() ||
    (teamName && opponent ? `${teamName} vs ${opponent}` : teamName) ||
    "Highlights";

  const meta: string[] = [];
  if (teamName && opponent && !headline.toLowerCase().includes(opponent.toLowerCase())) {
    meta.push(`${teamName} vs ${opponent}`);
  } else if (teamName && !headline.toLowerCase().includes(teamName.toLowerCase())) {
    meta.push(teamName);
  }
  if (game.date?.trim()) meta.push(formatGameDate(game.date));
  if (game.location?.trim()) meta.push(game.location.trim());

  return {
    headline,
    ...(meta.length > 0 ? { subtitle: meta.join(" · ") } : {}),
    ...(team?.logoUrl?.trim() ? { logoUrl: team.logoUrl.trim() } : {}),
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
  | ({ kind: "stat" } & ReelStatCard);

export function statInterstitialFromStep(
  step: ReelStep | undefined,
): ReelInterstitial | null {
  if (!step) return null;
  const card = buildReelStatCard(step);
  if (!card) return null;
  return { kind: "stat", ...card };
}
