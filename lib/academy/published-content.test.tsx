import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import AcademyPublishedLesson from "@/components/AcademyPublishedLesson";
import {
  approveOpenBodyPackage,
  publishOpenBodyPackage,
} from "@/lib/academy/editorial-repository";
import { buildOpenBodyEditorialRecords } from "@/lib/academy/open-body-package";
import {
  getPublishedLessonPackageView,
  listPublishedLessons,
} from "@/lib/academy/published-content";
import type { PublishedAcademyCatalog } from "@/lib/academy/types";

const EMPTY_CATALOG: PublishedAcademyCatalog = {
  schemaVersion: 1,
  catalogId: "film-room-academy",
  catalogVersion: 0,
  objects: [],
};

test("Team Academy published queries ignore unpublished packages", () => {
  assert.equal(listPublishedLessons(EMPTY_CATALOG).length, 0);
  assert.equal(
    getPublishedLessonPackageView(
      "academy-lesson-receive-open-body",
      EMPTY_CATALOG,
    ),
    null,
  );
});

test("live published catalog exposes the open-body lesson package", () => {
  const lessons = listPublishedLessons();
  assert.ok(lessons.length >= 1);
  const view = getPublishedLessonPackageView(
    "academy-lesson-receive-open-body",
  );
  assert.ok(view);
  assert.equal(view!.activities.length, 3);
  assert.ok(view!.assignment);
  assert.ok(view!.quiz);
  assert.equal(view!.questions.length, 6);
  assert.ok(
    view!.questions.every(
      (question) =>
        question.correctOptionIds === undefined &&
        question.explanation === undefined,
    ),
  );
});

test("published lesson package renders without editorial metadata", () => {
  const seeded = buildOpenBodyEditorialRecords("needs_coach_review");
  const approved = approveOpenBodyPackage(seeded, {
    actor: "editor@filmroom.test",
    at: "2026-07-19T18:00:00.000Z",
  });
  const published = publishOpenBodyPackage(approved.records, {
    actor: "editor@filmroom.test",
    at: "2026-07-19T18:30:00.000Z",
    catalogVersion: 5,
  });
  const view = getPublishedLessonPackageView(
    "academy-lesson-receive-open-body",
    published.publishedCatalog,
  );
  assert.ok(view);
  const html = renderToStaticMarkup(
    <AcademyPublishedLesson view={view!} />,
  );
  assert.ok(html.includes("See the Next Play: Receive with an Open Body"));
  assert.ok(html.includes("Learning objective"));
  assert.ok(html.includes("Open-Body Gate Check"));
  assert.ok(html.includes("Find Three Open-Body Moments"));
  assert.ok(html.includes("Receive with an Open Body Check"));
  assert.equal(html.includes("reviewedBy"), false);
  assert.equal(html.includes("editorialNotes"), false);
  assert.equal(html.includes("sourceDocumentId"), false);
});
