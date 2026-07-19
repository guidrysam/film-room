import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSourceRecordsArePrivate,
  isSourceFacingPublic,
  stripSourceDocumentForPublic,
  stripSourceMetadata,
} from "@/lib/academy/source-privacy";
import type { AcademySourceDocument } from "@/lib/academy/types";

const source: AcademySourceDocument = {
  id: "private-source",
  filename: "private.pdf",
  title: "Private source",
  sourceType: "pdf",
  licenseStatus: "private_reference_only",
  usageRestrictions: [
    "Private reference only",
    "No public exposure",
    "No verbatim republish",
  ],
  importedAt: "2026-07-19T00:00:00.000Z",
};

test("source records are categorically private", () => {
  assert.equal(isSourceFacingPublic(source), false);
  assert.equal(assertSourceRecordsArePrivate([source]), true);
  assert.deepEqual(stripSourceDocumentForPublic(source), {});
});

test("public projections recursively remove private provenance", () => {
  assert.deepEqual(
    stripSourceMetadata({
      id: "draft",
      title: "Original Film Room draft",
      sourceProvenance: [{ sourceDocumentId: "private-source" }],
      nested: { sourcePageStart: 4, safe: true },
    }),
    {
      id: "draft",
      title: "Original Film Room draft",
      nested: { safe: true },
    },
  );
});
