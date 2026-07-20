import {
  recommendAcademyContent,
  type AcademyRecommendationContent,
} from "@/lib/academy/recommendations";
import { resolveGoalsForEvidenceTags } from "@/lib/academy/film-evidence";
import type {
  AcademyFieldSize,
  AcademyGamePlanGenerationRequest,
  AcademyGoal,
  AcademyGoalGraphCatalog,
  AcademyPracticeSection,
  AcademyPracticeSectionKind,
  GeneratedAcademyGamePlan,
  GeneratedAcademyPractice,
  PracticeGenerationRequest,
} from "@/lib/academy/types";

const SECTION_ORDER: AcademyPracticeSectionKind[] = [
  "warm_up",
  "technical",
  "small_group",
  "conditioned_game",
  "scrimmage",
  "reflection",
];

const SECTION_LABELS: Record<AcademyPracticeSectionKind, string> = {
  warm_up: "Warm-up",
  technical: "Technical",
  small_group: "Small Group",
  conditioned_game: "Conditioned Game",
  scrimmage: "Scrimmage",
  reflection: "Reflection",
};

const BASE_SECTION_MINUTES: Record<AcademyPracticeSectionKind, number> = {
  warm_up: 10,
  technical: 15,
  small_group: 15,
  conditioned_game: 15,
  scrimmage: 15,
  reflection: 5,
};

const MIN_SECTION_MINUTES: Record<AcademyPracticeSectionKind, number> = {
  warm_up: 5,
  technical: 8,
  small_group: 8,
  conditioned_game: 9,
  scrimmage: 10,
  reflection: 5,
};

function scaleSectionMinutes(
  totalMinutes: 45 | 60 | 75 | 90,
): Record<AcademyPracticeSectionKind, number> {
  const minimumTotal = SECTION_ORDER.reduce(
    (sum, section) => sum + MIN_SECTION_MINUTES[section],
    0,
  );
  const baseExtraTotal = SECTION_ORDER.reduce(
    (sum, section) =>
      sum + BASE_SECTION_MINUTES[section] - MIN_SECTION_MINUTES[section],
    0,
  );
  const distributable = totalMinutes - minimumTotal;
  const allocations = SECTION_ORDER.map((section, index) => {
    const exactExtra =
      ((BASE_SECTION_MINUTES[section] - MIN_SECTION_MINUTES[section]) /
        baseExtraTotal) *
      distributable;
    return {
      section,
      index,
      minutes: MIN_SECTION_MINUTES[section] + Math.floor(exactExtra),
      remainder: exactExtra - Math.floor(exactExtra),
    };
  });
  let remaining =
    totalMinutes -
    allocations.reduce((sum, allocation) => sum + allocation.minutes, 0);
  for (const allocation of [...allocations].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  )) {
    if (remaining <= 0) break;
    allocation.minutes += 1;
    remaining -= 1;
  }
  return Object.fromEntries(
    allocations.map((allocation) => [
      allocation.section,
      allocation.minutes,
    ]),
  ) as Record<AcademyPracticeSectionKind, number>;
}

function ageFromBand(ageBand: string): number {
  const ages = [...ageBand.matchAll(/\d+/g)].map((match) => Number(match[0]));
  return ages.length ? Math.max(...ages) : 12;
}

function completeFieldSize(
  fieldSize: PracticeGenerationRequest["fieldSize"],
): AcademyFieldSize | undefined {
  if (
    !fieldSize ||
    typeof fieldSize.length !== "number" ||
    typeof fieldSize.width !== "number"
  ) {
    return undefined;
  }
  return {
    length: fieldSize.length,
    width: fieldSize.width,
    unit: fieldSize.unit,
  };
}

function selectedGoals(
  catalog: AcademyGoalGraphCatalog,
  ids: readonly string[],
): AcademyGoal[] {
  const goalById = new Map(catalog.goals.map((goal) => [goal.id, goal]));
  return ids
    .map((id) => goalById.get(id))
    .filter((goal): goal is AcademyGoal => Boolean(goal));
}

function goalPrompts(goals: readonly AcademyGoal[]): string[] {
  return goals.flatMap((goal) => [
    `Where did we see ${goal.title.toLowerCase()} today?`,
    `What will help us recognize the next ${goal.title.toLowerCase()} moment?`,
  ]);
}

/**
 * Create a complete deterministic practice from goal IDs and drill metadata.
 * Existing tactics presets remain the drill source; this output stores refs.
 */
export function generateDeterministicPractice(
  catalog: AcademyGoalGraphCatalog,
  request: PracticeGenerationRequest,
  content: AcademyRecommendationContent = {},
): GeneratedAcademyPractice {
  const primaryGoalIds = [...new Set(request.primaryGoalIds)];
  const supportingGoalIds = [...new Set(request.supportingGoalIds ?? [])].filter(
    (id) => !primaryGoalIds.includes(id),
  );
  const goals = selectedGoals(catalog, primaryGoalIds);
  const durationBySection = scaleSectionMinutes(request.durationMinutes);
  const fieldSize = completeFieldSize(request.fieldSize);
  const warnings: string[] = [];
  const usedDrillIds: string[] = [];
  const sections: AcademyPracticeSection[] = [];
  const age = ageFromBand(request.ageBand);

  for (const kind of SECTION_ORDER) {
    const durationMinutes = durationBySection[kind];
    if (kind === "reflection") {
      sections.push({
        id: "reflection",
        kind,
        title: SECTION_LABELS[kind],
        durationMinutes,
        developmentGoalIds: primaryGoalIds,
        academyLessonIds: [],
        coachingPoints: goals.flatMap((goal) => goal.coachCues).slice(0, 3),
        setupInstructions: [
          "Bring players together where they can see and hear one another.",
          "Use one observed practice moment before asking for player reflection.",
        ],
        progressions: [],
        regressions: [],
        reflectionPrompts: goalPrompts(goals).slice(0, 4),
      });
      continue;
    }

    const recommendations = recommendAcademyContent(
      catalog,
      {
        selectedGoalIds: primaryGoalIds,
        supportingGoalIds,
        age,
        rosterSize: request.playerCount,
        goalkeeperCount: request.goalkeeperCount,
        fieldSize,
        availableEquipment: request.availableEquipment,
        section: kind,
        excludeDrillIds: usedDrillIds,
        limit: 1,
      },
      content,
    );
    warnings.push(...recommendations.warnings);
    const drill = recommendations.drills[0];
    if (!drill) {
      sections.push({
        id: kind,
        kind,
        title: SECTION_LABELS[kind],
        durationMinutes,
        developmentGoalIds: primaryGoalIds,
        academyLessonIds: recommendations.lessons
          .slice(0, 1)
          .map((lesson) => lesson.id),
        coachingPoints: goals.flatMap((goal) => goal.coachCues).slice(0, 4),
        setupInstructions: [
          "Coach selects or adapts a safe activity that directly trains the selected goals.",
        ],
        progressions: [],
        regressions: [],
      });
      continue;
    }

    usedDrillIds.push(drill.id);
    const sectionGoalIds = drill.developmentGoalIds.filter(
      (goalId) =>
        primaryGoalIds.includes(goalId) || supportingGoalIds.includes(goalId),
    );
    sections.push({
      id: kind,
      kind,
      title: `${SECTION_LABELS[kind]} · ${drill.title}`,
      durationMinutes,
      developmentGoalIds: sectionGoalIds.length
        ? sectionGoalIds
        : primaryGoalIds,
      drillId: drill.id,
      ...(drill.sourcePresetId
        ? { sourcePresetId: drill.sourcePresetId }
        : {}),
      academyLessonIds: recommendations.lessons
        .slice(0, 1)
        .map((lesson) => lesson.id),
      coachingPoints: drill.coachingCues.slice(0, 4),
      setupInstructions: drill.setupInstructions.slice(0, 4),
      progressions: drill.progressions,
      regressions: drill.regressions,
    });
  }

  return {
    id: `practice-${request.durationMinutes}-${primaryGoalIds.join("-")}`,
    title:
      goals.length > 0
        ? `${request.ageBand} · ${goals.map((goal) => goal.title).join(" + ")}`
        : `${request.ageBand} goal-led practice`,
    ageBand: request.ageBand,
    durationMinutes: request.durationMinutes,
    rosterSize: request.playerCount,
    ...(fieldSize ? { fieldSize } : {}),
    availableEquipment: [...(request.availableEquipment ?? [])],
    primaryGoalIds,
    supportingGoalIds,
    sections,
    recommendationWarnings: [...new Set(warnings)],
    generatedBy: "deterministic",
  };
}

/**
 * Template-first game plan. Previous evidence contributes only after its
 * confirmed tags resolve to Development Goals.
 */
export function generateDeterministicGamePlan(
  catalog: AcademyGoalGraphCatalog,
  request: AcademyGamePlanGenerationRequest,
): GeneratedAcademyGamePlan {
  const evidenceGoals = resolveGoalsForEvidenceTags(
    catalog,
    request.previousGameEvidenceTagIds ?? [],
  );
  const selectedGoalIds = [...new Set(request.selectedGoalIds)];
  const goalIds = [
    ...new Set([...selectedGoalIds, ...evidenceGoals.map((goal) => goal.id)]),
  ];
  const goals = selectedGoals(catalog, goalIds);
  const transitionGoals = goals.filter((goal) =>
    ["transition-to-attack", "transition-to-defense"].includes(goal.domainId),
  );
  const formationRelevant = goals.filter((goal) =>
    [
      "support-width-depth",
      "building-from-goalkeeper",
      "team-defending",
    ].includes(goal.domainId),
  );
  const titleGoals = goals.slice(0, 2).map((goal) => goal.title);

  return {
    id: `game-plan-${goalIds.join("-")}`,
    title: titleGoals.length
      ? `Game Plan · ${titleGoals.join(" + ")}`
      : "Development Goal Game Plan",
    ageBand: request.ageBand,
    selectedGoalIds,
    evidenceGoalIds: evidenceGoals.map((goal) => goal.id),
    ...(request.opponentNotes?.trim()
      ? { opponentNotes: request.opponentNotes.trim() }
      : {}),
    pregameObjectives: goals
      .slice(0, 3)
      .map((goal) => `${goal.title}: ${goal.description}`),
    coachingFocus: goals
      .slice(0, 3)
      .flatMap((goal) => goal.coachCues.slice(0, 1)),
    keyReminders: goals.flatMap((goal) => goal.principles).slice(0, 5),
    warmUpFocus: goals.slice(0, 2).map(
      (goal) =>
        `Rehearse ${goal.title.toLowerCase()} with the cue: ${
          goal.coachCues[0] ?? goal.title
        }`,
    ),
    ...(request.formationName || formationRelevant.length
      ? {
          formationNotes: [
            ...(request.formationName
              ? [`Base formation: ${request.formationName}.`]
              : []),
            ...formationRelevant
              .slice(0, 3)
              .map(
                (goal) =>
                  `${goal.title}: ${goal.observableIndicators[0] ?? goal.description}`,
              ),
          ],
        }
      : {}),
    transitionEmphasis:
      transitionGoals.length > 0
        ? transitionGoals
            .slice(0, 3)
            .map(
              (goal) =>
                `${goal.title}: ${goal.coachCues[0] ?? goal.description}`,
            )
        : [
            "When possession changes, recognize the next role before chasing the ball.",
          ],
    benchReminders: goals
      .slice(0, 4)
      .flatMap((goal) => goal.coachFeedbackExamples.slice(0, 1)),
    halftimeDiscussionPoints: goals.slice(0, 3).map(
      (goal) =>
        `Where have we seen ${goal.title.toLowerCase()}? What visible evidence supports that?`,
    ),
    postgameReflectionPrompts: goals.slice(0, 3).map(
      (goal) =>
        `Identify one positive example and one next step for ${goal.title.toLowerCase()}.`,
    ),
    generatedBy: "deterministic",
  };
}

