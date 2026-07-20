import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeAcademyEditor,
  requireAcademyEditor,
} from "@/lib/academy/editorial-auth";
import {
  EDITORIAL_WORKFLOW_TRANSITIONS,
  canTransitionEditorialStatus,
  transitionEditorialRecord,
} from "@/lib/academy/editorial-transitions";
import {
  approveOpenBodyPackage,
  evaluatePackageReadiness,
  publishOpenBodyPackage,
  transitionEditorialObject,
  unpublishOpenBodyPackage,
} from "@/lib/academy/editorial-repository";
import { buildOpenBodyEditorialRecords } from "@/lib/academy/open-body-package";
import {
  getPublishedLessonPackageView,
  listPublishedLessons,
} from "@/lib/academy/published-content";
import type { AcademyWorkflowStatus } from "@/lib/academy/types";

const ACTOR = "editor@filmroom.test";
const AT = "2026-07-19T15:00:00.000Z";

test("every allowed editorial transition is accepted", () => {
  for (const [from, targets] of Object.entries(EDITORIAL_WORKFLOW_TRANSITIONS) as Array<
    [AcademyWorkflowStatus, AcademyWorkflowStatus[]]
  >) {
    for (const to of targets) {
      assert.equal(canTransitionEditorialStatus(from, to), true);
    }
  }
});

test("blocked editorial transitions are rejected", () => {
  const blocked: Array<[AcademyWorkflowStatus, AcademyWorkflowStatus]> = [
    ["draft", "published"],
    ["draft", "approved"],
    ["needs_coach_review", "published"],
    ["rejected", "published"],
    ["approved", "draft"],
    ["published", "draft"],
    ["published", "needs_coach_review"],
  ];
  for (const [from, to] of blocked) {
    assert.equal(canTransitionEditorialStatus(from, to), false);
  }
});

test("rejection requires a reason and creates an audit entry", () => {
  const [lesson] = buildOpenBodyEditorialRecords();
  assert.throws(
    () =>
      transitionEditorialRecord(lesson!, "rejected", {
        actor: ACTOR,
        at: AT,
      }),
    /reason/i,
  );
  const { record, auditEntry } = transitionEditorialRecord(lesson!, "rejected", {
    actor: ACTOR,
    at: AT,
    reason: "Needs clearer coaching cues.",
  });
  assert.equal(record.lifecycle, "rejected");
  assert.equal(record.rejectionReason, "Needs clearer coaching cues.");
  assert.equal(auditEntry.previousStatus, "needs_coach_review");
  assert.equal(auditEntry.newStatus, "rejected");
  assert.equal(auditEntry.actor, ACTOR);
  assert.equal(auditEntry.objectVersion, lesson!.version);
});

test("authorization requires actor allowlist membership", () => {
  assert.equal(
    authorizeAcademyEditor({}).authorized,
    false,
  );
  assert.equal(
    authorizeAcademyEditor({
      ACADEMY_EDITOR_ACTOR: ACTOR,
    }).authorized,
    false,
  );
  assert.equal(
    authorizeAcademyEditor({
      ACADEMY_EDITOR_ACTOR: ACTOR,
      ACADEMY_EDITOR_ALLOWLIST: "other@example.com",
    }).authorized,
    false,
  );
  assert.equal(
    requireAcademyEditor({
      ACADEMY_EDITOR_ACTOR: ACTOR,
      ACADEMY_EDITOR_ALLOWLIST: `${ACTOR},other@example.com`,
    }),
    ACTOR,
  );
});

test("publishing is blocked when dependencies are unapproved", () => {
  const records = buildOpenBodyEditorialRecords("needs_coach_review");
  assert.throws(
    () =>
      publishOpenBodyPackage(records, {
        actor: ACTOR,
        at: AT,
        catalogVersion: 2,
      }),
    /approved dependencies/i,
  );
});

test("publishing is blocked when a required dependency is unresolved", () => {
  const records = buildOpenBodyEditorialRecords("needs_coach_review");
  const approved = approveOpenBodyPackage(records, {
    actor: ACTOR,
    at: AT,
  }).records;
  const broken = approved.map((record) => {
    if (record.id !== "academy-lesson-receive-open-body") return record;
    const payload = structuredClone(record.payload) as {
      activityIds: string[];
    };
    payload.activityIds = ["missing-activity"];
    return { ...record, payload };
  });
  assert.throws(
    () =>
      publishOpenBodyPackage(broken, {
        actor: ACTOR,
        at: AT,
        catalogVersion: 2,
      }),
    /unknown activity|incomplete|missing/i,
  );
});

test("successful package publication and unpublish preserve audit and visibility rules", () => {
  const seeded = buildOpenBodyEditorialRecords("needs_coach_review");
  assert.equal(evaluatePackageReadiness(seeded).readiness, "awaiting_review");

  const approved = approveOpenBodyPackage(seeded, {
    actor: ACTOR,
    at: AT,
  });
  assert.ok(approved.auditEntries.length >= 6);
  assert.equal(
    evaluatePackageReadiness(approved.records).readiness,
    "ready_to_publish",
  );

  const published = publishOpenBodyPackage(approved.records, {
    actor: ACTOR,
    at: "2026-07-19T16:00:00.000Z",
    catalogVersion: 3,
  });
  assert.equal(
    evaluatePackageReadiness(published.records).readiness,
    "published",
  );
  assert.ok(published.publishedCatalog.objects.length >= 6);
  for (const object of published.publishedCatalog.objects) {
    const serialized = JSON.stringify(object.payload);
    assert.equal(serialized.includes("sourceDocumentId"), false);
    assert.equal(serialized.includes("editorialNotes"), false);
    assert.equal(serialized.includes("rejectionReason"), false);
    assert.equal(serialized.includes("reviewedBy"), false);
  }

  const lessonView = getPublishedLessonPackageView(
    "academy-lesson-receive-open-body",
    published.publishedCatalog,
  );
  assert.ok(lessonView);
  assert.equal(lessonView!.activities.length, 3);
  assert.ok(lessonView!.assignment);
  assert.ok(lessonView!.quiz);
  assert.equal(lessonView!.questions.length, 6);
  assert.equal(
    listPublishedLessons(published.publishedCatalog)[0]?.id,
    "academy-lesson-receive-open-body",
  );

  const unpublished = unpublishOpenBodyPackage(published.records, {
    actor: ACTOR,
    at: "2026-07-19T17:00:00.000Z",
    catalogVersion: 4,
  });
  assert.equal(
    evaluatePackageReadiness(unpublished.records).readiness,
    "ready_to_publish",
  );
  assert.equal(
    listPublishedLessons(unpublished.publishedCatalog).length,
    0,
  );
  assert.ok(
    unpublished.auditEntries.every(
      (entry) =>
        entry.previousStatus === "published" && entry.newStatus === "approved",
    ),
  );
});

test("single-object transition helper rejects invalid jumps", () => {
  const records = buildOpenBodyEditorialRecords();
  assert.throws(
    () =>
      transitionEditorialObject(records, {
        objectId: "academy-lesson-receive-open-body",
        to: "published",
        actor: ACTOR,
        at: AT,
      }),
    /Invalid editorial transition/,
  );
});

test("seeded Phase 3A editorial records start in needs_coach_review", () => {
  const records = buildOpenBodyEditorialRecords();
  assert.ok(
    records.every(
      (record) =>
        record.lifecycle === "needs_review" ||
        record.lifecycle === "draft",
    ),
  );
  assert.equal(
    listPublishedLessons({
      schemaVersion: 1,
      catalogId: "film-room-academy",
      catalogVersion: 0,
      objects: [],
    }).length,
    0,
  );
});
