import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoalGraph,
  prerequisitesSatisfied,
} from "@/lib/academy/goal-graph";
import type { AcademyGoal } from "@/lib/academy/types";

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

test("builds a goal graph and blocks incomplete prerequisites", () => {
  const result = buildGoalGraph([
    goal("scan"),
    goal("receive", ["scan"]),
  ]);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.graph.goalIds, ["scan", "receive"]);
  assert.equal(prerequisitesSatisfied(result.graph, "receive", []), false);
  assert.equal(
    prerequisitesSatisfied(result.graph, "receive", ["scan"]),
    true,
  );
});

test("rejects circular goal graphs", () => {
  const result = buildGoalGraph([
    goal("scan", ["receive"]),
    goal("receive", ["scan"]),
  ]);
  assert.ok(result.errors.some((error) => error.includes("circular")));
});
