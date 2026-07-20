import type {
  AcademyCurriculum,
  AcademyCurriculumCalendarSlot,
  AcademyCurriculumOwnership,
  AcademyLearningSequence,
  AcademyTrainingBlock,
} from "@/lib/academy/types";
import type { AcademyValidationResult } from "@/lib/academy/validation";

function result(errors: string[], warnings: string[]): AcademyValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateOwnership(
  ownership: AcademyCurriculumOwnership,
  path: string,
  errors: string[],
): void {
  if (!ownership || typeof ownership !== "object") {
    errors.push(`${path}: ownership is required`);
    return;
  }
  if (ownership.kind === "film_room") {
    return;
  }
  if (ownership.kind === "club") {
    if (!ownership.clubId?.trim()) {
      errors.push(`${path}: club ownership requires clubId`);
    }
    if (!ownership.sourceCurriculumId?.trim()) {
      errors.push(`${path}: club ownership requires sourceCurriculumId`);
    }
    if (
      !Number.isInteger(ownership.sourceVersion) ||
      ownership.sourceVersion < 1
    ) {
      errors.push(`${path}: club ownership requires sourceVersion >= 1`);
    }
    return;
  }
  if (ownership.kind === "team_adaptation") {
    if (!ownership.teamId?.trim()) {
      errors.push(`${path}: team_adaptation ownership requires teamId`);
    }
    if (!ownership.sourceCurriculumId?.trim()) {
      errors.push(
        `${path}: team_adaptation ownership requires sourceCurriculumId`,
      );
    }
    if (
      !Number.isInteger(ownership.sourceVersion) ||
      ownership.sourceVersion < 1
    ) {
      errors.push(
        `${path}: team_adaptation ownership requires sourceVersion >= 1`,
      );
    }
    return;
  }
  errors.push(`${path}: unknown ownership kind`);
}

function validateLearningSequence(
  sequence: AcademyLearningSequence,
  blockPath: string,
  errors: string[],
): void {
  const path = `${blockPath}/sequence:${sequence.id || "(missing)"}`;
  if (!sequence.id?.trim()) {
    errors.push(`${path}: id is required`);
  }
  if (!sequence.title?.trim()) {
    errors.push(`${path}: title is required`);
  }
  if (!Number.isInteger(sequence.order) || sequence.order < 1) {
    errors.push(`${path}: order must be a positive integer`);
  }
  if (!Array.isArray(sequence.slots) || sequence.slots.length === 0) {
    errors.push(`${path}: at least one slot is required`);
    return;
  }
  const orders = new Set<number>();
  for (const slot of sequence.slots) {
    if (!Number.isInteger(slot.order) || slot.order < 1) {
      errors.push(`${path}: slot order must be a positive integer`);
    }
    if (orders.has(slot.order)) {
      errors.push(`${path}: duplicate slot order ${slot.order}`);
    }
    orders.add(slot.order);
    if (!slot.title?.trim()) {
      errors.push(`${path}/slot:${slot.order}: title is required`);
    }
    if (
      slot.kind !== "core_lesson" &&
      slot.kind !== "flexible" &&
      slot.kind !== "assessment"
    ) {
      errors.push(`${path}/slot:${slot.order}: invalid kind`);
    }
    if (slot.kind === "core_lesson" && !slot.lessonId?.trim()) {
      errors.push(
        `${path}/slot:${slot.order}: core_lesson slots require lessonId`,
      );
    }
    if (slot.kind === "flexible" && !slot.flexibleWeekId?.trim()) {
      errors.push(
        `${path}/slot:${slot.order}: flexible slots require flexibleWeekId`,
      );
    }
    if (
      slot.lessonId === "academy-lesson-receive-open-body" &&
      slot.lessonPackageId &&
      slot.lessonPackageId !== "academy-package-receive-open-body"
    ) {
      errors.push(
        `${path}/slot:${slot.order}: open-body lesson must reference academy-package-receive-open-body`,
      );
    }
  }
}

function validateTrainingBlock(
  block: AcademyTrainingBlock,
  path: string,
  errors: string[],
  warnings: string[],
): void {
  if (!block.id?.trim()) {
    errors.push(`${path}: id is required`);
  }
  if (!block.title?.trim()) {
    errors.push(`${path}: title is required`);
  }
  if (!Number.isInteger(block.order) || block.order < 1) {
    errors.push(`${path}: order must be a positive integer`);
  }
  if (!block.objective?.trim()) {
    errors.push(`${path}: objective is required`);
  }
  if (!Array.isArray(block.playerOutcomes) || block.playerOutcomes.length === 0) {
    errors.push(`${path}: playerOutcomes must be non-empty`);
  }
  if (!Array.isArray(block.transitionHabits)) {
    errors.push(`${path}: transitionHabits must be an array`);
  } else if (block.order >= 2 && block.transitionHabits.length === 0) {
    warnings.push(
      `${path}: blocks after week-one should weave transitionHabits`,
    );
  }
  if (
    !Array.isArray(block.learningSequences) ||
    block.learningSequences.length === 0
  ) {
    errors.push(`${path}: at least one learning sequence is required`);
    return;
  }
  const sequenceOrders = new Set<number>();
  const sequenceIds = new Set<string>();
  for (const sequence of block.learningSequences) {
    if (sequenceIds.has(sequence.id)) {
      errors.push(`${path}: duplicate learning sequence id ${sequence.id}`);
    }
    sequenceIds.add(sequence.id);
    if (sequenceOrders.has(sequence.order)) {
      errors.push(`${path}: duplicate learning sequence order ${sequence.order}`);
    }
    sequenceOrders.add(sequence.order);
    validateLearningSequence(sequence, path, errors);
  }
  const weeks = block.recommendedDurationWeeks;
  if (
    !weeks ||
    weeks.min < 1 ||
    weeks.default < weeks.min ||
    weeks.max < weeks.default
  ) {
    errors.push(`${path}: recommendedDurationWeeks must satisfy min ≤ default ≤ max`);
  }
}

function validateCalendarSlots(
  curriculum: AcademyCurriculum,
  errors: string[],
): void {
  const slots = curriculum.calendarSlots;
  if (!slots?.length) return;

  const blockById = new Map(
    curriculum.trainingBlocks.map((block) => [block.id, block]),
  );
  const orders = new Set<number>();
  for (const slot of slots) {
    const path = `curriculum:${curriculum.id}/calendar:${slot.id || "(missing)"}`;
    if (!slot.id?.trim()) {
      errors.push(`${path}: id is required`);
    }
    if (!Number.isInteger(slot.order) || slot.order < 1) {
      errors.push(`${path}: order must be a positive integer`);
    }
    if (orders.has(slot.order)) {
      errors.push(`${path}: duplicate calendar order ${slot.order}`);
    }
    orders.add(slot.order);
    const block = blockById.get(slot.trainingBlockId);
    if (!block) {
      errors.push(`${path}: unknown trainingBlockId ${slot.trainingBlockId}`);
      continue;
    }
    const sequence = block.learningSequences.find(
      (item) => item.id === slot.learningSequenceId,
    );
    if (!sequence) {
      errors.push(
        `${path}: unknown learningSequenceId ${slot.learningSequenceId}`,
      );
      continue;
    }
    if (
      !sequence.slots.some((item) => item.order === slot.sequenceSlotOrder)
    ) {
      errors.push(
        `${path}: sequenceSlotOrder ${slot.sequenceSlotOrder} not found on sequence`,
      );
    }
  }
}

function collectCoreLessonIds(curriculum: AcademyCurriculum): string[] {
  const lessonIds: string[] = [];
  for (const block of curriculum.trainingBlocks) {
    for (const sequence of block.learningSequences) {
      for (const slot of sequence.slots) {
        if (slot.kind === "core_lesson" && slot.lessonId) {
          lessonIds.push(slot.lessonId);
        }
      }
    }
  }
  return lessonIds;
}

export function validateAcademyCurriculum(
  curriculum: AcademyCurriculum,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = `curriculum:${curriculum.id || "(missing)"}`;

  if (!curriculum.id?.trim()) {
    errors.push(`${path}: id is required`);
  }
  if (!curriculum.title?.trim()) {
    errors.push(`${path}: title is required`);
  }
  if (!Number.isInteger(curriculum.version) || curriculum.version < 1) {
    errors.push(`${path}: version must be a positive integer`);
  }
  if (!curriculum.shortDescription?.trim()) {
    errors.push(`${path}: shortDescription is required`);
  }
  if (
    !curriculum.ageBand ||
    curriculum.ageBand.minAge < 1 ||
    curriculum.ageBand.maxAge < curriculum.ageBand.minAge
  ) {
    errors.push(`${path}: ageBand min/max is invalid`);
  }
  validateOwnership(curriculum.ownership, path, errors);

  const flex = curriculum.defaults?.clubIdentityFlexPercent;
  if (!flex || flex.min < 0 || flex.max > 100 || flex.min > flex.max) {
    errors.push(`${path}: clubIdentityFlexPercent must satisfy 0 ≤ min ≤ max ≤ 100`);
  } else if (flex.min < 10 || flex.max > 15) {
    warnings.push(
      `${path}: club identity flex is outside the recommended 10–15% band`,
    );
  }

  if (
    !Number.isInteger(curriculum.defaults?.coreLessonCount) ||
    curriculum.defaults.coreLessonCount < 1
  ) {
    errors.push(`${path}: defaults.coreLessonCount must be a positive integer`);
  }
  if (
    !Number.isInteger(curriculum.defaults?.flexibleWeekCount) ||
    curriculum.defaults.flexibleWeekCount < 0
  ) {
    errors.push(`${path}: defaults.flexibleWeekCount must be a non-negative integer`);
  }

  if (
    !Array.isArray(curriculum.trainingBlocks) ||
    curriculum.trainingBlocks.length === 0
  ) {
    errors.push(`${path}: at least one training block is required`);
  } else {
    const blockIds = new Set<string>();
    const blockOrders = new Set<number>();
    for (const block of curriculum.trainingBlocks) {
      if (blockIds.has(block.id)) {
        errors.push(`${path}: duplicate training block id ${block.id}`);
      }
      blockIds.add(block.id);
      if (blockOrders.has(block.order)) {
        errors.push(`${path}: duplicate training block order ${block.order}`);
      }
      blockOrders.add(block.order);
      validateTrainingBlock(
        block,
        `${path}/block:${block.id || "(missing)"}`,
        errors,
        warnings,
      );
    }
    const allBlockIds = new Set(curriculum.trainingBlocks.map((b) => b.id));
    for (const block of curriculum.trainingBlocks) {
      for (const prerequisiteId of block.prerequisiteBlockIds) {
        if (!allBlockIds.has(prerequisiteId)) {
          errors.push(
            `${path}/block:${block.id}: unknown prerequisite ${prerequisiteId}`,
          );
        }
      }
    }
  }

  const coreLessonIds = collectCoreLessonIds(curriculum);
  const uniqueCore = new Set(coreLessonIds);
  if (uniqueCore.size !== coreLessonIds.length) {
    errors.push(`${path}: core lessonIds must be unique across the curriculum`);
  }
  if (
    curriculum.defaults?.coreLessonCount &&
    coreLessonIds.length !== curriculum.defaults.coreLessonCount
  ) {
    errors.push(
      `${path}: expected ${curriculum.defaults.coreLessonCount} core lessons, found ${coreLessonIds.length}`,
    );
  }

  if (!Array.isArray(curriculum.conceptSpirals) || curriculum.conceptSpirals.length === 0) {
    warnings.push(`${path}: conceptSpirals should document the spiral curriculum`);
  } else {
    const coreSet = new Set(coreLessonIds);
    for (const spiral of curriculum.conceptSpirals) {
      const spiralPath = `${path}/spiral:${spiral.conceptId || "(missing)"}`;
      if (!spiral.conceptId?.trim() || !spiral.label?.trim()) {
        errors.push(`${spiralPath}: conceptId and label are required`);
      }
      for (const key of [
        "introduceLessonId",
        "practiceLessonId",
        "applyLessonId",
        "masterLessonId",
      ] as const) {
        const lessonId = spiral[key];
        if (!lessonId?.trim()) {
          errors.push(`${spiralPath}: ${key} is required`);
        } else if (coreSet.size > 0 && !coreSet.has(lessonId)) {
          // Allow map-style IDs that are not yet slotted; warn only.
          warnings.push(
            `${spiralPath}: ${key} ${lessonId} is not yet a core sequence lessonId`,
          );
        }
      }
    }
  }

  validateCalendarSlots(curriculum, errors);

  if (!curriculum.editorial || !curriculum.editorial.status) {
    errors.push(`${path}: editorial.status is required`);
  }

  return result([...new Set(errors)], [...new Set(warnings)]);
}

export function validateCurriculumCalendarSlot(
  slot: AcademyCurriculumCalendarSlot,
): AcademyValidationResult {
  const errors: string[] = [];
  if (!slot.id?.trim()) errors.push("calendar slot: id is required");
  if (!slot.trainingBlockId?.trim()) {
    errors.push("calendar slot: trainingBlockId is required");
  }
  if (!slot.learningSequenceId?.trim()) {
    errors.push("calendar slot: learningSequenceId is required");
  }
  if (!Number.isInteger(slot.sequenceSlotOrder) || slot.sequenceSlotOrder < 1) {
    errors.push("calendar slot: sequenceSlotOrder must be a positive integer");
  }
  return result(errors, []);
}

export function isCurriculumPayload(value: unknown): value is AcademyCurriculum {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.trainingBlocks) &&
    isRecord(value.ownership)
  );
}
