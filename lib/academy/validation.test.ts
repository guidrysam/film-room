import assert from "node:assert/strict";
import test from "node:test";
import { isSourceFacingPublic } from "@/lib/academy/source-privacy";
import type {
  AcademyGoal,
  AcademySourceDocument,
  AcademySourceItem,
} from "@/lib/academy/types";
import {
  validateGoalCatalog,
  validateSourceCatalog,
  validateSourceDocument,
  validateSourceItem,
} from "@/lib/academy/validation";

function validSource(): AcademySourceDocument {
  return {
    id: "coaching-reference",
    filename: "coaching-reference.pdf",
    title: "Coaching reference",
    sourceType: "pdf",
    licenseStatus: "private_reference_only",
    usageRestrictions: [
      "Private reference only.",
      "No public exposure.",
      "No verbatim republish.",
    ],
    importedAt: "2026-07-19T00:00:00.000Z",
  };
}

function validItem(): AcademySourceItem {
  return {
    id: "coaching-reference-page-3",
    sourceDocumentId: "coaching-reference",
    sourcePageStart: 3,
    sourcePageEnd: 3,
    sourceTitle: "Page 3 reference",
    contentType: "drill",
    internalSummary: "Internal concept reference requiring an original rewrite.",
    ageTags: ["U12"],
    skillTags: ["passing"],
    tacticalTags: [],
    editorialStatus: "extracted",
    publicationEligibility: "requires_original_rewrite",
  };
}

test("accepts a private source document with required restrictions", () => {
  assert.deepEqual(validateSourceDocument(validSource()), {
    valid: true,
    errors: [],
    warnings: [],
  });
  assert.equal(isSourceFacingPublic(validSource()), false);
});

test("rejects source records that could bypass original rewriting", () => {
  const document = validSource();
  document.usageRestrictions = ["Private reference only."];
  const documentResult = validateSourceDocument(document);
  assert.equal(documentResult.valid, false);
  assert.ok(
    documentResult.errors.some((error) => error.includes("no public exposure")),
  );

  const item = validItem();
  item.publicationEligibility = "licensed_for_use";
  const itemResult = validateSourceItem(item);
  assert.equal(itemResult.valid, false);
  assert.ok(
    itemResult.errors.some((error) => error.includes("original rewrite")),
  );
});

test("rejects duplicate source ids and filenames", () => {
  const source = validSource();
  const result = validateSourceCatalog([source, { ...source }]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("duplicate id")));
  assert.ok(result.errors.some((error) => error.includes("duplicate filename")));
});

function goal(id: string, prerequisiteGoalIds: string[] = []): AcademyGoal {
  return {
    id,
    title: id,
    description: `Develop ${id}.`,
    type: "technical",
    ageBands: ["U11-U12"],
    formats: ["9v9"],
    principles: ["Make the next action easier."],
    coachCues: ["Scan early."],
    observableIndicators: ["Player scans before receiving."],
    prerequisiteGoalIds,
    relatedGoalIds: [],
    sourceProvenance: [],
    editorial: {
      status: "draft",
      originalWording: true,
      originalDiagram: true,
      generatedWithAssistance: true,
    },
  };
}

test("validates goal relationships and rejects prerequisite cycles", () => {
  assert.equal(validateGoalCatalog([goal("scan"), goal("receive", ["scan"])]).valid, true);
  const circular = validateGoalCatalog([
    goal("scan", ["receive"]),
    goal("receive", ["scan"]),
  ]);
  assert.equal(circular.valid, false);
  assert.ok(
    circular.errors.some((error) => error.includes("circular prerequisite")),
  );
});
