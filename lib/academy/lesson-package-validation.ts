import type {
  AcademyActivity,
  AcademyAssignmentTemplate,
  AcademyGoalGraphCatalog,
  AcademyQuiz,
  AcademyQuizQuestion,
  AcademyTacticalLesson,
  AcademyWorkflowStatus,
} from "@/lib/academy/types";
import {
  validateAcademyActivity,
  validateAssignmentTemplate,
  validateQuiz,
  validateQuizQuestion,
  validateTacticalLesson,
  type AcademyValidationResult,
} from "@/lib/academy/validation";

export type AcademyLessonPackagePolicy =
  | "authored"
  | "review"
  | "publish";

const PUBLISHABLE_STATUSES = new Set<AcademyWorkflowStatus>([
  "approved",
  "published",
]);

export function validateAcademyLessonPackage(input: {
  catalog: AcademyGoalGraphCatalog;
  lesson: AcademyTacticalLesson;
  activities: readonly AcademyActivity[];
  assignment: AcademyAssignmentTemplate;
  quiz: AcademyQuiz;
  questions: readonly AcademyQuizQuestion[];
  policy?: AcademyLessonPackagePolicy;
}): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const policy = input.policy ?? "authored";
  const goalIds = new Set(input.catalog.goals.map((goal) => goal.id));
  const evidenceById = new Map(
    input.catalog.evidenceTags.map((tag) => [tag.id, tag]),
  );

  const validations = [
    validateTacticalLesson(input.lesson),
    ...input.activities.map(validateAcademyActivity),
    validateAssignmentTemplate(input.assignment),
    validateQuiz(input.quiz),
    ...input.questions.map(validateQuizQuestion),
  ];
  for (const validation of validations) {
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
  }

  const records = [
    input.lesson,
    ...input.activities,
    input.assignment,
    input.quiz,
    ...input.questions,
  ];
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) {
      errors.push(`lesson package: duplicate id ${record.id}`);
    }
    ids.add(record.id);
    for (const goalId of record.goalIds) {
      if (!goalIds.has(goalId)) {
        errors.push(`${record.id}: unknown development goal ${goalId}`);
      }
    }
    if (policy === "authored") {
      if (record.editorial.status !== "needs_coach_review") {
        errors.push(
          `${record.id}: authored package status must remain needs_coach_review`,
        );
      }
    } else if (policy === "publish") {
      if (!PUBLISHABLE_STATUSES.has(record.editorial.status as AcademyWorkflowStatus)) {
        errors.push(
          `${record.id}: publish requires approved or published status (found ${record.editorial.status})`,
        );
      }
    }
  }

  for (const relatedGoalId of input.lesson.relatedGoalIds) {
    if (!goalIds.has(relatedGoalId)) {
      errors.push(`${input.lesson.id}: unknown related goal ${relatedGoalId}`);
    }
  }
  const activityIds = new Set(input.activities.map((activity) => activity.id));
  for (const activityId of input.lesson.activityIds) {
    if (!activityIds.has(activityId)) {
      errors.push(`${input.lesson.id}: unknown activity ${activityId}`);
    }
  }
  if (
    input.lesson.activityIds.length !== input.activities.length ||
    input.activities.some(
      (activity) => !input.lesson.activityIds.includes(activity.id),
    )
  ) {
    errors.push(`${input.lesson.id}: lesson activity references are incomplete`);
  }
  if (!input.lesson.relatedAssignmentIds.includes(input.assignment.id)) {
    errors.push(`${input.lesson.id}: assignment is not linked`);
  }
  if (!input.lesson.relatedQuizIds.includes(input.quiz.id)) {
    errors.push(`${input.lesson.id}: quiz is not linked`);
  }
  if (input.assignment.linkedLessonId !== input.lesson.id) {
    errors.push(`${input.assignment.id}: linked lesson is incorrect`);
  }
  if (
    input.assignment.linkedDrillId &&
    !activityIds.has(input.assignment.linkedDrillId)
  ) {
    errors.push(`${input.assignment.id}: linked activity is unknown`);
  }
  if (input.assignment.linkedQuizId !== input.quiz.id) {
    errors.push(`${input.assignment.id}: linked quiz is incorrect`);
  }

  const questionIds = new Set(input.questions.map((question) => question.id));
  if (
    input.quiz.questionIds.length !== input.questions.length ||
    input.quiz.questionIds.some((questionId) => !questionIds.has(questionId))
  ) {
    errors.push(`${input.quiz.id}: quiz question references are incomplete`);
  }
  for (const tagId of input.lesson.evidenceTagIds) {
    const tag = evidenceById.get(tagId);
    if (!tag) {
      errors.push(`${input.lesson.id}: unknown evidence tag ${tagId}`);
    } else if (
      !input.lesson.goalIds.some((goalId) =>
        tag.applicableGoalIds.includes(goalId),
      )
    ) {
      errors.push(`${input.lesson.id}: evidence tag ${tagId} does not match`);
    }
  }
  for (const activity of input.activities) {
    for (const tagId of activity.evidenceTagIds) {
      if (!input.lesson.evidenceTagIds.includes(tagId)) {
        errors.push(
          `${activity.id}: evidence tag ${tagId} is not lesson-linked`,
        );
      }
    }
    if (activity.sourceProvenance.length) {
      errors.push(`${activity.id}: source provenance must remain empty`);
    }
    if (
      policy === "publish" &&
      activity.safetyReview.status !== "safe"
    ) {
      errors.push(`${activity.id}: publish requires a safe safety review`);
    }
  }
  if (
    input.lesson.sourceProvenance.length ||
    input.assignment.sourceProvenance.length
  ) {
    errors.push("lesson package: source provenance must remain empty");
  }

  const roles = new Set(
    input.activities.map((activity) => activity.activityRole),
  );
  for (const role of ["warm_up", "technical", "small_sided_game"]) {
    if (!roles.has(role as AcademyActivity["activityRole"])) {
      errors.push(`lesson package: missing ${role.replaceAll("_", " ")}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings,
  };
}
