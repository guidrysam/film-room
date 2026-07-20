import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalIdentityFingerprint,
  createStableCanonicalId,
  linkPotentialDuplicateCandidates,
  scoreKnowledgeCandidateSimilarity,
} from "@/lib/academy/catalog-deduplication";
import {
  buildPublishedAcademyCatalog,
  validateCanonicalCatalog,
} from "@/lib/academy/catalog-validation";
import {
  attestCanonicalOriginality,
  createCanonicalDraft,
  reviseCanonicalRecord,
  transitionCanonicalRecord,
} from "@/lib/academy/canonical-records";
import { extractKnowledgeCandidate } from "@/lib/academy/knowledge-extraction";
import type {
  AcademyCanonicalRecord,
  AcademySourceItem,
} from "@/lib/academy/types";

function sourceItem(
  overrides: Partial<AcademySourceItem> = {},
): AcademySourceItem {
  return {
    id: "source-a-page-3",
    sourceDocumentId: "source-a",
    sourcePageStart: 3,
    sourcePageEnd: 3,
    sourceTitle: "Triangle Passing Activity",
    contentType: "drill",
    internalSummary: "Private source summary that must never be published.",
    ageTags: ["U12"],
    skillTags: ["passing", "receiving"],
    tacticalTags: ["support"],
    playerCountMin: 4,
    playerCountMax: 6,
    durationMinutes: 12,
    equipmentMentions: ["ball", "cone"],
    editorialStatus: "extracted",
    publicationEligibility: "requires_original_rewrite",
    ...overrides,
  };
}

function publishedRecord(
  overrides: Partial<AcademyCanonicalRecord> = {},
): AcademyCanonicalRecord {
  return {
    id: "academy-cue-scan-early",
    objectType: "coaching_cue",
    version: 1,
    title: "Scan early",
    lifecycle: "published",
    payload: {
      id: "academy-cue-scan-early",
      title: "Scan early",
      text: "Check both shoulders before the ball arrives.",
      sourceProvenance: [{ sourceDocumentId: "private-source" }],
      editorialNotes: ["Private note"],
    },
    sourceProvenance: [
      {
        sourceDocumentId: "private-source",
        sourceItemId: "private-item",
        relationship: "concept_inspiration",
      },
    ],
    sourceCandidateIds: ["candidate-private"],
    editorialNotes: ["Private editorial note"],
    originality: {
      originalWording: true,
      originalDiagram: true,
      attestedBy: "coach-1",
      attestedAt: "2026-07-19T10:45:00.000Z",
    },
    deduplication: {
      identityFingerprint: buildCanonicalIdentityFingerprint({
        objectType: "coaching_cue",
        title: "Scan early",
      }),
      decision: "unique",
      comparedCanonicalIds: [],
      confidence: 1,
      reviewedBy: "coach-1",
      reviewedAt: "2026-07-19T12:00:00.000Z",
    },
    versionHistory: [
      {
        version: 1,
        changedAt: "2026-07-19T12:00:00.000Z",
        changedBy: "coach-1",
        summary: "Initial Film Room wording.",
      },
    ],
    reviewedBy: "coach-1",
    reviewedAt: "2026-07-19T12:00:00.000Z",
    publishedAt: "2026-07-19T12:30:00.000Z",
    ...overrides,
  };
}

test("source extraction creates private candidates, not product objects", () => {
  const candidate = extractKnowledgeCandidate(sourceItem());
  assert.deepEqual(candidate.suggestedObjectTypes, ["activity", "drill"]);
  assert.equal(candidate.status, "extracted");
  assert.equal(candidate.sourceProvenance[0]?.sourceDocumentId, "source-a");
  assert.equal(
    JSON.stringify(candidate).includes("Private source summary"),
    false,
  );
});

test("stable ids and fingerprints are deterministic without random UUIDs", () => {
  const first = createStableCanonicalId("activity", "Triangle Passing");
  const second = createStableCanonicalId("activity", "Triangle Passing");
  assert.equal(first, "academy-activity-triangle-passing");
  assert.equal(first, second);
  assert.equal(
    createStableCanonicalId("activity", "Triangle Passing", new Set([first])),
    "academy-activity-triangle-passing-2",
  );
  assert.equal(
    buildCanonicalIdentityFingerprint({
      objectType: "activity",
      title: "Triangle Passing",
      goalIds: ["goal-b", "goal-a"],
    }),
    buildCanonicalIdentityFingerprint({
      objectType: "activity",
      title: "Triangle Passing",
      goalIds: ["goal-a", "goal-b"],
    }),
  );
  assert.equal(
    buildCanonicalIdentityFingerprint({
      objectType: "activity",
      title: "Triangle Passing Advanced",
    }),
    buildCanonicalIdentityFingerprint({
      objectType: "activity",
      title: "Triangle Passing 2",
    }),
  );
});

test("equivalent candidates receive symmetric duplicate suggestions", () => {
  const left = extractKnowledgeCandidate(sourceItem());
  const right = extractKnowledgeCandidate(
    sourceItem({
      id: "source-b-page-9",
      sourceDocumentId: "source-b",
      sourceTitle: "Triangle Passing Exercise",
    }),
  );
  assert.ok(scoreKnowledgeCandidateSimilarity(left, right) >= 0.68);
  const linked = linkPotentialDuplicateCandidates([left, right]);
  assert.deepEqual(linked[0]?.potentialDuplicateCandidateIds, [right.id]);
  assert.deepEqual(linked[1]?.potentialDuplicateCandidateIds, [left.id]);
  assert.equal(linked[0]?.status, "clustered");
});

test("generic page headings do not create broad duplicate clusters", () => {
  const left = extractKnowledgeCandidate(
    sourceItem({ sourceTitle: "Page 3 reference" }),
  );
  const right = extractKnowledgeCandidate(
    sourceItem({
      id: "source-b-page-3",
      sourceDocumentId: "source-b",
      sourceTitle: "Page 9 reference",
    }),
  );
  assert.ok(scoreKnowledgeCandidateSimilarity(left, right) < 0.68);
  assert.deepEqual(
    linkPotentialDuplicateCandidates([left, right]).map(
      (candidate) => candidate.potentialDuplicateCandidateIds,
    ),
    [[], []],
  );
});

test("publication strips private provenance and editorial notes", () => {
  const record = publishedRecord();
  assert.equal(validateCanonicalCatalog([record]).valid, true);
  const catalog = buildPublishedAcademyCatalog([record], {
    catalogId: "film-room-academy",
    catalogVersion: 3,
  });
  const serialized = JSON.stringify(catalog);
  assert.equal(catalog.objects.length, 1);
  assert.equal(serialized.includes("private-source"), false);
  assert.equal(serialized.includes("Private editorial note"), false);
  assert.equal(serialized.includes("sourceProvenance"), false);
});

test("publication blocks unresolved review and duplicate identities", () => {
  const first = publishedRecord();
  const unresolved = publishedRecord({
    id: "academy-cue-unresolved",
    title: "Unresolved",
    payload: { id: "academy-cue-unresolved", title: "Unresolved" },
    lifecycle: "approved",
    publishedAt: undefined,
    deduplication: {
      ...first.deduplication,
      identityFingerprint: "unresolved-fingerprint",
      decision: "needs_review",
      reviewedBy: undefined,
      reviewedAt: undefined,
    },
  });
  assert.equal(validateCanonicalCatalog([unresolved]).valid, false);

  const duplicate = publishedRecord({
    id: "academy-cue-scan-early-copy",
    payload: {
      id: "academy-cue-scan-early-copy",
      title: "Scan early copy",
    },
  });
  const validation = validateCanonicalCatalog([first, duplicate]);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("duplicates")));
});

test("malformed typed payloads fail validation without crashing publication", () => {
  const malformed = publishedRecord({
    id: "academy-practice-malformed",
    objectType: "practice",
    title: "Malformed practice",
    payload: { id: "academy-practice-malformed" },
    deduplication: {
      ...publishedRecord().deduplication,
      identityFingerprint: "malformed-practice",
    },
  });
  const validation = validateCanonicalCatalog([malformed]);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("malformed")));
});

test("editorial lifecycle cannot bypass review and resets after revision", () => {
  const candidate = extractKnowledgeCandidate(sourceItem());
  const draft = createCanonicalDraft({
    objectType: "coaching_cue",
    title: "Scan before receiving",
    payload: {
      title: "Scan before receiving",
      text: "Check both shoulders before the pass arrives.",
    },
    candidates: [candidate],
    createdBy: "editor-1",
    createdAt: "2026-07-19T10:00:00.000Z",
  });
  assert.equal(draft.lifecycle, "draft");
  assert.equal(draft.sourceProvenance.length, 1);
  const needsReview = transitionCanonicalRecord(draft, "needs_review", {
    actor: "editor-1",
    at: "2026-07-19T10:10:00.000Z",
  });
  assert.throws(
    () =>
      transitionCanonicalRecord(needsReview, "approved", {
        actor: "coach-1",
        at: "2026-07-19T11:00:00.000Z",
      }),
    /dedup/,
  );
  const deduplicated = attestCanonicalOriginality(
    {
      ...needsReview,
      deduplication: {
        ...needsReview.deduplication,
        decision: "unique" as const,
        confidence: 1,
        reviewedBy: "coach-1",
        reviewedAt: "2026-07-19T10:50:00.000Z",
      },
    },
    {
      originalWording: true,
      originalDiagram: true,
      actor: "coach-1",
      at: "2026-07-19T10:45:00.000Z",
    },
  );
  const approved = transitionCanonicalRecord(deduplicated, "approved", {
    actor: "coach-1",
    at: "2026-07-19T11:00:00.000Z",
  });
  const published = transitionCanonicalRecord(approved, "published", {
    actor: "coach-1",
    at: "2026-07-19T11:30:00.000Z",
  });
  assert.equal(published.lifecycle, "published");
  const revised = reviseCanonicalRecord(published, {
    payload: published.payload,
    changedBy: "editor-2",
    changedAt: "2026-07-20T09:00:00.000Z",
    summary: "Clarified the player-facing cue.",
  });
  assert.equal(revised.version, 2);
  assert.equal(revised.lifecycle, "needs_review");
  assert.equal(revised.deduplication.decision, "needs_review");
  assert.equal(revised.originality.originalWording, false);
});

