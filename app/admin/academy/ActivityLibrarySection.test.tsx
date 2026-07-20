import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ActivityLibrarySection from "./ActivityLibrarySection";

test("activity library admin browser renders browse, filters, and preview", () => {
  const html = renderToStaticMarkup(<ActivityLibrarySection query={{}} />);
  for (const text of [
    "Activity Library",
    "Activity type",
    "Age group",
    "Difficulty",
    "Development goal",
    "Editorial status",
    "Open-Body Gate Check",
    "Open-Body Receiving Diamond",
    "Open to Play Forward",
    "Setup",
    "Organization",
    "Safety notes",
  ]) {
    assert.ok(html.includes(text), `missing activity browser content: ${text}`);
  }
});

test("activity library admin browser applies server-side filters", () => {
  const html = renderToStaticMarkup(
    <ActivityLibrarySection
      query={{
        query: "diamond",
        category: "technical",
        difficulty: "foundation",
        editorialStatus: "needs_coach_review",
      }}
    />,
  );
  assert.ok(html.includes("1 of 3 activities"));
  assert.ok(html.includes("Open-Body Receiving Diamond"));
  assert.equal(html.includes("Open to Play Forward"), false);
});

