import assert from "node:assert/strict";
import test from "node:test";
import { filterTacticsPresets } from "@/lib/tactics-presets/filter";
import type { TacticsPreset } from "@/lib/tactics-presets/types";

function preset(
  overrides: Partial<TacticsPreset> & Pick<TacticsPreset, "id" | "title">,
): TacticsPreset {
  return {
    version: 1,
    shortDescription: "Create support beneath the ball.",
    kind: "formation",
    category: "formations",
    format: "9v9",
    difficulty: "foundation",
    fieldOrientation: "horizontal",
    fieldView: "full",
    objectives: ["Find the free player."],
    setupInstructions: ["Set the field."],
    coachingPoints: ["Scan before receiving."],
    playbackSettings: {
      transitionDurationMs: 900,
      holdDurationMs: 700,
      loop: false,
    },
    steps: [{ id: "s1", order: 0, title: "Start", objects: [] }],
    tags: ["buildout", "width"],
    ...overrides,
    id: overrides.id,
    title: overrides.title,
  };
}

const catalog = [
  preset({ id: "build", title: "Build from the goalkeeper" }),
  preset({
    id: "rondo",
    title: "Rondo 4v1",
    shortDescription: "Keep possession under pressure.",
    kind: "practice_drill",
    category: "practice_drills",
    format: "small_sided",
    difficulty: "developing",
    objectives: ["Quick support angles."],
    coachingPoints: ["Move as the pass travels."],
    tags: ["possession"],
  }),
];

test("searches title, tags, objectives, and coaching points", () => {
  assert.deepEqual(
    filterTacticsPresets(catalog, { query: "free player" }).map((p) => p.id),
    ["build"],
  );
  assert.deepEqual(
    filterTacticsPresets(catalog, { query: "pass travels" }).map((p) => p.id),
    ["rondo"],
  );
  assert.deepEqual(
    filterTacticsPresets(catalog, { query: "buildout" }).map((p) => p.id),
    ["build"],
  );
});

test("combines format, category, and difficulty filters", () => {
  assert.deepEqual(
    filterTacticsPresets(catalog, {
      formats: ["small_sided"],
      categories: ["practice_drills"],
      difficulties: ["developing"],
    }).map((p) => p.id),
    ["rondo"],
  );
});
