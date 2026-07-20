import { ACADEMY_RUNTIME_DRILL_CATALOG } from "@/lib/academy/published-catalog";
import type {
  AcademyAssignmentTemplate,
  AcademyDrillMetadata,
  AcademyFieldSize,
  AcademyGoal,
  AcademyGoalGraphCatalog,
  AcademyPracticeSectionKind,
  AcademyQuiz,
  AcademyTacticalLesson,
} from "@/lib/academy/types";

export type AcademyRecommendationRequest = {
  selectedGoalIds: string[];
  supportingGoalIds?: string[];
  age: number;
  rosterSize: number;
  goalkeeperCount: number;
  fieldSize?: AcademyFieldSize;
  availableEquipment?: string[];
  section?: AcademyPracticeSectionKind;
  excludeDrillIds?: string[];
  limit?: number;
};

export type AcademyRecommendations = {
  goals: AcademyGoal[];
  relatedGoals: AcademyGoal[];
  drills: AcademyDrillMetadata[];
  lessons: AcademyTacticalLesson[];
  assignments: AcademyAssignmentTemplate[];
  quizzes: AcademyQuiz[];
  warnings: string[];
};

export type AcademyRecommendationContent = {
  drills?: readonly AcademyDrillMetadata[];
  lessons?: readonly AcademyTacticalLesson[];
  assignments?: readonly AcademyAssignmentTemplate[];
  quizzes?: readonly AcademyQuiz[];
};

function toYards(size: AcademyFieldSize): AcademyFieldSize {
  if (size.unit === "yards") return size;
  return {
    length: size.length * 1.09361,
    width: size.width * 1.09361,
    unit: "yards",
  };
}

function fieldFits(
  available: AcademyFieldSize | undefined,
  required: AcademyFieldSize,
): boolean {
  if (!available) return true;
  const availableYards = toYards(available);
  const requiredYards = toYards(required);
  return (
    availableYards.length >= requiredYards.length &&
    availableYards.width >= requiredYards.width
  );
}

function equipmentFits(
  available: readonly string[] | undefined,
  required: readonly string[],
): boolean {
  if (!available) return true;
  const normalized = new Set(
    available.map((item) => item.trim().toLowerCase()),
  );
  return required.every((item) => normalized.has(item.toLowerCase()));
}

function contentSupportsGoals(
  contentGoalIds: readonly string[],
  selectedGoalIds: ReadonlySet<string>,
  relatedGoalIds: ReadonlySet<string>,
): number {
  let score = 0;
  for (const goalId of contentGoalIds) {
    if (selectedGoalIds.has(goalId)) score += 100;
    else if (relatedGoalIds.has(goalId)) score += 15;
  }
  return score;
}

function rankGoalLinkedContent<T extends { id: string; goalIds: string[] }>(
  records: readonly T[],
  selectedGoalIds: ReadonlySet<string>,
  relatedGoalIds: ReadonlySet<string>,
): T[] {
  return records
    .map((record, index) => ({
      record,
      index,
      score: contentSupportsGoals(
        record.goalIds,
        selectedGoalIds,
        relatedGoalIds,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.record);
}

/**
 * Deterministic goal-first content recommendations. No clip or free-text input
 * reaches content retrieval until it has already resolved to goal IDs.
 */
export function recommendAcademyContent(
  catalog: AcademyGoalGraphCatalog,
  request: AcademyRecommendationRequest,
  content: AcademyRecommendationContent = {},
): AcademyRecommendations {
  const goalById = new Map(catalog.goals.map((goal) => [goal.id, goal]));
  const goals = request.selectedGoalIds
    .map((id) => goalById.get(id))
    .filter((goal): goal is AcademyGoal => Boolean(goal));
  const selectedGoalIds = new Set(goals.map((goal) => goal.id));
  const supportingGoalIds = new Set(request.supportingGoalIds ?? []);
  const relatedIds = new Set([
    ...goals.flatMap((goal) => goal.relatedGoalIds),
    ...supportingGoalIds,
  ]);
  const relatedGoals = [...relatedIds]
    .map((id) => goalById.get(id))
    .filter((goal): goal is AcademyGoal => Boolean(goal));
  const excluded = new Set(request.excludeDrillIds ?? []);
  const drillCatalog = content.drills ?? ACADEMY_RUNTIME_DRILL_CATALOG;
  const rankedDrills = drillCatalog
    .filter((drill) => !excluded.has(drill.id))
    .filter(
      (drill) =>
        request.age >= drill.ageRange.min && request.age <= drill.ageRange.max,
    )
    .filter((drill) => request.rosterSize >= drill.players.minimumRoster)
    .filter(
      (drill) =>
        request.goalkeeperCount >= drill.players.goalkeeperCount,
    )
    .filter((drill) => fieldFits(request.fieldSize, drill.minimumFieldSize))
    .filter((drill) =>
      equipmentFits(request.availableEquipment, drill.equipment),
    )
    .filter(
      (drill) =>
        !request.section || drill.suitableSections.includes(request.section),
    )
    .map((drill, index) => ({
      drill,
      index,
      score:
        contentSupportsGoals(
          drill.developmentGoalIds,
          selectedGoalIds,
          relatedIds,
        ) +
        (drill.editorialStatus === "reviewed" ? 5 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, request.limit ?? 8)
    .map((entry) => entry.drill);

  const warnings: string[] = [];
  for (const goalId of request.selectedGoalIds) {
    if (!goalById.has(goalId)) warnings.push(`Unknown goal: ${goalId}`);
  }
  if (!rankedDrills.length) {
    warnings.push(
      request.section
        ? `No compatible goal-linked drill for ${request.section.replaceAll("_", " ")}.`
        : "No compatible goal-linked drills.",
    );
  }
  if (rankedDrills.some((drill) => drill.editorialStatus === "internal_draft")) {
    warnings.push(
      "Some built-in drills remain internal drafts and require coach review before use.",
    );
  }

  return {
    goals,
    relatedGoals,
    drills: rankedDrills,
    lessons: rankGoalLinkedContent(
      content.lessons ?? [],
      selectedGoalIds,
      relatedIds,
    ),
    assignments: rankGoalLinkedContent(
      content.assignments ?? [],
      selectedGoalIds,
      relatedIds,
    ),
    quizzes: rankGoalLinkedContent(
      content.quizzes ?? [],
      selectedGoalIds,
      relatedIds,
    ),
    warnings,
  };
}

