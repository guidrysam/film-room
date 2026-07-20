import type {
  AcademyActivity,
  AcademyGoalGraphCatalog,
} from "@/lib/academy/types";
import {
  validateAcademyActivity,
  type AcademyValidationResult,
} from "@/lib/academy/validation";

export function validateCanonicalActivityLibrary(input: {
  activities: readonly AcademyActivity[];
  catalog: AcademyGoalGraphCatalog;
  lessonIds: readonly string[];
  practiceTemplateIds?: readonly string[];
}): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const activityIds = new Set<string>();
  const goalIds = new Set(input.catalog.goals.map((goal) => goal.id));
  const evidenceById = new Map(
    input.catalog.evidenceTags.map((tag) => [tag.id, tag]),
  );
  const lessonIds = new Set(input.lessonIds);
  const practiceTemplateIds = new Set(input.practiceTemplateIds ?? []);

  for (const activity of input.activities) {
    const validation = validateAcademyActivity(activity);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);

    if (activityIds.has(activity.id)) {
      errors.push(`activity-library: duplicate activity id ${activity.id}`);
    }
    activityIds.add(activity.id);

    for (const goalId of activity.goalIds) {
      if (!goalIds.has(goalId)) {
        errors.push(`${activity.id}: unknown development goal ${goalId}`);
      }
    }
    for (const lessonId of activity.relatedLessonIds) {
      if (!lessonIds.has(lessonId)) {
        errors.push(`${activity.id}: unknown related lesson ${lessonId}`);
      }
    }
    for (const practiceTemplateId of activity.relatedPracticeTemplateIds) {
      if (!practiceTemplateIds.has(practiceTemplateId)) {
        errors.push(
          `${activity.id}: unknown related practice ${practiceTemplateId}`,
        );
      }
    }
    for (const tagId of activity.evidenceTagIds) {
      const tag = evidenceById.get(tagId);
      if (!tag) {
        errors.push(`${activity.id}: unknown evidence tag ${tagId}`);
      } else if (
        !tag.applicableGoalIds.some((goalId) =>
          activity.goalIds.includes(goalId),
        )
      ) {
        errors.push(
          `${activity.id}: evidence tag ${tagId} does not match a related goal`,
        );
      }
    }
  }

  for (const activity of input.activities) {
    for (const relatedActivityId of activity.relatedActivityIds) {
      if (!activityIds.has(relatedActivityId)) {
        errors.push(
          `${activity.id}: unknown related activity ${relatedActivityId}`,
        );
      }
      if (relatedActivityId === activity.id) {
        errors.push(`${activity.id}: activity cannot relate to itself`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings,
  };
}

