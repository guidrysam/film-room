import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  packageReviewSummary,
  toReviewQueueItems,
} from "@/lib/academy/editorial-loader";
import { buildOpenBodyEditorialRecords } from "@/lib/academy/open-body-package";
import PackageReviewPanel from "./PackageReviewPanel";
import ReviewQueue from "./ReviewQueue";

test("review queue renders object metadata and filters", () => {
  const items = toReviewQueueItems(buildOpenBodyEditorialRecords());
  const html = renderToStaticMarkup(
    <ReviewQueue items={items} query={{ objectType: "lesson" }} />,
  );
  assert.ok(html.includes("Review queue"));
  assert.ok(html.includes("See the Next Play: Receive with an Open Body"));
  assert.ok(html.includes("needs coach review"));
  assert.ok(html.includes("CLI"));
});

test("package review panel shows dependency tree and readiness", () => {
  const records = buildOpenBodyEditorialRecords();
  const summary = packageReviewSummary(records);
  const html = renderToStaticMarkup(
    <PackageReviewPanel
      records={records}
      readiness={summary.readiness}
      validationErrors={summary.validationErrors}
    />,
  );
  assert.ok(html.includes("Receive with an Open Body"));
  assert.ok(html.includes("Warmup"));
  assert.ok(html.includes("Technical Activity"));
  assert.ok(html.includes("Small-Sided Game"));
  assert.ok(html.includes("awaiting review"));
  assert.ok(html.includes("academy:editorial:publish-package"));
});
