/**
 * Sport-aware review quick-tags and opponent marks.
 * Maps coach-facing labels onto GameStatType where applicable.
 */

import type { GameStatType } from "@/lib/game-stats";
import { getSportById, normalizeSportId, type SportDef } from "@/lib/sports";

export type ReviewQuickTag =
  | { label: string; kind: "stat"; statType: GameStatType }
  | { label: string; kind: "mark"; opponent?: boolean };

const SOCCER_STAT_TAGS: ReviewQuickTag[] = [
  { label: "Goal", kind: "stat", statType: "goal" },
  { label: "Shot", kind: "stat", statType: "shot" },
  { label: "Save", kind: "stat", statType: "save" },
  { label: "Assist", kind: "stat", statType: "assist" },
  { label: "Foul", kind: "stat", statType: "foul" },
];

const SOCCER_MARK_TAGS: ReviewQuickTag[] = [
  { label: "Corner", kind: "mark" },
  { label: "Great play", kind: "mark" },
];

const SOCCER_OPPONENT_TAGS: ReviewQuickTag[] = [
  { label: "Other team goal", kind: "mark", opponent: true },
  { label: "Other team corner", kind: "mark", opponent: true },
];

const BASKETBALL_STAT_TAGS: ReviewQuickTag[] = [
  { label: "Bucket", kind: "stat", statType: "field_goal" },
  { label: "3PT", kind: "stat", statType: "three_pointer" },
  { label: "Assist", kind: "stat", statType: "assist" },
  { label: "Rebound", kind: "stat", statType: "rebound" },
  { label: "Steal", kind: "stat", statType: "steal" },
  { label: "Block", kind: "stat", statType: "block" },
  { label: "Turnover", kind: "stat", statType: "turnover" },
  { label: "Foul", kind: "stat", statType: "foul" },
];

const BASKETBALL_MARK_TAGS: ReviewQuickTag[] = [
  { label: "Inbound", kind: "mark" },
  { label: "Great play", kind: "mark" },
];

const BASKETBALL_OPPONENT_TAGS: ReviewQuickTag[] = [
  { label: "Other team bucket", kind: "mark", opponent: true },
  { label: "Other team 3PT", kind: "mark", opponent: true },
];

export function reviewTagsForSport(sportRaw: string | null | undefined): {
  quickTags: ReviewQuickTag[];
  markTags: ReviewQuickTag[];
  opponentTags: ReviewQuickTag[];
  sport: SportDef;
  sportId: string;
} {
  const sportId = normalizeSportId(sportRaw) ?? "soccer";
  const sport = getSportById(sportId);
  if (sportId === "basketball") {
    return {
      quickTags: BASKETBALL_STAT_TAGS,
      markTags: BASKETBALL_MARK_TAGS,
      opponentTags: BASKETBALL_OPPONENT_TAGS,
      sport,
      sportId,
    };
  }
  return {
    quickTags: SOCCER_STAT_TAGS,
    markTags: SOCCER_MARK_TAGS,
    opponentTags: SOCCER_OPPONENT_TAGS,
    sport,
    sportId,
  };
}

/** Stat types that count as scoring (for assist pairing UI). */
export function isScoringStatType(statType: string | undefined): boolean {
  return (
    statType === "goal" ||
    statType === "field_goal" ||
    statType === "three_pointer"
  );
}
