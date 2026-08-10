import type { GameTimelineEvent } from "@/lib/games";
import { isGoalTimelineEvent } from "@/lib/goal-lookback";

export type ScoreDelta = { home: number; away: number };

export type ScoreboardState = {
  home: number;
  away: number;
  homeName: string;
  awayName: string;
};

export type ScoreboardTick = {
  /** Game time when this score becomes active. */
  t: number;
  home: number;
  away: number;
};

/** When this event changes the scoreboard (null = non-scoring). */
export function scoreDeltaForTimelineEvent(
  ev: Pick<GameTimelineEvent, "label" | "type" | "payload">,
): ScoreDelta | null {
  const payload =
    ev.payload && typeof ev.payload === "object" ? ev.payload : {};
  const gameCapType =
    typeof payload.gameCapType === "string"
      ? payload.gameCapType.trim()
      : "";
  const opponent =
    payload.opponent === true ||
    /opponent|other team/i.test(ev.label ?? "") ||
    /^opponent/i.test(gameCapType);

  switch (gameCapType) {
    case "goal":
      return opponent ? { home: 0, away: 1 } : { home: 1, away: 0 };
    case "ownGoal":
      return { home: 0, away: 1 };
    case "opponentGoal":
      return { home: 0, away: 1 };
    case "madeBasket":
      return opponent ? { home: 0, away: 2 } : { home: 2, away: 0 };
    case "opponentMadeBasket":
      return { home: 0, away: 2 };
    case "threePointer":
      return opponent ? { home: 0, away: 3 } : { home: 3, away: 0 };
    case "opponentThreePointer":
      return { home: 0, away: 3 };
    case "touchdown":
      return opponent ? { home: 0, away: 6 } : { home: 6, away: 0 };
    case "opponentTouchdown":
      return { home: 0, away: 6 };
    case "fieldGoal":
      return opponent ? { home: 0, away: 3 } : { home: 3, away: 0 };
    default:
      break;
  }

  const aiKind =
    typeof payload.aiKind === "string" ? payload.aiKind.trim() : "";
  const statType =
    typeof payload.statType === "string"
      ? payload.statType.trim().toLowerCase()
      : "";

  if (aiKind === "goal" || statType === "goal" || isGoalTimelineEvent(ev)) {
    if (opponent) return { home: 0, away: 1 };
    if (aiKind === "three_pointer" || statType === "three_pointer") {
      return { home: 3, away: 0 };
    }
    if (aiKind === "field_goal" || statType === "field_goal") {
      return { home: 2, away: 0 };
    }
    return { home: 1, away: 0 };
  }

  if (aiKind === "three_pointer" || statType === "three_pointer") {
    return opponent ? { home: 0, away: 3 } : { home: 3, away: 0 };
  }
  if (aiKind === "field_goal" || statType === "field_goal") {
    return opponent ? { home: 0, away: 2 } : { home: 2, away: 0 };
  }

  return null;
}

/** Prefer original Game Cap press time when lookback shifted `t`. */
export function scoringGameTime(ev: GameTimelineEvent): number {
  const payload =
    ev.payload && typeof ev.payload === "object" ? ev.payload : {};
  if (
    typeof payload.markedAtSec === "number" &&
    Number.isFinite(payload.markedAtSec)
  ) {
    return Math.max(0, payload.markedAtSec);
  }
  return Math.max(0, ev.t);
}

/** Cumulative score ticks sorted by game time. */
export function buildScoreboardTicks(
  events: GameTimelineEvent[],
): ScoreboardTick[] {
  const scoring = events
    .map((ev) => {
      const delta = scoreDeltaForTimelineEvent(ev);
      if (!delta) return null;
      return { t: scoringGameTime(ev), delta };
    })
    .filter((x): x is { t: number; delta: ScoreDelta } => x != null)
    .sort((a, b) => a.t - b.t);

  const ticks: ScoreboardTick[] = [{ t: 0, home: 0, away: 0 }];
  let home = 0;
  let away = 0;
  for (const row of scoring) {
    home = Math.max(0, home + row.delta.home);
    away = Math.max(0, away + row.delta.away);
    const last = ticks[ticks.length - 1]!;
    if (Math.abs(last.t - row.t) < 0.05) {
      last.home = home;
      last.away = away;
    } else {
      ticks.push({ t: row.t, home, away });
    }
  }
  return ticks;
}

/** Score effective at `gameTime` (inclusive of events at that instant). */
export function scoreboardAtGameTime(
  ticks: ScoreboardTick[],
  gameTime: number,
  names: { homeName: string; awayName: string },
): ScoreboardState {
  let home = 0;
  let away = 0;
  for (const tick of ticks) {
    if (tick.t - 1e-6 > gameTime) break;
    home = tick.home;
    away = tick.away;
  }
  return {
    home,
    away,
    homeName: names.homeName.trim() || "Home",
    awayName: names.awayName.trim() || "Away",
  };
}

/** Team / opponent labels for the HUD (home left, away right). */
export function scoreboardNamesForGame(
  game: {
    homeTeam?: string;
    awayTeam?: string;
    opponent?: string;
  },
  teamName?: string | null,
): { homeName: string; awayName: string } {
  return {
    homeName: teamName?.trim() || game.homeTeam?.trim() || "Home",
    awayName:
      game.opponent?.trim() || game.awayTeam?.trim() || "Away",
  };
}

/**
 * Map source playback time on a reel step back to game time
 * (`sourceTime = gameTime + offset`).
 */
export function gameTimeFromReelPlayback(
  step: { sourceStartTime: number; gameStartTime?: number },
  sourcePlaybackSec: number,
): number | null {
  if (
    typeof step.gameStartTime !== "number" ||
    !Number.isFinite(step.gameStartTime)
  ) {
    return null;
  }
  return Math.max(
    0,
    step.gameStartTime + (sourcePlaybackSec - step.sourceStartTime),
  );
}
