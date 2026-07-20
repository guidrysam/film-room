import { stripSourceMetadata } from "@/lib/academy/source-privacy";
import type {
  AcademyAssignmentTemplate,
  AcademyCanonicalRecord,
  AcademyCurriculum,
  AcademyGoal,
  AcademyKnowledgeCandidate,
  AcademyPracticeTemplate,
  AcademyPreset,
  AcademyQuiz,
  AcademyQuizQuestion,
  AcademyTacticalLesson,
  PublishedAcademyCatalog,
} from "@/lib/academy/types";
import { validateAcademyCurriculum } from "@/lib/academy/curriculum-validation";
import {
  validateAcademyActivity,
  validateAcademyGoal,
  validateAssignmentTemplate,
  validatePracticeTemplate,
  validatePresetCatalog,
  validateQuiz,
  validateQuizQuestion,
  validateTacticalLesson,
  type AcademyValidationResult,
} from "@/lib/academy/validation";

function result(errors: string[], warnings: string[]): AcademyValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

function projectPublishedPayload(record: AcademyCanonicalRecord): unknown {
  const payload = stripSourceMetadata(record.payload);
  if (
    record.objectType !== "quiz_question" ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return payload;
  }
  const playerSafeQuestion = {
    ...(payload as Record<string, unknown>),
  };
  delete playerSafeQuestion.correctOptionIds;
  delete playerSafeQuestion.explanation;
  return playerSafeQuestion;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateKnowledgeCandidate(
  candidate: AcademyKnowledgeCandidate,
): AcademyValidationResult {
  const errors: string[] = [];
  const path = `candidate:${candidate.id || "(missing)"}`;
  if (!candidate.id || !candidate.workingTitle.trim()) {
    errors.push(`${path}: id and working title are required`);
  }
  if (!candidate.suggestedObjectTypes.length) {
    errors.push(`${path}: at least one object type suggestion is required`);
  }
  if (!candidate.sourceProvenance.length) {
    errors.push(`${path}: private source provenance is required`);
  }
  if (!candidate.identityFingerprint) {
    errors.push(`${path}: identity fingerprint is required`);
  }
  if (candidate.potentialDuplicateCandidateIds.includes(candidate.id)) {
    errors.push(`${path}: candidate cannot duplicate itself`);
  }
  return result(errors, []);
}

function validateTypedPayload(
  record: AcademyCanonicalRecord,
): AcademyValidationResult {
  try {
    switch (record.objectType) {
      case "activity":
      case "drill":
      case "warmup":
      case "small_sided_game":
      case "conditioned_game":
        return validateAcademyActivity(record.payload);
      case "development_goal":
        return validateAcademyGoal(record.payload as AcademyGoal);
      case "lesson":
        return validateTacticalLesson(record.payload as AcademyTacticalLesson);
      case "practice":
        return validatePracticeTemplate(
          record.payload as AcademyPracticeTemplate,
        );
      case "seasonal_program":
        return validatePresetCatalog([record.payload as AcademyPreset]);
      case "curriculum":
        return validateAcademyCurriculum(record.payload as AcademyCurriculum);
      case "assignment":
        return validateAssignmentTemplate(
          record.payload as AcademyAssignmentTemplate,
        );
      case "quiz":
        return validateQuiz(record.payload as AcademyQuiz);
      case "quiz_question":
        return validateQuizQuestion(record.payload as AcademyQuizQuestion);
      case "lesson_package": {
        const payload = record.payload as Record<string, unknown>;
        const errors: string[] = [];
        if (typeof payload.id !== "string" || !payload.id) {
          errors.push(`canonical:${record.id}: package id is required`);
        }
        if (!Array.isArray(payload.memberIds) || payload.memberIds.length < 2) {
          errors.push(
            `canonical:${record.id}: package memberIds must include dependencies`,
          );
        }
        return result(errors, []);
      }
      default:
        return result([], []);
    }
  } catch {
    return result(
      [
        `canonical:${record.id}: malformed ${record.objectType.replaceAll("_", " ")} payload`,
      ],
      [],
    );
  }
}

export function validateCanonicalRecord(
  record: AcademyCanonicalRecord,
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = `canonical:${record.id || "(missing)"}`;
  if (!record.id || !record.title.trim()) {
    errors.push(`${path}: id and title are required`);
  }
  if (!Number.isInteger(record.version) || record.version < 1) {
    errors.push(`${path}: version must be a positive integer`);
  }
  if (!isRecord(record.payload)) {
    errors.push(`${path}: payload must be an object`);
  } else if (
    typeof record.payload.id === "string" &&
    record.payload.id !== record.id
  ) {
    errors.push(`${path}: payload id must match the canonical id`);
  }
  if (!Array.isArray(record.sourceProvenance)) {
    errors.push(`${path}: source provenance must be an array`);
  }
  if (!record.deduplication?.identityFingerprint) {
    errors.push(`${path}: deduplication fingerprint is required`);
  }
  if (
    record.deduplication?.decision === "merge_into" &&
    !record.deduplication.mergeTargetId
  ) {
    errors.push(`${path}: merge decisions require a target id`);
  }
  if (
    ["approved", "published"].includes(record.lifecycle) &&
    record.deduplication.decision !== "unique"
  ) {
    errors.push(`${path}: approved content requires a unique dedup decision`);
  }
  if (["approved", "published"].includes(record.lifecycle)) {
    if (!record.reviewedBy || !record.reviewedAt) {
      errors.push(`${path}: human review metadata is required`);
    }
    if (
      !record.deduplication.reviewedBy ||
      !record.deduplication.reviewedAt
    ) {
      errors.push(`${path}: human deduplication review is required`);
    }
    if (
      record.originality?.originalWording !== true ||
      record.originality?.originalDiagram !== true ||
      !record.originality?.attestedBy ||
      !record.originality?.attestedAt
    ) {
      errors.push(
        `${path}: originality requires human wording and diagram attestation`,
      );
    }
    if (isRecord(record.payload)) {
      const editorial = isRecord(record.payload.editorial)
        ? record.payload.editorial
        : null;
      if (editorial) {
        if (!["approved", "published"].includes(String(editorial.status))) {
          errors.push(
            `${path}: approved records require approved payload editorial status`,
          );
        }
        if (
          editorial.originalWording !== true ||
          editorial.originalDiagram !== true
        ) {
          errors.push(
            `${path}: publication requires original Film Room wording and diagrams`,
          );
        }
      }
    }
  }
  if (record.lifecycle === "published" && !record.publishedAt) {
    errors.push(`${path}: publishedAt is required`);
  }
  if (
    ["approved", "published"].includes(record.lifecycle) &&
    [
      "activity",
      "drill",
      "warmup",
      "small_sided_game",
      "conditioned_game",
    ].includes(record.objectType) &&
    isRecord(record.payload)
  ) {
    for (const key of [
      "relatedActivityIds",
      "relatedLessonIds",
      "relatedAssignmentIds",
      "relatedQuizIds",
      "evidenceTagIds",
    ]) {
      if (!Array.isArray(record.payload[key])) {
        errors.push(`${path}: published activities require ${key}`);
      }
    }
  }
  const versions = record.versionHistory.map((entry) => entry.version);
  if (!versions.includes(record.version)) {
    errors.push(`${path}: version history must include the current version`);
  }

  const payloadValidation = validateTypedPayload(record);
  errors.push(...payloadValidation.errors);
  warnings.push(...payloadValidation.warnings);
  return result(errors, warnings);
}

export function validateCanonicalCatalog(
  records: readonly AcademyCanonicalRecord[],
): AcademyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const publishedFingerprints = new Map<string, string>();
  for (const record of records) {
    if (ids.has(record.id)) {
      errors.push(`canonical catalog: duplicate id ${record.id}`);
    }
    ids.add(record.id);
    const validation = validateCanonicalRecord(record);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
    if (record.lifecycle !== "published") continue;
    const fingerprint = record.deduplication.identityFingerprint;
    const existingId = publishedFingerprints.get(fingerprint);
    if (existingId) {
      errors.push(
        `canonical catalog: ${record.id} duplicates published object ${existingId}`,
      );
    } else {
      publishedFingerprints.set(fingerprint, record.id);
    }
  }
  for (const record of records) {
    const mergeTargetId = record.deduplication.mergeTargetId;
    if (mergeTargetId && !ids.has(mergeTargetId)) {
      errors.push(
        `canonical:${record.id}: unknown merge target ${mergeTargetId}`,
      );
    }
  }
  return result([...new Set(errors)], warnings);
}

export function buildPublishedAcademyCatalog(
  records: readonly AcademyCanonicalRecord[],
  options: { catalogId: string; catalogVersion: number },
): PublishedAcademyCatalog {
  const validation = validateCanonicalCatalog(records);
  if (!validation.valid) {
    throw new Error(validation.errors.join("\n"));
  }
  return {
    schemaVersion: 1,
    catalogId: options.catalogId,
    catalogVersion: options.catalogVersion,
    objects: records
      .filter((record) => record.lifecycle === "published")
      .sort(
        (left, right) =>
          left.objectType.localeCompare(right.objectType) ||
          left.id.localeCompare(right.id),
      )
      .map((record) => ({
        id: record.id,
        objectType: record.objectType,
        version: record.version,
        title: record.title,
        identityFingerprint: record.deduplication.identityFingerprint,
        payload: projectPublishedPayload(record),
      })),
  };
}

