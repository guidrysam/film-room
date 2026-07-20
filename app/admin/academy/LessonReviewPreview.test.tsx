import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import LessonReviewPreview from "./LessonReviewPreview";

test("editorial preview renders the complete lesson package", () => {
  const html = renderToStaticMarkup(<LessonReviewPreview />);
  for (const text of [
    "See the Next Play: Receive with an Open Body",
    "Coaching points",
    "Open-Body Gate Check",
    "Open-Body Receiving Diamond",
    "Open to Play Forward",
    "Find Three Open-Body Moments",
    "Receive with an Open Body Check",
    "Related goals",
    "Evidence mapping",
    "Needs coach review",
  ]) {
    assert.ok(html.includes(text), `missing preview content: ${text}`);
  }
});

