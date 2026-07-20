import { DRILL_PRESETS } from "@/lib/tactics-presets/drills";
import type {
  AcademyDrillMetadata,
  AcademyFieldSize,
  AcademyPracticeSectionKind,
} from "@/lib/academy/types";
import type {
  DrillVariation,
  TacticsPreset,
} from "@/lib/tactics-presets/types";

type DrillOverlay = {
  goalIds: string[];
  sections: AcademyPracticeSectionKind[];
  minimumFieldSize: AcademyFieldSize;
};

const BALL_MASTERY_GOALS = [
  "u12-control-across-surfaces",
  "u12-change-speed-direction",
  "u12-shield-and-retain",
  "u12-escape-double-pressure",
];
const RECEIVING_GOALS = [
  "u12-receive-open-body",
  "u12-first-touch-away-pressure",
  "u12-receive-between-lines",
  "u12-receive-aerial-ball",
];
const PASSING_GOALS = [
  "u12-pass-weight-accuracy",
  "u12-wall-pass-combination",
  "u12-third-player-combination",
  "u12-switch-point-attack",
];
const SCANNING_GOALS = [
  "u12-scan-before-receiving",
  "u12-scan-beyond-next-action",
  "u12-choose-progress-retain",
  "u12-recognize-overload-isolation",
];
const SUPPORT_GOALS = [
  "u12-support-angle-distance",
  "u12-use-full-team-width",
  "u12-provide-penetrating-depth",
  "u12-balance-behind-ball",
];
const ATTACKING_DUEL_GOALS = [
  "u12-attack-defender-front-foot",
  "u12-protect-after-beating",
  "u12-isolate-wide-defender",
  "u12-choose-dribble-pass",
];
const DEFENDING_DUEL_GOALS = [
  "u12-delay-and-show",
  "u12-defend-ball-side",
  "u12-time-defensive-challenge",
  "u12-recover-goal-side",
];
const BUILDUP_GOALS = [
  "u12-gk-starting-shape",
  "u12-play-around-first-press",
  "u12-play-through-first-press",
  "u12-buildup-exit-pressure",
];
const FINISHING_GOALS = [
  "u12-create-cutback-lane",
  "u12-time-penalty-area-runs",
  "u12-finish-first-time",
  "u12-finish-under-pressure",
];
const TEAM_DEFENDING_GOALS = [
  "u12-protect-central-space",
  "u12-pressure-cover-balance",
  "u12-shift-as-unit",
  "u12-defend-crosses-box",
];
const ATTACKING_TRANSITION_GOALS = [
  "u12-first-look-forward-regain",
  "u12-spread-after-regain",
  "u12-break-line-in-transition",
  "u12-secure-transition-if-closed",
];
const DEFENDING_TRANSITION_GOALS = [
  "u12-react-immediately-loss",
  "u12-counterpress-near-ball",
  "u12-protect-center-after-loss",
  "u12-delay-counterattack",
];
const GOALKEEPING_GOALS = [
  "u12-gk-set-position",
  "u12-gk-handle-and-parry",
  "u12-gk-distribute-decision",
];
const LEADERSHIP_GOALS = [
  "u12-communicate-specific-information",
  "u12-organize-restarts",
  "u12-lead-through-response",
];
const REFLECTION_GOALS = [
  "u12-explain-game-decision",
  "u12-review-observable-evidence",
  "u12-set-transfer-action",
];

const OVERLAYS: Record<string, DrillOverlay> = {
  "drill-ball-mastery-grid": {
    goalIds: [...BALL_MASTERY_GOALS, SCANNING_GOALS[0]],
    sections: ["warm_up", "technical"],
    minimumFieldSize: { length: 12, width: 12, unit: "yards" },
  },
  "drill-passing-gates-pairs": {
    goalIds: [
      ...RECEIVING_GOALS.slice(0, 2),
      PASSING_GOALS[0],
      SCANNING_GOALS[0],
      LEADERSHIP_GOALS[0],
    ],
    sections: ["warm_up", "technical"],
    minimumFieldSize: { length: 20, width: 20, unit: "yards" },
  },
  "drill-passing-diamond": {
    goalIds: [
      RECEIVING_GOALS[0],
      PASSING_GOALS[0],
      PASSING_GOALS[1],
      SCANNING_GOALS[1],
      SUPPORT_GOALS[0],
    ],
    sections: ["technical", "small_group"],
    minimumFieldSize: { length: 12, width: 12, unit: "yards" },
  },
  "drill-rondo-4v1": {
    goalIds: [
      RECEIVING_GOALS[0],
      RECEIVING_GOALS[1],
      PASSING_GOALS[0],
      SCANNING_GOALS[0],
      SUPPORT_GOALS[0],
      DEFENDING_DUEL_GOALS[0],
      DEFENDING_TRANSITION_GOALS[0],
    ],
    sections: ["small_group", "conditioned_game"],
    minimumFieldSize: { length: 10, width: 10, unit: "yards" },
  },
  "drill-rondo-5v2": {
    goalIds: [
      RECEIVING_GOALS[2],
      PASSING_GOALS[2],
      SCANNING_GOALS[0],
      SCANNING_GOALS[2],
      SCANNING_GOALS[3],
      SUPPORT_GOALS[0],
      TEAM_DEFENDING_GOALS[1],
    ],
    sections: ["small_group", "conditioned_game"],
    minimumFieldSize: { length: 14, width: 12, unit: "yards" },
  },
  "drill-3v1-transition-box": {
    goalIds: [
      SUPPORT_GOALS[0],
      ATTACKING_TRANSITION_GOALS[0],
      ATTACKING_TRANSITION_GOALS[2],
      DEFENDING_TRANSITION_GOALS[0],
      DEFENDING_TRANSITION_GOALS[1],
    ],
    sections: ["small_group", "conditioned_game"],
    minimumFieldSize: { length: 20, width: 12, unit: "yards" },
  },
  "drill-2v1-to-goal": {
    goalIds: [
      ATTACKING_DUEL_GOALS[0],
      ATTACKING_DUEL_GOALS[3],
      SUPPORT_GOALS[0],
      FINISHING_GOALS[2],
      FINISHING_GOALS[3],
      DEFENDING_DUEL_GOALS[0],
      GOALKEEPING_GOALS[0],
      GOALKEEPING_GOALS[1],
    ],
    sections: ["technical", "small_group", "conditioned_game"],
    minimumFieldSize: { length: 28, width: 20, unit: "yards" },
  },
  "drill-3v2-to-goal": {
    goalIds: [
      SCANNING_GOALS[3],
      SUPPORT_GOALS[1],
      SUPPORT_GOALS[2],
      ATTACKING_DUEL_GOALS[3],
      DEFENDING_DUEL_GOALS[0],
      FINISHING_GOALS[2],
      TEAM_DEFENDING_GOALS[0],
      GOALKEEPING_GOALS[0],
    ],
    sections: ["small_group", "conditioned_game"],
    minimumFieldSize: { length: 30, width: 25, unit: "yards" },
  },
  "drill-four-goal-directional": {
    goalIds: [
      RECEIVING_GOALS[0],
      PASSING_GOALS[3],
      SCANNING_GOALS[0],
      SCANNING_GOALS[2],
      SUPPORT_GOALS[1],
      SUPPORT_GOALS[3],
      TEAM_DEFENDING_GOALS[2],
      LEADERSHIP_GOALS[0],
    ],
    sections: ["conditioned_game", "scrimmage"],
    minimumFieldSize: { length: 30, width: 25, unit: "yards" },
  },
  "drill-end-zone-possession": {
    goalIds: [
      RECEIVING_GOALS[2],
      SCANNING_GOALS[2],
      SUPPORT_GOALS[1],
      SUPPORT_GOALS[2],
      ATTACKING_TRANSITION_GOALS[3],
      DEFENDING_TRANSITION_GOALS[2],
    ],
    sections: ["conditioned_game", "scrimmage"],
    minimumFieldSize: { length: 35, width: 25, unit: "yards" },
  },
  "drill-4v4-plus-neutrals": {
    goalIds: [
      ...RECEIVING_GOALS.slice(0, 3),
      PASSING_GOALS[1],
      PASSING_GOALS[2],
      ...SCANNING_GOALS,
      SCANNING_GOALS[3],
      SUPPORT_GOALS[0],
      ATTACKING_TRANSITION_GOALS[1],
      DEFENDING_TRANSITION_GOALS[1],
      ...REFLECTION_GOALS,
    ],
    sections: ["conditioned_game", "scrimmage"],
    minimumFieldSize: { length: 35, width: 25, unit: "yards" },
  },
  "drill-buildout-directional": {
    goalIds: [
      ...BUILDUP_GOALS,
      PASSING_GOALS[3],
      SUPPORT_GOALS[1],
      SUPPORT_GOALS[3],
      SCANNING_GOALS[2],
      GOALKEEPING_GOALS[2],
      LEADERSHIP_GOALS[1],
    ],
    sections: ["small_group", "conditioned_game", "scrimmage"],
    minimumFieldSize: { length: 50, width: 35, unit: "yards" },
  },
  "drill-pressure-cover-balance": {
    goalIds: [
      ...DEFENDING_DUEL_GOALS,
      ...TEAM_DEFENDING_GOALS,
      DEFENDING_TRANSITION_GOALS[2],
      DEFENDING_TRANSITION_GOALS[3],
      LEADERSHIP_GOALS[0],
      LEADERSHIP_GOALS[2],
    ],
    sections: ["small_group", "conditioned_game"],
    minimumFieldSize: { length: 25, width: 20, unit: "yards" },
  },
  "drill-transition-four-mini-goals": {
    goalIds: [
      ...ATTACKING_TRANSITION_GOALS,
      ...DEFENDING_TRANSITION_GOALS,
      SUPPORT_GOALS[3],
      TEAM_DEFENDING_GOALS[0],
      LEADERSHIP_GOALS[0],
    ],
    sections: ["conditioned_game", "scrimmage"],
    minimumFieldSize: { length: 30, width: 25, unit: "yards" },
  },
  "drill-finishing-cutback": {
    goalIds: [
      ...FINISHING_GOALS,
      ATTACKING_DUEL_GOALS[1],
      ATTACKING_DUEL_GOALS[2],
      TEAM_DEFENDING_GOALS[3],
      GOALKEEPING_GOALS[0],
      GOALKEEPING_GOALS[1],
    ],
    sections: ["technical", "small_group", "conditioned_game"],
    minimumFieldSize: { length: 30, width: 25, unit: "yards" },
  },
};

function equipmentNames(preset: TacticsPreset): string[] {
  if (!preset.equipment) return [];
  const names: string[] = [];
  if (preset.equipment.balls) names.push("balls");
  if (preset.equipment.cones) names.push("cones");
  if (preset.equipment.pinnies) names.push("pinnies");
  if (preset.equipment.goals) names.push("goals");
  if (preset.equipment.miniGoals) names.push("mini goals");
  return names;
}

function normalizeVariation(
  value: DrillVariation | string,
  index: number,
): { title: string; description: string } {
  return typeof value === "string"
    ? { title: `Variation ${index + 1}`, description: value }
    : value;
}

function toMetadata(preset: TacticsPreset): AcademyDrillMetadata {
  const overlay = OVERLAYS[preset.id];
  if (!overlay) {
    throw new Error(`Missing Academy metadata overlay for ${preset.id}`);
  }
  const groupSize = preset.playerCount ?? 2;
  return {
    id: preset.id,
    canonicalObjectId: preset.id,
    sourcePresetId: preset.id,
    title: preset.title,
    developmentGoalIds: [...new Set(overlay.goalIds)],
    ageRange: { min: 8, max: 18 },
    difficulty: preset.difficulty,
    equipment: equipmentNames(preset),
    players: {
      minimumRoster: Math.max(2, groupSize - 2),
      groupSize,
      goalkeeperCount: preset.goalkeeperCount ?? 0,
    },
    minimumFieldSize: overlay.minimumFieldSize,
    durationMinutes: preset.estimatedMinutes ?? 15,
    setupInstructions: [...preset.setupInstructions],
    coachingCues: [...preset.coachingPoints],
    commonErrors: (preset.commonMistakes ?? []).map((mistake) => ({
      error: mistake.mistake,
      ...(mistake.correction ? { correction: mistake.correction } : {}),
    })),
    progressions: (preset.progressions ?? []).map(normalizeVariation),
    regressions: (preset.regressions ?? []).map(normalizeVariation),
    suitableSections: [...overlay.sections],
    editorialStatus:
      preset.editorialMetadata?.contentStatus === "reviewed"
        ? "reviewed"
        : "internal_draft",
  };
}

/**
 * Original Film Room seed activities. The tactics presets hold their authored
 * diagrams; this Academy crosswalk is the canonical generation boundary.
 */
export const CANONICAL_SEED_ACTIVITY_CATALOG: readonly AcademyDrillMetadata[] =
  DRILL_PRESETS.map(toMetadata);

export const ACADEMY_DRILL_CATALOG = CANONICAL_SEED_ACTIVITY_CATALOG;

export function getAcademyDrillPreset(
  drillId: string,
): TacticsPreset | null {
  return DRILL_PRESETS.find((preset) => preset.id === drillId) ?? null;
}

