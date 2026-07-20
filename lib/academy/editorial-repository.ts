import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildPublishedAcademyCatalog,
  validateCanonicalCatalog,
  validateCanonicalRecord,
} from "@/lib/academy/catalog-validation";
import { requireAcademyEditor } from "@/lib/academy/editorial-auth";
import { transitionEditorialRecord } from "@/lib/academy/editorial-transitions";
import { validateAcademyLessonPackage } from "@/lib/academy/lesson-package-validation";
import {
  OPEN_BODY_PACKAGE_ID,
  buildOpenBodyEditorialRecords,
  getOpenBodyPackageMemberRecords,
} from "@/lib/academy/open-body-package";
import {
  ACADEMY_CANONICAL_EDITORIAL_DIR,
  academyEditorialAuditPath,
  academyEditorialRecordPath,
  academyPublishedCatalogPath,
  academyReportPath,
} from "@/lib/academy/paths";
import { stripSourceMetadata } from "@/lib/academy/source-privacy";
import type {
  AcademyActivity,
  AcademyAssignmentTemplate,
  AcademyCanonicalRecord,
  AcademyEditorialAuditEntry,
  AcademyLessonPackageManifest,
  AcademyQuiz,
  AcademyQuizQuestion,
  AcademyTacticalLesson,
  AcademyWorkflowStatus,
  PublishedAcademyCatalog,
} from "@/lib/academy/types";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

export type AcademyPackageReadiness =
  | "incomplete"
  | "awaiting_review"
  | "approved"
  | "ready_to_publish"
  | "published"
  | "blocked";

async function writeJsonAtomic(
  filename: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temp = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, filename);
}

export async function appendEditorialAudit(
  entries: readonly AcademyEditorialAuditEntry[],
): Promise<void> {
  if (!entries.length) return;
  await mkdir(ACADEMY_CANONICAL_EDITORIAL_DIR, { recursive: true });
  const lines = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  await writeFile(academyEditorialAuditPath(), lines, { flag: "a", encoding: "utf8" });
}

export async function readEditorialAudit(): Promise<
  AcademyEditorialAuditEntry[]
> {
  try {
    const raw = await readFile(academyEditorialAuditPath(), "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AcademyEditorialAuditEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function saveEditorialRecord(
  record: AcademyCanonicalRecord,
): Promise<void> {
  await writeJsonAtomic(academyEditorialRecordPath(record.id), record);
}

export async function seedOpenBodyEditorialPackage(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AcademyCanonicalRecord[]> {
  requireAcademyEditor(env);
  const records = buildOpenBodyEditorialRecords("needs_coach_review");
  for (const record of records) {
    await saveEditorialRecord(record);
  }
  return records;
}

function payloadAs<T>(record: AcademyCanonicalRecord): T {
  return record.payload as T;
}

export function extractLessonPackageContent(
  records: readonly AcademyCanonicalRecord[],
  packageId = OPEN_BODY_PACKAGE_ID,
) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const packageRecord = byId.get(packageId);
  if (!packageRecord) {
    throw new Error(`Package ${packageId} was not found in editorial records.`);
  }
  const manifest = payloadAs<AcademyLessonPackageManifest>(packageRecord);
  const lesson = payloadAs<AcademyTacticalLesson>(
    byId.get(manifest.lessonId)!,
  );
  const activities = manifest.activityIds.map((id) =>
    payloadAs<AcademyActivity>(byId.get(id)!),
  );
  const assignment = payloadAs<AcademyAssignmentTemplate>(
    byId.get(manifest.assignmentId)!,
  );
  const quiz = payloadAs<AcademyQuiz>(byId.get(manifest.quizId)!);
  const questions = manifest.questionIds.map((id) =>
    payloadAs<AcademyQuizQuestion>(byId.get(id)!),
  );
  return {
    packageRecord,
    manifest,
    lesson,
    activities,
    assignment,
    quiz,
    questions,
    members: getOpenBodyPackageMemberRecords(records).filter(
      (record) => record.id !== packageId,
    ),
  };
}

export function evaluatePackageReadiness(
  records: readonly AcademyCanonicalRecord[],
  packageId = OPEN_BODY_PACKAGE_ID,
): {
  readiness: AcademyPackageReadiness;
  validationErrors: string[];
  statuses: Record<string, AcademyWorkflowStatus | string>;
} {
  try {
    const content = extractLessonPackageContent(records, packageId);
    const statuses = Object.fromEntries(
      [content.packageRecord, ...content.members].map((record) => [
        record.id,
        record.lifecycle === "needs_review"
          ? "needs_coach_review"
          : record.lifecycle,
      ]),
    );
    const reviewValidation = validateAcademyLessonPackage({
      catalog: U12_ACADEMY_GOAL_CATALOG,
      lesson: content.lesson,
      activities: content.activities,
      assignment: content.assignment,
      quiz: content.quiz,
      questions: content.questions,
      policy: "review",
    });
    if (!reviewValidation.valid) {
      return {
        readiness: "incomplete",
        validationErrors: reviewValidation.errors,
        statuses,
      };
    }
    const memberStatuses = content.members.map((record) =>
      record.lifecycle === "needs_review"
        ? "needs_coach_review"
        : record.lifecycle,
    );
    if (memberStatuses.every((status) => status === "published")) {
      return { readiness: "published", validationErrors: [], statuses };
    }
    if (memberStatuses.some((status) => status === "rejected")) {
      return {
        readiness: "blocked",
        validationErrors: ["One or more package members are rejected."],
        statuses,
      };
    }
    if (
      memberStatuses.every(
        (status) => status === "approved" || status === "published",
      )
    ) {
      const publishValidation = validateAcademyLessonPackage({
        catalog: U12_ACADEMY_GOAL_CATALOG,
        lesson: content.lesson,
        activities: content.activities,
        assignment: content.assignment,
        quiz: content.quiz,
        questions: content.questions,
        policy: "publish",
      });
      return {
        readiness: publishValidation.valid
          ? "ready_to_publish"
          : "approved",
        validationErrors: publishValidation.errors,
        statuses,
      };
    }
    if (
      memberStatuses.every(
        (status) =>
          status === "needs_coach_review" ||
          status === "approved" ||
          status === "published",
      )
    ) {
      return { readiness: "awaiting_review", validationErrors: [], statuses };
    }
    return {
      readiness: "blocked",
      validationErrors: ["Package members are in incompatible editorial states."],
      statuses,
    };
  } catch (error) {
    return {
      readiness: "incomplete",
      validationErrors: [
        error instanceof Error ? error.message : "Unknown package error",
      ],
      statuses: {},
    };
  }
}

export function transitionEditorialObject(
  records: readonly AcademyCanonicalRecord[],
  input: {
    objectId: string;
    to: AcademyWorkflowStatus;
    actor: string;
    at: string;
    reason?: string;
    note?: string;
  },
): {
  records: AcademyCanonicalRecord[];
  auditEntry: AcademyEditorialAuditEntry;
  changed: AcademyCanonicalRecord;
} {
  const index = records.findIndex((record) => record.id === input.objectId);
  if (index < 0) {
    throw new Error(`Editorial object ${input.objectId} was not found.`);
  }
  const current = records[index]!;
  if (input.to === "approved" || input.to === "published") {
    const validation = validateCanonicalRecord(current);
    // Approve/publish still require uniqueness attestation; ensure present.
    if (
      current.deduplication.decision !== "unique" ||
      !current.originality.originalWording ||
      !current.originality.originalDiagram
    ) {
      throw new Error(
        `${current.id}: approval requires unique dedup decision and originality attestation.`,
      );
    }
    if (!validation.valid && input.to === "published") {
      throw new Error(validation.errors.join("\n"));
    }
  }
  const { record, auditEntry } = transitionEditorialRecord(current, input.to, {
    actor: input.actor,
    at: input.at,
    reason: input.reason,
    note: input.note,
  });
  if (input.to === "approved" || input.to === "published") {
    // Ensure payload/safety for activities when approving.
    if (
      ["activity", "warmup", "small_sided_game", "conditioned_game", "drill"].includes(
        record.objectType,
      )
    ) {
      const payload = record.payload as AcademyActivity;
      record.payload = {
        ...payload,
        safetyReview: {
          ...payload.safetyReview,
          status: "safe",
          concerns: [],
          recommendedChanges: [],
        },
        editorial: {
          ...payload.editorial,
          status: input.to,
          reviewedBy: input.actor,
          reviewedAt: input.at,
          approvedBy: input.actor,
          approvedAt: input.at,
          ...(input.to === "published"
            ? { publishedBy: input.actor, publishedAt: input.at }
            : {}),
        },
      };
    }
    const validation = validateCanonicalRecord(record);
    if (!validation.valid) {
      throw new Error(validation.errors.join("\n"));
    }
  }
  const nextRecords = [...records];
  nextRecords[index] = record;
  return { records: nextRecords, auditEntry, changed: record };
}

export function approveOpenBodyPackage(
  records: readonly AcademyCanonicalRecord[],
  input: { actor: string; at: string; note?: string },
): {
  records: AcademyCanonicalRecord[];
  auditEntries: AcademyEditorialAuditEntry[];
} {
  let current = [...records];
  const auditEntries: AcademyEditorialAuditEntry[] = [];
  const content = extractLessonPackageContent(current);
  const packageValidation = validateAcademyLessonPackage({
    catalog: U12_ACADEMY_GOAL_CATALOG,
    lesson: content.lesson,
    activities: content.activities,
    assignment: content.assignment,
    quiz: content.quiz,
    questions: content.questions,
    policy: "review",
  });
  if (!packageValidation.valid) {
    throw new Error(packageValidation.errors.join("\n"));
  }
  for (const member of [content.packageRecord, ...content.members]) {
    const status =
      member.lifecycle === "needs_review"
        ? "needs_coach_review"
        : member.lifecycle;
    if (status === "approved" || status === "published") continue;
    if (status !== "needs_coach_review") {
      throw new Error(
        `${member.id}: package approval requires needs_coach_review (found ${status}).`,
      );
    }
    const result = transitionEditorialObject(current, {
      objectId: member.id,
      to: "approved",
      actor: input.actor,
      at: input.at,
      note: input.note,
    });
    current = result.records;
    auditEntries.push(result.auditEntry);
  }
  return { records: current, auditEntries };
}

export function publishOpenBodyPackage(
  records: readonly AcademyCanonicalRecord[],
  input: {
    actor: string;
    at: string;
    catalogId?: string;
    catalogVersion: number;
    note?: string;
  },
): {
  records: AcademyCanonicalRecord[];
  auditEntries: AcademyEditorialAuditEntry[];
  publishedCatalog: PublishedAcademyCatalog;
} {
  let current = [...records];
  const auditEntries: AcademyEditorialAuditEntry[] = [];
  const content = extractLessonPackageContent(current);
  // Refresh content after ensuring every member is approved.
  for (const member of [content.packageRecord, ...content.members]) {
    const status =
      member.lifecycle === "needs_review"
        ? "needs_coach_review"
        : member.lifecycle;
    if (status === "published") continue;
    if (status !== "approved") {
      throw new Error(
        `${member.id}: package publish requires approved dependencies (found ${status}).`,
      );
    }
  }
  const refreshed = extractLessonPackageContent(current);
  const publishValidation = validateAcademyLessonPackage({
    catalog: U12_ACADEMY_GOAL_CATALOG,
    lesson: refreshed.lesson,
    activities: refreshed.activities,
    assignment: refreshed.assignment,
    quiz: refreshed.quiz,
    questions: refreshed.questions,
    policy: "publish",
  });
  if (!publishValidation.valid) {
    throw new Error(publishValidation.errors.join("\n"));
  }
  for (const member of [refreshed.packageRecord, ...refreshed.members]) {
    if (member.lifecycle === "published") continue;
    const result = transitionEditorialObject(current, {
      objectId: member.id,
      to: "published",
      actor: input.actor,
      at: input.at,
      note: input.note,
    });
    current = result.records;
    auditEntries.push(result.auditEntry);
  }
  const catalogValidation = validateCanonicalCatalog(current);
  if (!catalogValidation.valid) {
    throw new Error(catalogValidation.errors.join("\n"));
  }
  const publishedCatalog = buildPublishedAcademyCatalog(current, {
    catalogId: input.catalogId ?? "film-room-academy",
    catalogVersion: input.catalogVersion,
  });
  // Ensure published payloads contain no private editorial notes/provenance.
  for (const object of publishedCatalog.objects) {
    const serialized = JSON.stringify(object.payload);
    if (
      serialized.includes("sourceDocumentId") ||
      serialized.includes("editorialNotes") ||
      serialized.includes("rejectionReason")
    ) {
      throw new Error(
        `${object.id}: published payload leaked private editorial metadata.`,
      );
    }
    // Re-strip defensively for Team Academy projections.
    object.payload = stripSourceMetadata(object.payload);
  }
  return { records: current, auditEntries, publishedCatalog };
}

export function unpublishOpenBodyPackage(
  records: readonly AcademyCanonicalRecord[],
  input: {
    actor: string;
    at: string;
    catalogId?: string;
    catalogVersion: number;
    note?: string;
  },
): {
  records: AcademyCanonicalRecord[];
  auditEntries: AcademyEditorialAuditEntry[];
  publishedCatalog: PublishedAcademyCatalog;
} {
  let current = [...records];
  const auditEntries: AcademyEditorialAuditEntry[] = [];
  const content = extractLessonPackageContent(current);
  for (const member of [content.packageRecord, ...content.members]) {
    if (member.lifecycle !== "published") continue;
    const result = transitionEditorialObject(current, {
      objectId: member.id,
      to: "approved",
      actor: input.actor,
      at: input.at,
      note: input.note,
    });
    current = result.records;
    auditEntries.push(result.auditEntry);
  }
  const publishedCatalog = buildPublishedAcademyCatalog(current, {
    catalogId: input.catalogId ?? "film-room-academy",
    catalogVersion: input.catalogVersion,
  });
  return { records: current, auditEntries, publishedCatalog };
}

export async function persistEditorialCatalogState(input: {
  records: readonly AcademyCanonicalRecord[];
  auditEntries?: readonly AcademyEditorialAuditEntry[];
  publishedCatalog?: PublishedAcademyCatalog;
}): Promise<void> {
  for (const record of input.records) {
    await saveEditorialRecord(record);
  }
  if (input.auditEntries?.length) {
    await appendEditorialAudit(input.auditEntries);
  }
  if (input.publishedCatalog) {
    await writeJsonAtomic(
      academyPublishedCatalogPath(),
      input.publishedCatalog,
    );
    await writeJsonAtomic(academyReportPath("published-catalog-summary.json"), {
      schemaVersion: 1,
      catalogId: input.publishedCatalog.catalogId,
      catalogVersion: input.publishedCatalog.catalogVersion,
      publishedObjectCount: input.publishedCatalog.objects.length,
      privateProvenanceIncluded: false,
    });
  }
}
