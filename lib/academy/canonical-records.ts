import {
  buildCanonicalIdentityFingerprint,
  createStableCanonicalId,
} from "@/lib/academy/catalog-deduplication";
import { validateCanonicalRecord } from "@/lib/academy/catalog-validation";
import type {
  AcademyCanonicalLifecycle,
  AcademyCanonicalObjectType,
  AcademyCanonicalRecord,
  AcademyKnowledgeCandidate,
  SourceInfluence,
} from "@/lib/academy/types";

const ALLOWED_TRANSITIONS: Record<
  AcademyCanonicalLifecycle,
  AcademyCanonicalLifecycle[]
> = {
  draft: ["needs_review", "rejected"],
  needs_review: ["draft", "approved", "rejected"],
  approved: ["needs_review", "published", "archived"],
  // Unpublish returns content to approved without deleting the editorial record.
  published: ["approved", "needs_review", "archived"],
  archived: ["needs_review"],
  rejected: ["draft", "needs_review"],
};

function uniqueProvenance(
  influences: readonly SourceInfluence[],
): SourceInfluence[] {
  const byKey = new Map<string, SourceInfluence>();
  for (const influence of influences) {
    const key = [
      influence.sourceDocumentId,
      influence.sourceItemId ?? "",
      influence.relationship,
    ].join("|");
    byKey.set(key, influence);
  }
  return [...byKey.values()];
}

export function createCanonicalDraft(input: {
  objectType: AcademyCanonicalObjectType;
  title: string;
  payload: unknown;
  candidates?: readonly AcademyKnowledgeCandidate[];
  reservedIds?: ReadonlySet<string>;
  createdBy: string;
  createdAt: string;
}): AcademyCanonicalRecord {
  const id = createStableCanonicalId(
    input.objectType,
    input.title,
    input.reservedIds,
  );
  const payload =
    input.payload &&
    typeof input.payload === "object" &&
    !Array.isArray(input.payload)
      ? { ...(input.payload as Record<string, unknown>), id }
      : input.payload;
  const candidates = input.candidates ?? [];
  return {
    id,
    objectType: input.objectType,
    version: 1,
    title: input.title,
    lifecycle: "draft",
    payload,
    sourceProvenance: uniqueProvenance(
      candidates.flatMap((candidate) => candidate.sourceProvenance),
    ),
    sourceCandidateIds: candidates.map((candidate) => candidate.id).sort(),
    editorialNotes: [],
    originality: {
      originalWording: false,
      originalDiagram: false,
    },
    deduplication: {
      identityFingerprint: buildCanonicalIdentityFingerprint({
        objectType: input.objectType,
        title: input.title,
      }),
      decision: "needs_review",
      comparedCanonicalIds: [],
      confidence: 0,
    },
    versionHistory: [
      {
        version: 1,
        changedAt: input.createdAt,
        changedBy: input.createdBy,
        summary: "Initial original Film Room draft.",
      },
    ],
  };
}

function updatePayloadEditorial(
  payload: unknown,
  lifecycle: AcademyCanonicalLifecycle,
  actor: string,
  at: string,
): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  if (
    !record.editorial ||
    typeof record.editorial !== "object" ||
    Array.isArray(record.editorial)
  ) {
    return payload;
  }
  const editorial = record.editorial as Record<string, unknown>;
  const status =
    lifecycle === "needs_review"
      ? "needs_coach_review"
      : lifecycle === "published"
        ? "published"
        : lifecycle;
  return {
    ...record,
    editorial: {
      ...editorial,
      status,
      updatedAt: at,
      ...(["approved", "published"].includes(lifecycle)
        ? {
            reviewedBy: actor,
            reviewedAt: at,
            approvedBy: actor,
            approvedAt: at,
          }
        : {}),
      ...(lifecycle === "published"
        ? { publishedBy: actor, publishedAt: at }
        : {}),
      ...(lifecycle === "approved"
        ? { publishedBy: undefined, publishedAt: undefined }
        : {}),
    },
  };
}

export function transitionCanonicalRecord(
  record: AcademyCanonicalRecord,
  lifecycle: AcademyCanonicalLifecycle,
  input: { actor: string; at: string },
): AcademyCanonicalRecord {
  if (!ALLOWED_TRANSITIONS[record.lifecycle].includes(lifecycle)) {
    throw new Error(
      `Invalid canonical lifecycle transition: ${record.lifecycle} -> ${lifecycle}`,
    );
  }
  const next: AcademyCanonicalRecord = {
    ...record,
    lifecycle,
    payload: updatePayloadEditorial(
      record.payload,
      lifecycle,
      input.actor,
      input.at,
    ),
    updatedAt: input.at,
    createdAt: record.createdAt ?? input.at,
    ...(["approved", "published"].includes(lifecycle)
      ? {
          reviewedBy: input.actor,
          reviewedAt: input.at,
          approvedBy: input.actor,
          approvedAt: input.at,
        }
      : {}),
    ...(lifecycle === "published"
      ? { publishedBy: input.actor, publishedAt: input.at }
      : {}),
    ...(lifecycle === "approved"
      ? { publishedBy: undefined, publishedAt: undefined }
      : {}),
  };
  if (lifecycle === "approved" || lifecycle === "published") {
    const validation = validateCanonicalRecord(next);
    if (!validation.valid) throw new Error(validation.errors.join("\n"));
  }
  return next;
}

export function attestCanonicalOriginality(
  record: AcademyCanonicalRecord,
  input: {
    originalWording: boolean;
    originalDiagram: boolean;
    actor: string;
    at: string;
  },
): AcademyCanonicalRecord {
  if (record.lifecycle === "published") {
    throw new Error("Published content must be revised before re-attestation.");
  }
  return {
    ...record,
    originality: {
      originalWording: input.originalWording,
      originalDiagram: input.originalDiagram,
      attestedBy: input.actor,
      attestedAt: input.at,
    },
  };
}

export function reviseCanonicalRecord(
  record: AcademyCanonicalRecord,
  input: {
    title?: string;
    payload: unknown;
    changedBy: string;
    changedAt: string;
    summary: string;
  },
): AcademyCanonicalRecord {
  const title = input.title ?? record.title;
  const version = record.version + 1;
  return {
    ...record,
    version,
    title,
    lifecycle: "needs_review",
    payload: updatePayloadEditorial(
      input.payload,
      "needs_review",
      input.changedBy,
      input.changedAt,
    ),
    originality: {
      originalWording: false,
      originalDiagram: false,
    },
    deduplication: {
      identityFingerprint: buildCanonicalIdentityFingerprint({
        objectType: record.objectType,
        title,
      }),
      decision: "needs_review",
      comparedCanonicalIds: [],
      confidence: 0,
    },
    versionHistory: [
      ...record.versionHistory,
      {
        version,
        changedAt: input.changedAt,
        changedBy: input.changedBy,
        summary: input.summary,
      },
    ],
    reviewedBy: undefined,
    reviewedAt: undefined,
    publishedAt: undefined,
  };
}

export function mergeCanonicalProvenance(
  target: AcademyCanonicalRecord,
  mergedRecords: readonly AcademyCanonicalRecord[],
): AcademyCanonicalRecord {
  return {
    ...target,
    sourceProvenance: uniqueProvenance([
      ...target.sourceProvenance,
      ...mergedRecords.flatMap((record) => record.sourceProvenance),
    ]),
    sourceCandidateIds: [
      ...new Set([
        ...target.sourceCandidateIds,
        ...mergedRecords.flatMap((record) => record.sourceCandidateIds),
      ]),
    ].sort(),
  };
}

