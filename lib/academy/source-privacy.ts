import type {
  AcademySourceDocument,
  AcademySourceItem,
  SourceInfluence,
} from "@/lib/academy/types";

type SourceRecord =
  | AcademySourceDocument
  | AcademySourceItem
  | SourceInfluence
  | Record<string, unknown>;

export function isSourceFacingPublic(record: SourceRecord): false {
  void record;
  return false;
}

export function assertSourceRecordsArePrivate(
  records: readonly SourceRecord[],
): true {
  if (records.some((record) => isSourceFacingPublic(record))) {
    throw new Error("Academy source records must never be public-facing.");
  }
  return true;
}

const PRIVATE_KEYS = new Set([
  "sourceProvenance",
  "sourceDocumentId",
  "sourceItemId",
  "sourcePageStart",
  "sourcePageEnd",
  "internalSummary",
  "filename",
  "usageRestrictions",
  "sourceCandidateIds",
  "editorialNotes",
  "reviewedBy",
  "reviewedAt",
  "approvedBy",
  "approvedAt",
  "publishedBy",
  "rejectedBy",
  "rejectedAt",
  "rejectionReason",
  "warnings",
]);

function isPrivateSourceKey(key: string): boolean {
  return PRIVATE_KEYS.has(key) || /^source/i.test(key);
}

export function stripSourceMetadata<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSourceMetadata(item)) as T;
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isPrivateSourceKey(key))
      .map(([key, item]) => [key, stripSourceMetadata(item)]),
  ) as T;
}

export function stripSourceDocumentForPublic(
  document: AcademySourceDocument,
): Record<string, never> {
  void document;
  return {};
}

export function stripSourceItemForPublic(
  item: AcademySourceItem,
): Record<string, never> {
  void item;
  return {};
}
