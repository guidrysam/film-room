import type {
  AcademyGoal,
  AcademyGoalGraphCatalog,
  AcademyPositionGroup,
} from "@/lib/academy/types";
import {
  type AcademyValidationResult,
  validateGoalCatalog,
} from "@/lib/academy/validation";

const POSITION_GROUPS = new Set<AcademyPositionGroup>([
  "all",
  "goalkeeper",
  "defender",
  "outside_defender",
  "central_defender",
  "midfielder",
  "wide_player",
  "forward",
]);

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function goalPath(goal: AcademyGoal): string {
  return `goal:${goal.id || "(missing)"}`;
}

export function validateAcademyGoalGraphCatalog(
  catalog: AcademyGoalGraphCatalog,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const domainIds = new Set(catalog.domains.map((domain) => domain.id));
  const blockIds = new Set(catalog.blocks.map((block) => block.id));
  const goalIds = new Set(catalog.goals.map((goal) => goal.id));
  const tagById = new Map(catalog.evidenceTags.map((tag) => [tag.id, tag]));

  if (!catalog.id || !catalog.title || catalog.ageBand !== "U11-U12") {
    errors.push("goal graph: canonical id, title, and U11-U12 age band are required");
  }
  if (catalog.primaryFormat !== "9v9") {
    errors.push("goal graph: primary format must be 9v9");
  }
  if (catalog.seasonWeeks !== 12 || catalog.practicesPerWeek !== 2) {
    errors.push("goal graph: Phase 2A requires 12 weeks and two practices per week");
  }
  if (!unique(catalog.domains.map((domain) => domain.id))) {
    errors.push("goal graph: domain IDs must be unique");
  }
  if (!unique(catalog.blocks.map((block) => block.id))) {
    errors.push("goal graph: block IDs must be unique");
  }
  if (!unique(catalog.evidenceTags.map((tag) => tag.id))) {
    errors.push("goal graph: evidence tag IDs must be unique");
  }
  if (catalog.domains.length !== 15) {
    warnings.push(`goal graph: expected 15 domains; found ${catalog.domains.length}`);
  }
  if (catalog.goals.length < 45 || catalog.goals.length > 60) {
    errors.push("goal graph: canonical goal count must be between 45 and 60");
  }

  const sortedBlocks = [...catalog.blocks].sort(
    (a, b) => a.weekStart - b.weekStart,
  );
  let expectedWeek = 1;
  for (const block of sortedBlocks) {
    if (
      block.weekStart !== expectedWeek ||
      block.weekEnd < block.weekStart ||
      !block.title.trim() ||
      !block.description.trim()
    ) {
      errors.push(
        `block:${block.id}: blocks must be described and cover sequential weeks`,
      );
    }
    expectedWeek = block.weekEnd + 1;
  }
  if (expectedWeek !== catalog.seasonWeeks + 1) {
    errors.push("goal graph: blocks must cover all 12 weeks without gaps");
  }

  const baseValidation = validateGoalCatalog(catalog.goals);
  errors.push(...baseValidation.errors);
  warnings.push(...baseValidation.warnings);

  for (const goal of catalog.goals) {
    const path = goalPath(goal);
    if (!/^u12-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(goal.id)) {
      errors.push(`${path}: use a stable descriptive u12-* ID`);
    }
    if (!domainIds.has(goal.domainId)) {
      errors.push(`${path}: unknown domain ${goal.domainId}`);
    }
    if (goal.ageBands.length !== 1 || goal.ageBands[0] !== "U11-U12") {
      errors.push(`${path}: ageBands must be U11-U12`);
    }
    if (!goal.formats.includes("9v9")) {
      errors.push(`${path}: 9v9 format is required`);
    }
    if (goal.observableIndicators.length < 3) {
      errors.push(`${path}: at least three observable indicators are required`);
    }
    if (goal.commonFailurePatterns.length < 1) {
      errors.push(`${path}: at least one common failure pattern is required`);
    }
    if (goal.coachFeedbackExamples.length < 2) {
      errors.push(`${path}: at least two coach feedback examples are required`);
    }
    if (goal.gameEvidenceTags.length < 1 || !unique(goal.gameEvidenceTags)) {
      errors.push(`${path}: unique game evidence tags are required`);
    }
    if (
      !Number.isInteger(goal.recommendedLessonCount) ||
      goal.recommendedLessonCount < 1 ||
      !Number.isInteger(goal.recommendedDrillCount) ||
      goal.recommendedDrillCount < 1
    ) {
      errors.push(`${path}: positive lesson and drill demand counts are required`);
    }
    const suitability = Array.isArray(goal.suitableFor)
      ? goal.suitableFor
      : [goal.suitableFor];
    if (!suitability.length || !unique(suitability)) {
      errors.push(`${path}: suitableFor must contain unique scopes`);
    }
    if (!goal.positionRelevance.length) {
      errors.push(`${path}: position relevance is required`);
    }
    for (const position of goal.positionRelevance) {
      if (!POSITION_GROUPS.has(position.positionGroup)) {
        errors.push(`${path}: unknown position ${position.positionGroup}`);
      }
    }
    if (!goal.seasonalPlacement.length) {
      errors.push(`${path}: seasonal placement is required`);
    }
    for (const placement of goal.seasonalPlacement) {
      if (!blockIds.has(placement.blockId)) {
        errors.push(`${path}: unknown block ${placement.blockId}`);
      }
    }
    if (
      !goal.editorial ||
      !["draft", "needs_coach_review"].includes(goal.editorial.status) ||
      !goal.editorial.originalWording ||
      !goal.editorial.originalDiagram ||
      !goal.editorial.generatedWithAssistance
    ) {
      errors.push(
        `${path}: generated goals must remain original, assisted drafts awaiting coach review`,
      );
    }
    if (!Array.isArray(goal.recommendedResourceTopics)) {
      errors.push(`${path}: recommended resource topics must be an array`);
    }

    const evidenceCategories = new Set<string>();
    for (const tagId of goal.gameEvidenceTags) {
      const tag = tagById.get(tagId);
      if (!tag) {
        errors.push(`${path}: unknown evidence tag ${tagId}`);
        continue;
      }
      if (!tag.applicableGoalIds.includes(goal.id)) {
        errors.push(`${path}: evidence tag ${tagId} does not link back to goal`);
      }
      evidenceCategories.add(tag.category);
    }
    if (
      !evidenceCategories.has("positive") ||
      !evidenceCategories.has("improvement")
    ) {
      errors.push(`${path}: positive and improvement evidence are both required`);
    }

    if (goal.relatedGoalIds.includes(goal.id)) {
      errors.push(`${path}: a goal cannot relate to itself`);
    }
    for (const relatedId of goal.relatedGoalIds) {
      const related = catalog.goals.find((candidate) => candidate.id === relatedId);
      if (related && !related.relatedGoalIds.includes(goal.id)) {
        errors.push(`${path}: related link to ${relatedId} must be bidirectional`);
      }
    }
  }

  for (const tag of catalog.evidenceTags) {
    if (!tag.id || !tag.label.trim() || !tag.description.trim()) {
      errors.push(`evidence-tag:${tag.id || "(missing)"}: identity is required`);
    }
    if (!tag.applicableGoalIds.length || !tag.applicableEventTypes.length) {
      errors.push(`evidence-tag:${tag.id}: goal and event mappings are required`);
    }
    for (const goalId of tag.applicableGoalIds) {
      if (!goalIds.has(goalId)) {
        errors.push(`evidence-tag:${tag.id}: unknown goal ${goalId}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
