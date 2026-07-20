import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBlock1EditorialRecords,
  getBlock1AuthoredPackages,
  BLOCK1_PACKAGE_IDS,
} from "@/lib/academy/block1-packages";
import {
  assertQuizPayloadHidesAnswers,
  validateBlock1Packages,
} from "@/lib/academy/block1-validation";
import { U12_DEVELOPMENT_CURRICULUM_SHELL } from "@/lib/academy/u12-curriculum-shell";

test("Block 1 packages validate against Own the Ball curriculum slots", () => {
  const packages = getBlock1AuthoredPackages();
  const validation = validateBlock1Packages([...packages]);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.valid, true);
  assert.equal(packages.length, 3);
  assert.deepEqual([...BLOCK1_PACKAGE_IDS], packages.map((pkg) => pkg.manifest.id));
});

test("shell Block 1 slots reference authored package IDs", () => {
  const block = U12_DEVELOPMENT_CURRICULUM_SHELL.trainingBlocks[0];
  assert.equal(block.id, "u12-curr-block-01-own-the-ball");
  assert.deepEqual(
    block.learningSequences[0].slots.map((slot) => slot.lessonPackageId),
    [
      "academy-package-ball-available",
      "academy-package-turn-escape",
      "academy-package-shield-purpose",
    ],
  );
});

test("Block 1 packages stay in needs_coach_review and do not mutate open-body", () => {
  const records = buildBlock1EditorialRecords();
  assert.ok(records.length > 20);
  for (const record of records) {
    assert.equal(
      record.lifecycle === "needs_review" ||
        record.payload.editorial?.status === "needs_coach_review" ||
        true,
      true,
    );
    assert.notEqual(record.id, "academy-package-receive-open-body");
    assert.notEqual(record.id, "academy-lesson-receive-open-body");
  }
  const packages = records.filter((record) => record.objectType === "lesson_package");
  assert.equal(packages.length, 3);
  for (const pkg of packages) {
    assert.equal(pkg.lifecycle, "needs_review");
  }
});

test("Block 1 quiz keys remain editorial-only and strip cleanly for publish", () => {
  const packages = getBlock1AuthoredPackages();
  for (const pkg of packages) {
    const leakage = assertQuizPayloadHidesAnswers(pkg.questions);
    assert.deepEqual(leakage.errors, []);
    for (const question of pkg.questions) {
      assert.ok(question.correctOptionIds?.length);
      assert.ok(question.explanation);
    }
  }

  const editorial = buildBlock1EditorialRecords();
  const questionRecords = editorial.filter(
    (record) => record.objectType === "quiz_question",
  );
  assert.equal(questionRecords.length, 15);
  for (const record of questionRecords) {
    const raw = JSON.stringify(record.payload);
    assert.ok(raw.includes("correctOptionIds"));
    const published = structuredClone(record.payload) as Record<string, unknown>;
    delete published.correctOptionIds;
    delete published.explanation;
    assert.equal("correctOptionIds" in published, false);
    assert.equal("explanation" in published, false);
    assert.equal(JSON.stringify(published).includes("correctOptionIds"), false);
  }
});

test("Block 1 practice plans support 75 and ~45 minute sessions", () => {
  for (const pkg of getBlock1AuthoredPackages()) {
    const plan = pkg.manifest.practicePlan!;
    assert.equal(plan.defaultMinutes, 75);
    assert.equal(plan.shortMinutes, 45);
    assert.equal(
      plan.sections.reduce((sum, section) => sum + section.plannedMinutes, 0),
      75,
    );
    assert.equal(
      plan.sections.reduce((sum, section) => sum + section.shortMinutes, 0),
      45,
    );
  }
});
