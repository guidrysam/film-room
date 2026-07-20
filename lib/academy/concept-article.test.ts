import assert from "node:assert/strict";
import test from "node:test";
import { buildLessonConceptArticle } from "@/lib/academy/concept-article";
import { RECEIVE_OPEN_BODY_LESSON } from "@/lib/academy/receive-open-body-content";

test("builds a short concept article from the published lesson", () => {
  const article = buildLessonConceptArticle(RECEIVE_OPEN_BODY_LESSON);
  assert.match(article.title, /Concept brief/i);
  assert.ok(article.dek.length > 20);
  assert.ok(article.sections.length >= 3);
  assert.ok(
    article.sections.some((section) =>
      section.heading.toLowerCase().includes("teaching"),
    ),
  );
});
