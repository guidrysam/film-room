import type {
  AcademyAssignmentTemplate,
  AcademyGoal,
  AcademyPracticeTemplate,
  AcademyPreset,
  AcademyQuiz,
  AcademyQuizQuestion,
  AcademySourceDocument,
  AcademyTacticalLesson,
} from "@/lib/academy/types";

export type AcademyValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

const LICENSE_STATUSES = new Set([
  "unknown",
  "private_reference_only",
  "licensed",
  "public_domain",
  "permission_granted",
]);

function result(errors: string[], warnings: string[]): AcademyValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isApprovedStatus(value: unknown): boolean {
  return value === "approved" || value === "published";
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): void {
  if (typeof record[key] !== "string" || !(record[key] as string).trim()) {
    errors.push(`${path}: ${key} is required`);
  }
}

function normalizedCoordinate(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateMinIdealMax(
  value: unknown,
  path: string,
  errors: string[],
  allowZero = false,
): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const minimum = value.min;
  const maximum = value.max;
  const middle = value.ideal ?? value.default;
  const floor = allowZero ? 0 : 1;
  if (
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    Number(minimum) < floor ||
    Number(maximum) < Number(minimum)
  ) {
    errors.push(`${path} must have a valid min/max range`);
    return;
  }
  if (
    middle !== undefined &&
    (!Number.isInteger(middle) ||
      Number(middle) < Number(minimum) ||
      Number(middle) > Number(maximum))
  ) {
    errors.push(`${path} middle value must be within min/max`);
  }
}

export function validateSourceDocument(
  value: unknown,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return result(["source: value must be an object"], warnings);
  }
  const id = typeof value.id === "string" ? value.id : "(missing)";
  const path = `source:${id}`;
  for (const key of ["id", "filename", "title", "importedAt"]) {
    requiredString(value, key, path, errors);
  }
  if (value.sourceType !== "pdf") {
    warnings.push(`${path}: Phase 1 ingestion expects a PDF source`);
  }
  if (
    typeof value.licenseStatus !== "string" ||
    !LICENSE_STATUSES.has(value.licenseStatus)
  ) {
    errors.push(`${path}: invalid licenseStatus`);
  }
  if (
    !Array.isArray(value.usageRestrictions) ||
    value.usageRestrictions.some((item) => typeof item !== "string")
  ) {
    errors.push(`${path}: usageRestrictions must be a string array`);
  } else {
    const restrictions = value.usageRestrictions.join(" ").toLowerCase();
    for (const phrase of [
      "private reference",
      "no public exposure",
      "no verbatim republish",
    ]) {
      if (!restrictions.includes(phrase)) {
        errors.push(`${path}: usage restrictions must include "${phrase}"`);
      }
    }
  }
  if (value.licenseStatus !== "private_reference_only") {
    warnings.push(`${path}: verify license before any publication workflow`);
  }
  if (
    typeof value.importedAt === "string" &&
    Number.isNaN(Date.parse(value.importedAt))
  ) {
    errors.push(`${path}: importedAt must be an ISO date`);
  }
  return result(errors, warnings);
}

export function validateSourceItem(value: unknown): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return result(["source item: value must be an object"], warnings);
  }
  const id = typeof value.id === "string" ? value.id : "(missing)";
  const path = `source-item:${id}`;
  for (const key of [
    "id",
    "sourceDocumentId",
    "sourceTitle",
    "internalSummary",
  ]) {
    requiredString(value, key, path, errors);
  }
  if (value.editorialStatus !== "extracted") {
    warnings.push(`${path}: item has not reached extracted status`);
  }
  if (value.publicationEligibility !== "requires_original_rewrite") {
    errors.push(
      `${path}: extracted source items must require an original rewrite`,
    );
  }
  const start = value.sourcePageStart;
  const end = value.sourcePageEnd;
  if (start !== undefined && (!Number.isInteger(start) || Number(start) < 1)) {
    errors.push(`${path}: sourcePageStart must be a positive integer`);
  }
  if (end !== undefined && (!Number.isInteger(end) || Number(end) < 1)) {
    errors.push(`${path}: sourcePageEnd must be a positive integer`);
  }
  if (
    typeof start === "number" &&
    typeof end === "number" &&
    end < start
  ) {
    errors.push(`${path}: source page range is reversed`);
  }
  for (const key of ["ageTags", "skillTags", "tacticalTags"]) {
    if (
      !Array.isArray(value[key]) ||
      (value[key] as unknown[]).some((item) => typeof item !== "string")
    ) {
      errors.push(`${path}: ${key} must be a string array`);
    }
  }
  return result(errors, warnings);
}

export function validateSourceCatalog(
  documents: readonly AcademySourceDocument[],
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const filenames = new Set<string>();
  for (const document of documents) {
    if (ids.has(document.id)) {
      errors.push(`source catalog: duplicate id ${document.id}`);
    }
    if (filenames.has(document.filename)) {
      errors.push(`source catalog: duplicate filename ${document.filename}`);
    }
    ids.add(document.id);
    filenames.add(document.filename);
    const validation = validateSourceDocument(document);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
  }
  return result(errors, warnings);
}

export function validateAcademyGoal(value: unknown): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return result(["goal: value must be an object"], warnings);
  }
  const id = typeof value.id === "string" ? value.id : "(missing)";
  const path = `goal:${id}`;
  for (const key of ["id", "title", "description"]) {
    requiredString(value, key, path, errors);
  }
  if (
    !Array.isArray(value.observableIndicators) ||
    value.observableIndicators.length === 0
  ) {
    errors.push(`${path}: at least one observable indicator is required`);
  }
  if (
    Array.isArray(value.prerequisiteGoalIds) &&
    value.prerequisiteGoalIds.includes(value.id)
  ) {
    errors.push(`${path}: a goal cannot be its own prerequisite`);
  }
  if (!isRecord(value.editorial)) {
    errors.push(`${path}: editorial metadata is required`);
  } else if (isApprovedStatus(value.editorial.status)) {
    if (!value.editorial.reviewedBy || !value.editorial.reviewedAt) {
      errors.push(`${path}: approved goals require human review metadata`);
    }
  }
  if (!Array.isArray(value.sourceProvenance)) {
    errors.push(`${path}: sourceProvenance must be an array`);
  }
  return result(errors, warnings);
}

export function validateGoalCatalog(
  goals: readonly AcademyGoal[],
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map<string, AcademyGoal>();
  for (const goal of goals) {
    if (byId.has(goal.id)) errors.push(`goal catalog: duplicate id ${goal.id}`);
    byId.set(goal.id, goal);
    const validation = validateAcademyGoal(goal);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
  }
  for (const goal of goals) {
    for (const relatedId of [
      ...(goal.prerequisiteGoalIds ?? []),
      ...(goal.relatedGoalIds ?? []),
    ]) {
      if (!byId.has(relatedId)) {
        errors.push(`goal:${goal.id}: unknown related goal ${relatedId}`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (goalId: string, path: string[]): void => {
    if (visiting.has(goalId)) {
      errors.push(
        `goal catalog: circular prerequisite ${[...path, goalId].join(" -> ")}`,
      );
      return;
    }
    if (visited.has(goalId)) return;
    visiting.add(goalId);
    for (const prerequisiteId of
      byId.get(goalId)?.prerequisiteGoalIds ?? []) {
      visit(prerequisiteId, [...path, goalId]);
    }
    visiting.delete(goalId);
    visited.add(goalId);
  };
  for (const goal of goals) visit(goal.id, []);

  return result([...new Set(errors)], warnings);
}

export function validateAcademyActivity(
  value: unknown,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return result(["activity: value must be an object"], warnings);
  }
  const id = typeof value.id === "string" ? value.id : "(missing)";
  const path = `activity:${id}`;
  for (const key of ["id", "title", "summary", "description"]) {
    requiredString(value, key, path, errors);
  }
  if (!Number.isInteger(value.version) || Number(value.version) < 1) {
    errors.push(`${path}: version must be a positive integer`);
  }
  for (const key of ["ageBands", "formats", "equipment", "searchTags"]) {
    if (
      !Array.isArray(value[key]) ||
      (value[key] as unknown[]).some((item) => typeof item !== "string")
    ) {
      errors.push(`${path}: ${key} must be a string array`);
    }
  }
  if (
    ![
      "warmup",
      "technical",
      "possession",
      "small_sided_game",
      "finishing",
      "defending",
      "transition",
      "goalkeeper",
      "conditioned_game",
    ].includes(String(value.category))
  ) {
    errors.push(`${path}: category is invalid`);
  }
  if (
    !["foundation", "developing", "advanced"].includes(
      String(value.difficulty),
    )
  ) {
    errors.push(`${path}: difficulty is invalid`);
  }
  if (
    ![
      "arrival",
      "warm_up",
      "technical",
      "opposed",
      "positioning_game",
      "directional_game",
      "game_training",
      "small_sided_game",
      "training_game",
      "review",
    ].includes(String(value.activityRole))
  ) {
    errors.push(`${path}: activityRole is invalid`);
  }
  if (
    ![
      "warmup",
      "ball_mastery",
      "technical_exercise",
      "unopposed_technical",
      "opposed_technical",
      "rondo",
      "possession_game",
      "positional_game",
      "directional_game",
      "conditioned_game",
      "small_sided_game",
      "finishing",
      "transition_game",
      "goalkeeping",
      "conditioning",
      "team_building",
      "tactical_walkthrough",
    ].includes(String(value.activityType))
  ) {
    errors.push(`${path}: activityType is invalid`);
  }
  if (
    !isRecord(value.field) ||
    !["yards", "meters"].includes(String(value.field.unit))
  ) {
    errors.push(`${path}: field metadata with a valid unit is required`);
  }
  if (
    !isRecord(value.ageRange) ||
    !Number.isInteger(value.ageRange.min) ||
    !Number.isInteger(value.ageRange.max) ||
    Number(value.ageRange.min) > Number(value.ageRange.max)
  ) {
    errors.push(`${path}: ageRange must contain valid minimum and maximum ages`);
  }
  const steps = Array.isArray(value.steps) ? value.steps : [];
  if (steps.length < 4) errors.push(`${path}: at least four steps are required`);
  const phases = new Set(
    steps
      .filter(isRecord)
      .map((step) => step.phase)
      .filter((phase): phase is string => typeof phase === "string"),
  );
  if (!phases.has("setup")) errors.push(`${path}: setup step is required`);
  if (!phases.has("action")) errors.push(`${path}: action step is required`);
  if (!phases.has("reset") && !phases.has("rotation")) {
    errors.push(`${path}: reset or rotation step is required`);
  }
  const firstOrder =
    isRecord(steps[0]) && Number.isInteger(steps[0].order)
      ? Number(steps[0].order)
      : 0;
  const objectTypeById = new Map<string, string>();
  let priorVisualState: string | null = null;
  steps.forEach((step, index) => {
    const stepPath = `${path}/step:${index + 1}`;
    if (!isRecord(step)) {
      errors.push(`${stepPath}: step must be an object`);
      return;
    }
    requiredString(step, "id", stepPath, errors);
    requiredString(step, "title", stepPath, errors);
    requiredString(step, "explanation", stepPath, errors);
    if (step.order !== firstOrder + index) {
      errors.push(`${stepPath}: step order must be sequential`);
    }
    const objects = Array.isArray(step.objects) ? step.objects : [];
    if (!Array.isArray(step.objects)) {
      errors.push(`${stepPath}: objects must be an array`);
    }
    const visualState = JSON.stringify(objects);
    if (visualState === priorVisualState) {
      errors.push(`${stepPath}: consecutive steps need distinct visual states`);
    }
    priorVisualState = visualState;
    const objectIds = new Set<string>();
    for (const object of objects) {
      if (!isRecord(object)) {
        errors.push(`${stepPath}: tactics object must be an object`);
        continue;
      }
      const objectId =
        typeof object.id === "string" && object.id.trim()
          ? object.id
          : "(missing)";
      const objectType =
        typeof object.type === "string" ? object.type : "(missing)";
      if (objectId === "(missing)") {
        errors.push(`${stepPath}: tactics object id is required`);
      }
      if (objectIds.has(objectId)) {
        errors.push(`${stepPath}: duplicate object id ${objectId}`);
      }
      objectIds.add(objectId);
      const priorType = objectTypeById.get(objectId);
      if (priorType && priorType !== objectType) {
        errors.push(`${stepPath}: stable object ${objectId} changed type`);
      }
      objectTypeById.set(objectId, objectType);
      if (
        ["player", "ball", "cone", "mini_goal", "area_label"].includes(
          objectType,
        ) &&
        (!normalizedCoordinate(object.x) || !normalizedCoordinate(object.y))
      ) {
        errors.push(`${stepPath}/${objectId}: coordinates must be normalized`);
      }
      if (
        ["line", "arrow", "circle", "zone"].includes(objectType) &&
        (!Array.isArray(object.points) ||
          object.points.length < 2 ||
          object.points.some(
            (point) =>
              !isRecord(point) ||
              !normalizedCoordinate(point.x) ||
              !normalizedCoordinate(point.y),
          ))
      ) {
        errors.push(
          `${stepPath}/${objectId}: drawing points must be normalized`,
        );
      }
    }
  });
  for (const key of [
    "objectives",
    "setupInstructions",
    "organization",
    "howItWorks",
    "resetInstructions",
    "coachingPoints",
    "progressions",
    "regressions",
    "commonMistakes",
    "safetyNotes",
  ]) {
    if (!Array.isArray(value[key]) || (value[key] as unknown[]).length === 0) {
      errors.push(`${path}: ${key} must not be empty`);
    }
  }
  for (const key of [
    "relatedActivityIds",
    "relatedLessonIds",
    "relatedPracticeTemplateIds",
    "relatedAssignmentIds",
    "relatedQuizIds",
    "evidenceTagIds",
  ]) {
    if (!Array.isArray(value[key])) {
      errors.push(`${path}: ${key} must be an array`);
    }
  }
  if (!isRecord(value.editorial)) {
    errors.push(`${path}: editorial metadata is required`);
  } else if (isApprovedStatus(value.editorial.status)) {
    if (!value.editorial.reviewedBy || !value.editorial.reviewedAt) {
      errors.push(`${path}: approved content requires human review metadata`);
    }
  }
  if (!isRecord(value.safetyReview)) {
    errors.push(`${path}: safety review is required`);
  } else if (
    value.editorial &&
    isRecord(value.editorial) &&
    isApprovedStatus(value.editorial.status) &&
    value.safetyReview.status !== "safe"
  ) {
    errors.push(`${path}: approved drills require a safe safety review`);
  }
  if (!Array.isArray(value.goalIds) || value.goalIds.length === 0) {
    errors.push(`${path}: at least one linked goal is required`);
  }
  if (!Array.isArray(value.sourceProvenance)) {
    errors.push(`${path}: sourceProvenance must be an array`);
  }
  validateMinIdealMax(value.playerCount, `${path}: playerCount`, errors);
  if (value.goalkeeperCount !== undefined) {
    validateMinIdealMax(
      value.goalkeeperCount,
      `${path}: goalkeeperCount`,
      errors,
      true,
    );
  }
  validateMinIdealMax(
    value.durationMinutes,
    `${path}: durationMinutes`,
    errors,
  );
  return result(errors, warnings);
}

/** @deprecated Use validateAcademyActivity for canonical library objects. */
export function validateAcademyDrill(value: unknown): AcademyValidationResult {
  return validateAcademyActivity(value);
}

export function validatePracticeTemplate(
  practice: AcademyPracticeTemplate,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = `practice:${practice.id || "(missing)"}`;
  if (!practice.id || !practice.title || !practice.summary) {
    errors.push(`${path}: id, title, and summary are required`);
  }
  if (!practice.primaryGoalIds.length) {
    errors.push(`${path}: at least one primary goal is required`);
  }
  const plannedMinutes = practice.activities.reduce(
    (sum, activity) => sum + activity.plannedMinutes,
    0,
  );
  if (plannedMinutes !== practice.durationMinutes) {
    errors.push(
      `${path}: activity minutes ${plannedMinutes} must equal ${practice.durationMinutes}`,
    );
  }
  const gameRoles = new Set([
    "directional_game",
    "game_training",
    "small_sided_game",
    "training_game",
  ]);
  if (!practice.activities.some((activity) => gameRoles.has(activity.role))) {
    errors.push(`${path}: at least one game-based activity is required`);
  }
  practice.activities.forEach((activity, index) => {
    if (activity.order !== index) {
      errors.push(`${path}: activity order must be zero-based and sequential`);
    }
    if (!activity.objective.trim()) {
      errors.push(`${path}: every activity requires an objective`);
    }
  });
  const drillIds = practice.activities
    .map((activity) => activity.drillId)
    .filter((id): id is string => Boolean(id));
  if (new Set(drillIds).size !== drillIds.length) {
    warnings.push(`${path}: a drill is intentionally repeated; verify why`);
  }
  if (!practice.reviewQuestions.length) {
    errors.push(`${path}: review questions are required`);
  }
  if (!practice.editorial) {
    errors.push(`${path}: editorial metadata is required`);
  }
  return result(errors, warnings);
}

export function validateQuizQuestion(
  question: AcademyQuizQuestion,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = `quiz-question:${question.id || "(missing)"}`;
  if (!question.id || !question.prompt.trim()) {
    errors.push(`${path}: id and prompt are required`);
  }
  if (!question.goalIds.length) {
    errors.push(`${path}: at least one linked goal is required`);
  }
  if (
    question.questionType === "multiple_choice" ||
    question.questionType === "true_false"
  ) {
    const optionIds = new Set(question.options?.map((option) => option.id) ?? []);
    if (optionIds.size < 2) errors.push(`${path}: at least two options are required`);
    if (
      !question.correctOptionIds?.length ||
      question.correctOptionIds.some((id) => !optionIds.has(id))
    ) {
      errors.push(`${path}: correct options must reference available options`);
    }
  }
  if (question.questionType === "position_selection" && !question.boardState) {
    errors.push(`${path}: position selection requires a board state`);
  }
  if (!question.editorial) {
    errors.push(`${path}: editorial metadata is required`);
  }
  return result(errors, warnings);
}

export function validateAssignmentTemplate(
  assignment: AcademyAssignmentTemplate,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = `assignment:${assignment.id || "(missing)"}`;
  if (!assignment.id || !assignment.title.trim() || !assignment.description.trim()) {
    errors.push(`${path}: id, title, and description are required`);
  }
  if (!assignment.goalIds.length) {
    errors.push(`${path}: at least one linked goal is required`);
  }
  if (!assignment.instructions.length) {
    errors.push(`${path}: instructions are required`);
  }
  if (
    assignment.estimatedMinutes !== undefined &&
    (!Number.isFinite(assignment.estimatedMinutes) ||
      assignment.estimatedMinutes < 5 ||
      assignment.estimatedMinutes > 60)
  ) {
    errors.push(`${path}: estimatedMinutes must be between 5 and 60`);
  }
  if (assignment.completionCriteria && !assignment.completionCriteria.length) {
    errors.push(`${path}: completionCriteria cannot be empty when provided`);
  }
  if (!assignment.estimatedMinutes) {
    warnings.push(`${path}: estimatedMinutes helps coaches set expectations`);
  }
  if (!assignment.completionCriteria?.length) {
    warnings.push(`${path}: completionCriteria help players know when they are done`);
  }
  if (!assignment.easierOption || !assignment.harderOption) {
    warnings.push(`${path}: easier/harder options support mixed readiness`);
  }
  if (!assignment.editorial) {
    errors.push(`${path}: editorial metadata is required`);
  }
  return result(errors, warnings);
}

export function validateTacticalLesson(
  lesson: AcademyTacticalLesson,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = `lesson:${lesson.id || "(missing)"}`;
  if (!lesson.id || !lesson.title.trim() || !lesson.summary.trim()) {
    errors.push(`${path}: id, title, and summary are required`);
  }
  if (!Number.isInteger(lesson.version) || lesson.version < 1) {
    errors.push(`${path}: version must be a positive integer`);
  }
  if (
    !["foundation", "developing", "advanced"].includes(lesson.difficulty)
  ) {
    errors.push(`${path}: difficulty is invalid`);
  }
  if (!lesson.goalIds.length) {
    errors.push(`${path}: at least one linked goal is required`);
  }
  if (!lesson.learningObjective.trim()) {
    errors.push(`${path}: learning objective is required`);
  }
  for (const key of [
    "successCriteria",
    "coachingPoints",
    "commonErrors",
    "observableEvidence",
    "introduction",
    "coachQuestions",
    "playerQuestions",
    "activityIds",
    "relatedAssignmentIds",
    "relatedQuizIds",
    "evidenceTagIds",
  ] as const) {
    if (!Array.isArray(lesson[key]) || lesson[key].length === 0) {
      errors.push(`${path}: ${key} must not be empty`);
    }
  }
  if (!lesson.progression.trim()) {
    errors.push(`${path}: progression is required`);
  }
  if (!lesson.steps.length) {
    errors.push(`${path}: at least one instructional step is required`);
  }
  if (!Array.isArray(lesson.sourceProvenance)) {
    errors.push(`${path}: sourceProvenance must be an array`);
  }
  if (!lesson.editorial) {
    errors.push(`${path}: editorial metadata is required`);
  } else if (isApprovedStatus(lesson.editorial.status)) {
    if (!lesson.editorial.reviewedBy || !lesson.editorial.reviewedAt) {
      errors.push(`${path}: published lessons require human review metadata`);
    }
  }
  return result(errors, warnings);
}

export function validateQuiz(quiz: AcademyQuiz): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = `quiz:${quiz.id || "(missing)"}`;
  if (!quiz.id || !quiz.title.trim() || !quiz.description.trim()) {
    errors.push(`${path}: id, title, and description are required`);
  }
  if (!Number.isInteger(quiz.version) || quiz.version < 1) {
    errors.push(`${path}: version must be a positive integer`);
  }
  if (!quiz.goalIds.length) {
    errors.push(`${path}: at least one linked goal is required`);
  }
  if (!quiz.questionIds.length) {
    errors.push(`${path}: at least one question is required`);
  }
  if (!quiz.editorial) {
    errors.push(`${path}: editorial metadata is required`);
  } else if (isApprovedStatus(quiz.editorial.status)) {
    if (!quiz.editorial.reviewedBy || !quiz.editorial.reviewedAt) {
      errors.push(`${path}: published quizzes require human review metadata`);
    }
  }
  return result(errors, warnings);
}

export function validatePresetCatalog(
  presets: readonly AcademyPreset[],
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const preset of presets) {
    if (ids.has(preset.id)) {
      errors.push(`academy preset catalog: duplicate id ${preset.id}`);
    }
    ids.add(preset.id);
    if (!preset.id || !preset.title) {
      errors.push("academy preset catalog: preset id and title are required");
    }
    if (!Number.isInteger(preset.version) || preset.version < 1) {
      errors.push(`academy preset:${preset.id}: version must be positive`);
    }
    if (
      isApprovedStatus(preset.editorial?.status) &&
      !preset.editorial.reviewedBy
    ) {
      errors.push(
        `academy preset:${preset.id}: approved preset requires a reviewer`,
      );
    }
    const goalValidation = validateGoalCatalog(preset.annualGoals);
    errors.push(...goalValidation.errors);
    warnings.push(...goalValidation.warnings);
    const blocks = [...preset.seasonBlocks].sort(
      (a, b) => a.weekStart - b.weekStart,
    );
    let expectedWeek = 1;
    for (const block of blocks) {
      if (block.weekStart !== expectedWeek || block.weekEnd < block.weekStart) {
        errors.push(
          `academy preset:${preset.id}: blocks must cover sequential weeks without gaps or overlap`,
        );
        break;
      }
      expectedWeek = block.weekEnd + 1;
    }
    if (expectedWeek !== preset.defaults.seasonWeeks + 1) {
      errors.push(
        `academy preset:${preset.id}: blocks must cover all ${preset.defaults.seasonWeeks} weeks`,
      );
    }
  }
  return result(errors, warnings);
}

