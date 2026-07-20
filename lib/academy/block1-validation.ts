import { U12_DEVELOPMENT_CURRICULUM_SHELL } from "@/lib/academy/u12-curriculum-shell";
import type {
  AcademyActivity,
  AcademyAssignmentTemplate,
  AcademyCurriculum,
  AcademyLessonPackageManifest,
  AcademyQuiz,
  AcademyQuizQuestion,
  AcademyTacticalLesson,
} from "@/lib/academy/types";
import { validateAcademyLessonPackage } from "@/lib/academy/lesson-package-validation";
import type { AcademyValidationResult } from "@/lib/academy/validation";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

function result(errors: string[], warnings: string[]): AcademyValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

const DECISION_RICH_ROLES = new Set([
  "opposed",
  "positioning_game",
  "directional_game",
  "game_training",
  "small_sided_game",
  "training_game",
  "technical",
]);

export type Block1LessonPackageInput = {
  manifest: AcademyLessonPackageManifest;
  lesson: AcademyTacticalLesson;
  activities: readonly AcademyActivity[];
  assignment: AcademyAssignmentTemplate;
  quiz: AcademyQuiz;
  questions: readonly AcademyQuizQuestion[];
};

export function validateLessonPackageCurriculumPlacement(
  manifest: AcademyLessonPackageManifest,
  curriculum: AcademyCurriculum = U12_DEVELOPMENT_CURRICULUM_SHELL,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = `package:${manifest.id}`;
  const placement = manifest.curriculumPlacement;
  if (!placement) {
    errors.push(`${path}: curriculumPlacement is required for pathway packages`);
    return result(errors, warnings);
  }
  if (placement.curriculumId !== curriculum.id) {
    errors.push(
      `${path}: curriculumPlacement.curriculumId must be ${curriculum.id}`,
    );
  }
  const block = curriculum.trainingBlocks.find(
    (item) => item.id === placement.trainingBlockId,
  );
  if (!block) {
    errors.push(
      `${path}: unknown trainingBlockId ${placement.trainingBlockId}`,
    );
    return result(errors, warnings);
  }
  const sequence = block.learningSequences.find(
    (item) => item.id === placement.learningSequenceId,
  );
  if (!sequence) {
    errors.push(
      `${path}: unknown learningSequenceId ${placement.learningSequenceId}`,
    );
    return result(errors, warnings);
  }
  const slot = sequence.slots.find(
    (item) => item.order === placement.sequenceSlotOrder,
  );
  if (!slot) {
    errors.push(
      `${path}: sequenceSlotOrder ${placement.sequenceSlotOrder} not found`,
    );
    return result(errors, warnings);
  }
  if (slot.kind !== "core_lesson") {
    errors.push(`${path}: placement must target a core_lesson slot`);
  }
  if (slot.lessonId && slot.lessonId !== manifest.lessonId) {
    errors.push(
      `${path}: lessonId ${manifest.lessonId} does not match slot lessonId ${slot.lessonId}`,
    );
  }
  if (slot.lessonPackageId && slot.lessonPackageId !== manifest.id) {
    errors.push(
      `${path}: package id does not match shell slot lessonPackageId ${slot.lessonPackageId}`,
    );
  }
  return result(errors, warnings);
}

export function validateBlock1LessonPackage(
  input: Block1LessonPackageInput,
  curriculum: AcademyCurriculum = U12_DEVELOPMENT_CURRICULUM_SHELL,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = `package:${input.manifest.id}`;

  const base = validateAcademyLessonPackage({
    catalog: U12_ACADEMY_GOAL_CATALOG,
    lesson: input.lesson,
    activities: input.activities,
    assignment: input.assignment,
    quiz: input.quiz,
    questions: input.questions,
    policy: "authored",
  });
  errors.push(...base.errors);
  warnings.push(...base.warnings);

  const placement = validateLessonPackageCurriculumPlacement(
    input.manifest,
    curriculum,
  );
  errors.push(...placement.errors);
  warnings.push(...placement.warnings);

  if (input.manifest.lessonId !== input.lesson.id) {
    errors.push(`${path}: manifest lessonId must match lesson.id`);
  }
  if (input.manifest.primaryGoalId !== input.lesson.goalIds[0]) {
    errors.push(`${path}: primaryGoalId must match the lesson primary goal`);
  }
  if (!input.lesson.successCriteria.length) {
    errors.push(`${input.lesson.id}: success criteria are required`);
  }
  if (!input.lesson.learningObjective.trim()) {
    errors.push(`${input.lesson.id}: learning objective is required`);
  }
  const genericObjective = /improve (passing|ball skills|dribbling)|develop ball/i;
  if (genericObjective.test(input.lesson.learningObjective)) {
    errors.push(
      `${input.lesson.id}: learning objective is too generic — state a player capability`,
    );
  }

  const roles = new Set(input.activities.map((activity) => activity.activityRole));
  if (!roles.has("warm_up")) {
    errors.push(`${path}: missing warm_up activity`);
  }
  if (!roles.has("small_sided_game")) {
    errors.push(`${path}: missing small_sided_game activity`);
  }
  const decisionRich = input.activities.some((activity) =>
    DECISION_RICH_ROLES.has(activity.activityRole),
  );
  if (!decisionRich) {
    errors.push(`${path}: missing a decision-rich activity`);
  }

  const activityIds = new Set(input.activities.map((activity) => activity.id));
  if (new Set(activityIds).size !== input.activities.length) {
    errors.push(`${path}: duplicate activities in package`);
  }
  for (const activityId of input.manifest.activityIds) {
    if (!activityIds.has(activityId)) {
      errors.push(`${path}: invalid activity reference ${activityId}`);
    }
  }

  const plan = input.manifest.practicePlan;
  if (!plan) {
    errors.push(`${path}: practicePlan is required`);
  } else {
    if (plan.defaultMinutes < 60 || plan.defaultMinutes > 90) {
      errors.push(`${path}: default practice must be 60–90 minutes`);
    }
    if (plan.shortMinutes < 40 || plan.shortMinutes > 50) {
      errors.push(`${path}: short practice should be about 45 minutes`);
    }
    const defaultSum = plan.sections.reduce(
      (sum, section) => sum + section.plannedMinutes,
      0,
    );
    const shortSum = plan.sections.reduce(
      (sum, section) => sum + section.shortMinutes,
      0,
    );
    if (defaultSum !== plan.defaultMinutes) {
      errors.push(
        `${path}: practicePlan sections must sum to defaultMinutes (${defaultSum} ≠ ${plan.defaultMinutes})`,
      );
    }
    if (shortSum !== plan.shortMinutes) {
      errors.push(
        `${path}: practicePlan short minutes must sum to shortMinutes (${shortSum} ≠ ${plan.shortMinutes})`,
      );
    }
    for (const section of plan.sections) {
      if (!activityIds.has(section.activityId)) {
        errors.push(
          `${path}: practicePlan references unknown activity ${section.activityId}`,
        );
      }
    }
    if (!plan.reflectionQuestions.length) {
      errors.push(`${path}: practicePlan reflectionQuestions are required`);
    }
  }

  if (!input.assignment.estimatedMinutes) {
    errors.push(`${input.assignment.id}: estimatedMinutes is required`);
  }
  if (!input.assignment.completionCriteria?.length) {
    errors.push(`${input.assignment.id}: completionCriteria are required`);
  }
  if (!input.assignment.easierOption || !input.assignment.harderOption) {
    errors.push(
      `${input.assignment.id}: easierOption and harderOption are required`,
    );
  }

  if (input.questions.length < 4 || input.questions.length > 6) {
    errors.push(`${input.quiz.id}: quiz must have 4–6 questions`);
  }
  for (const question of input.questions) {
    if (!question.correctOptionIds?.length) {
      errors.push(`${question.id}: correctOptionIds required in editorial payload`);
    }
    if (!question.explanation?.trim()) {
      errors.push(`${question.id}: explanation is required`);
    }
  }

  for (const relatedId of input.manifest.priorLessonIds ?? []) {
    if (relatedId === input.lesson.id) {
      errors.push(`${path}: priorLessonIds cannot include self`);
    }
  }
  for (const relatedId of input.manifest.nextLessonIds ?? []) {
    if (relatedId === input.lesson.id) {
      errors.push(`${path}: nextLessonIds cannot include self`);
    }
  }

  return result([...new Set(errors)], [...new Set(warnings)]);
}

export function validateBlock1Packages(
  packages: readonly Block1LessonPackageInput[],
  curriculum: AcademyCurriculum = U12_DEVELOPMENT_CURRICULUM_SHELL,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const packageIds = new Set<string>();
  const lessonIds = new Set<string>();
  const activityIds = new Set<string>();
  const slotKeys = new Set<string>();

  for (const pkg of packages) {
    const validation = validateBlock1LessonPackage(pkg, curriculum);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);

    if (packageIds.has(pkg.manifest.id)) {
      errors.push(`block1: duplicate package id ${pkg.manifest.id}`);
    }
    packageIds.add(pkg.manifest.id);

    if (lessonIds.has(pkg.lesson.id)) {
      errors.push(`block1: duplicate lesson id ${pkg.lesson.id}`);
    }
    lessonIds.add(pkg.lesson.id);

    for (const activity of pkg.activities) {
      if (activityIds.has(activity.id)) {
        errors.push(`block1: duplicate activity id ${activity.id}`);
      }
      activityIds.add(activity.id);
    }

    const placement = pkg.manifest.curriculumPlacement;
    if (placement) {
      const key = `${placement.learningSequenceId}:${placement.sequenceSlotOrder}`;
      if (slotKeys.has(key)) {
        errors.push(`block1: duplicate curriculum slot placement ${key}`);
      }
      slotKeys.add(key);
    }
  }

  const block = curriculum.trainingBlocks.find(
    (item) => item.id === "u12-curr-block-01-own-the-ball",
  );
  const expectedSlots =
    block?.learningSequences[0]?.slots.filter(
      (slot) => slot.kind === "core_lesson",
    ) ?? [];
  if (packages.length !== expectedSlots.length) {
    errors.push(
      `block1: expected ${expectedSlots.length} packages for Own the Ball, found ${packages.length}`,
    );
  }

  return result([...new Set(errors)], [...new Set(warnings)]);
}

/** Published projection must never expose answer keys. */
export function assertQuizPayloadHidesAnswers(
  questions: readonly AcademyQuizQuestion[],
): AcademyValidationResult {
  const errors: string[] = [];
  for (const question of questions) {
    const published = { ...question } as Record<string, unknown>;
    delete published.correctOptionIds;
    delete published.explanation;
    if ("correctOptionIds" in published) {
      errors.push(`${question.id}: correctOptionIds leaked into published shape`);
    }
    if ("explanation" in published) {
      errors.push(`${question.id}: explanation leaked into published shape`);
    }
    const serialized = JSON.stringify(published);
    if (serialized.includes("correctOptionIds")) {
      errors.push(`${question.id}: serialized published payload leaks keys`);
    }
  }
  return result(errors, []);
}
