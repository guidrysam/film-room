import assert from "node:assert/strict";
import test from "node:test";
import {
  drillSupportsAnyGoal,
  generatePlanOutline,
  generatePracticePlan,
  isDrillEquipmentCompatible,
  isDrillPlayerCountCompatible,
  scaleU12SessionStructure,
} from "@/lib/academy/planning";
import type { AcademyDrill } from "@/lib/academy/types";

const drill = {
  playerCount: { min: 8, ideal: 12, max: 16 },
  goalkeeperCount: { min: 1, ideal: 1, max: 2 },
  equipment: ["balls", "cones"],
  goalIds: ["goal-scan", "goal-receive"],
} as AcademyDrill;

test("scales every supported duration without dropping the game", () => {
  for (const duration of [45, 60, 75, 90] as const) {
    const segments = scaleU12SessionStructure(duration);
    assert.equal(
      segments.reduce((sum, segment) => sum + segment.minutes, 0),
      duration,
    );
    assert.ok(
      segments.some((segment) => segment.role === "small_sided_game"),
    );
    assert.ok(segments.every((segment) => segment.minutes > 0));
  }
});

test("75-minute scaling preserves the default session allocation", () => {
  assert.deepEqual(
    scaleU12SessionStructure(75).map((segment) => segment.minutes),
    [10, 15, 15, 20, 10, 5],
  );
});

test("filters drills by players, goalkeepers, equipment, and goals", () => {
  assert.equal(isDrillPlayerCountCompatible(drill, 12, 1), true);
  assert.equal(isDrillPlayerCountCompatible(drill, 7, 1), false);
  assert.equal(isDrillPlayerCountCompatible(drill, 12, 0), false);
  assert.equal(
    isDrillEquipmentCompatible(drill, ["cones", "balls", "pinnies"]),
    true,
  );
  assert.equal(isDrillEquipmentCompatible(drill, ["balls"]), false);
  assert.equal(drillSupportsAnyGoal(drill, ["goal-scan"]), true);
  assert.equal(drillSupportsAnyGoal(drill, ["goal-width"]), false);
});

test("practice planner returns a scaled skeleton for the requested duration", () => {
  const plan = generatePracticePlan({
    academyPresetId: "u12-9v9",
    ageBand: "U11-U12",
    durationMinutes: 60,
    playerCount: 12,
    goalkeeperCount: 1,
    primaryGoalIds: ["goal-scan"],
  });
  assert.equal(plan.totalMinutes, 60);
  assert.equal(
    plan.activities.reduce((sum, activity) => sum + activity.plannedMinutes, 0),
    60,
  );
  assert.ok(plan.validationWarnings.length > 0);
});

test("season outline stays high-level until practices are instantiated", () => {
  const outline = generatePlanOutline({
    scope: "season",
    academyPresetId: "u12-9v9",
    ageBand: "U11-U12",
    playingFormat: "9v9",
    primaryGoalIds: ["goal-scan"],
    practiceMinutes: 75,
    practicesPerWeek: 2,
    playerCount: 12,
    goalkeeperCount: 1,
    seasonWeeks: 4,
  });
  assert.equal(outline.nodes.length, 2);
  assert.ok(outline.nodes.every((node) => (node.children?.length ?? 0) > 0));
});
