import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  serializeGoalGraphCatalog,
  summarizeGoalCatalog,
} from "@/lib/academy/goal-catalog-reporting";
import { validateAcademyGoalGraphCatalog } from "@/lib/academy/goal-catalog-validation";
import type { AcademyGoalGraphCatalog } from "@/lib/academy/types";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

function cloneCatalog(): AcademyGoalGraphCatalog {
  return structuredClone(U12_ACADEMY_GOAL_CATALOG);
}

function idDigest(catalog: AcademyGoalGraphCatalog): string {
  return createHash("sha256")
    .update(catalog.goals.map((goal) => goal.id).sort().join("\n"))
    .digest("hex");
}

test("canonical U12 goal IDs remain stable", () => {
  assert.equal(U12_ACADEMY_GOAL_CATALOG.goals.length >= 45, true);
  assert.equal(U12_ACADEMY_GOAL_CATALOG.goals.length <= 60, true);
  assert.equal(
    idDigest(U12_ACADEMY_GOAL_CATALOG),
    "2f74cf7b7f3693fafd7c1697a64b9990e270d6871f718fbbf4103b1b54c5faa0",
  );
});

test("validates the complete U12 domain and goal graph", () => {
  const validation = validateAcademyGoalGraphCatalog(
    U12_ACADEMY_GOAL_CATALOG,
  );
  assert.deepEqual(validation.errors, []);
  assert.equal(U12_ACADEMY_GOAL_CATALOG.domains.length, 15);
  assert.equal(U12_ACADEMY_GOAL_CATALOG.blocks.length, 6);
});

test("detects invalid domains and missing prerequisites", () => {
  const catalog = cloneCatalog();
  catalog.goals[0].domainId = "missing-domain" as never;
  catalog.goals[1].prerequisiteGoalIds.push("u12-missing-goal");
  const validation = validateAcademyGoalGraphCatalog(catalog);
  assert.ok(validation.errors.some((error) => error.includes("unknown domain")));
  assert.ok(
    validation.errors.some((error) => error.includes("u12-missing-goal")),
  );
});

test("detects prerequisite cycles and one-way related links", () => {
  const catalog = cloneCatalog();
  const first = catalog.goals[0];
  const second = catalog.goals[1];
  first.prerequisiteGoalIds = [second.id];
  second.prerequisiteGoalIds = [first.id];
  const relatedTarget = catalog.goals.find(
    (goal) => first.relatedGoalIds.includes(goal.id),
  );
  assert.ok(relatedTarget);
  relatedTarget.relatedGoalIds = relatedTarget.relatedGoalIds.filter(
    (id) => id !== first.id,
  );
  const validation = validateAcademyGoalGraphCatalog(catalog);
  assert.ok(validation.errors.some((error) => error.includes("circular")));
  assert.ok(
    validation.errors.some((error) => error.includes("bidirectional")),
  );
});

test("enforces evidence, seasonal, position, and learning metadata", () => {
  const catalog = cloneCatalog();
  const goal = catalog.goals[0];
  goal.observableIndicators = goal.observableIndicators.slice(0, 2);
  goal.coachFeedbackExamples = goal.coachFeedbackExamples.slice(0, 1);
  goal.gameEvidenceTags.push("unknown-evidence-tag");
  goal.seasonalPlacement = [];
  goal.positionRelevance = [];
  goal.recommendedDrillCount = 0;
  goal.editorial.status = "approved";
  const validation = validateAcademyGoalGraphCatalog(catalog);
  for (const phrase of [
    "three observable",
    "two coach feedback",
    "unknown evidence tag",
    "seasonal placement",
    "position relevance",
    "lesson and drill demand",
    "awaiting coach review",
  ]) {
    assert.ok(
      validation.errors.some((error) => error.includes(phrase)),
      `expected validation error containing "${phrase}"`,
    );
  }
});

test("evidence tags map back to goals and include positive and improvement examples", () => {
  const tagById = new Map(
    U12_ACADEMY_GOAL_CATALOG.evidenceTags.map((tag) => [tag.id, tag]),
  );
  for (const goal of U12_ACADEMY_GOAL_CATALOG.goals) {
    const categories = new Set(
      goal.gameEvidenceTags.map((tagId) => tagById.get(tagId)?.category),
    );
    assert.ok(categories.has("positive"));
    assert.ok(categories.has("improvement"));
    assert.ok(
      goal.gameEvidenceTags.every((tagId) =>
        tagById.get(tagId)?.applicableGoalIds.includes(goal.id),
      ),
    );
  }
});

test("serializes a machine-readable graph without generating content", () => {
  const serialized = serializeGoalGraphCatalog(U12_ACADEMY_GOAL_CATALOG);
  const parsed = JSON.parse(serialized) as {
    goals: unknown[];
    evidenceTags: unknown[];
    graph: { goalIds: string[] };
  };
  const summary = summarizeGoalCatalog(U12_ACADEMY_GOAL_CATALOG);
  assert.equal(parsed.goals.length, summary.goals);
  assert.equal(parsed.evidenceTags.length, summary.evidenceTags);
  assert.equal(parsed.graph.goalIds.length, summary.goals);
  assert.equal("lessons" in parsed, false);
  assert.equal("drills" in parsed, false);
});
