import assert from "node:assert/strict";
import test from "node:test";
import {
  generateGamePlanOutline,
  generateGoalAwarePracticePlan,
  generatePracticePlanFromFilmEvidence,
} from "@/lib/academy/practice-generation";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

const scanImprovement = "u12-scan-before-receiving-evidence-improvement";
const openBodyImprovement =
  "u12-receive-open-body-evidence-improvement";

test("goal-aware practice uses catalog cues and keeps minutes exact", () => {
  const plan = generateGoalAwarePracticePlan(U12_ACADEMY_GOAL_CATALOG, {
    academyPresetId: "u12-9v9",
    ageBand: "U11-U12",
    durationMinutes: 75,
    playerCount: 14,
    goalkeeperCount: 1,
    primaryGoalIds: ["u12-scan-before-receiving"],
  });
  assert.equal(plan.totalMinutes, 75);
  assert.equal(
    plan.activities.reduce((sum, activity) => sum + activity.plannedMinutes, 0),
    75,
  );
  assert.match(plan.title, /Scan Before Receiving/);
  assert.ok(plan.activities.every((activity) => !activity.drillId));
  assert.ok(
    plan.validationWarnings.some((warning) =>
      warning.includes("drill IDs are deferred"),
    ),
  );
});

test("practice generation from film evidence prioritizes improvement goals", () => {
  const plan = generatePracticePlanFromFilmEvidence(U12_ACADEMY_GOAL_CATALOG, {
    academyPresetId: "u12-9v9",
    ageBand: "U11-U12",
    durationMinutes: 60,
    playerCount: 12,
    goalkeeperCount: 1,
    attachments: [
      { evidenceTagIds: [scanImprovement] },
      { evidenceTagIds: [openBodyImprovement] },
    ],
  });
  assert.ok(plan.primaryGoalIds.includes("u12-scan-before-receiving"));
  assert.ok(plan.totalMinutes === 60);
  assert.ok(plan.introduction.length >= 1);
});

test("game plan outline can be driven by film evidence tags", () => {
  const outline = generateGamePlanOutline(U12_ACADEMY_GOAL_CATALOG, {
    scope: "week",
    academyPresetId: "u12-9v9",
    ageBand: "U11-U12",
    playingFormat: "9v9",
    primaryGoalIds: [],
    practiceMinutes: 75,
    practicesPerWeek: 2,
    playerCount: 14,
    goalkeeperCount: 1,
    seasonWeeks: 2,
    evidenceTagIds: [scanImprovement],
  });
  assert.equal(outline.evidenceDriven, true);
  assert.deepEqual(outline.primaryGoalIds, ["u12-scan-before-receiving"]);
  assert.match(outline.title, /Scan Before Receiving/);
});
