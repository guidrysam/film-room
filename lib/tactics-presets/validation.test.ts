import assert from "node:assert/strict";
import test from "node:test";
import { ball, player, step } from "@/lib/tactics-presets/helpers";
import { BUILT_IN_TACTICS_PRESETS } from "@/lib/tactics-presets";
import type { TacticsPreset } from "@/lib/tactics-presets/types";
import {
  validatePresetCatalog,
  validateTacticsPreset,
} from "@/lib/tactics-presets/validation";

function validPreset(): TacticsPreset {
  return {
    id: "test-preset",
    version: 1,
    title: "Test preset",
    shortDescription: "A useful test preset.",
    kind: "tactical_sequence",
    category: "attacking",
    format: "small_sided",
    playerCount: 2,
    goalkeeperCount: 0,
    difficulty: "foundation",
    fieldOrientation: "horizontal",
    fieldView: "full",
    fieldArea: "full",
    objectives: ["Test movement."],
    setupInstructions: ["Set up two players."],
    coachingPoints: ["Move as the ball travels."],
    playbackSettings: {
      transitionDurationMs: 900,
      holdDurationMs: 700,
      loop: false,
    },
    steps: [
      step("start", 0, "Start", [
        player("p1", "home", 0.2, 0.5, "1"),
        player("p2", "home", 0.5, 0.5, "2"),
        ball("ball", 0.2, 0.5),
      ]),
      step("finish", 1, "Finish", [
        player("p1", "home", 0.35, 0.5, "1"),
        player("p2", "home", 0.7, 0.5, "2"),
        ball("ball", 0.7, 0.5),
      ]),
    ],
    tags: ["test"],
  };
}

test("accepts a valid preset with stable object ids", () => {
  assert.deepEqual(validateTacticsPreset(validPreset()), {
    valid: true,
    errors: [],
  });
});

test("rejects malformed coordinates, drawings, ordering, and duplicate ids", () => {
  const preset = validPreset();
  preset.steps[0]!.objects.push({
    id: "p1",
    type: "zone",
    points: [{ x: -0.1, y: 0.2 }],
    color: "#fff",
  });
  preset.steps[1]!.order = 4;
  const result = validateTacticsPreset(preset);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("duplicate object id")));
  assert.ok(result.errors.some((error) => error.includes("changed type")));
  assert.ok(result.errors.some((error) => error.includes("expected order 1")));
  assert.ok(result.errors.some((error) => error.includes("at least two points")));
});

test("rejects duplicate preset ids across the catalog", () => {
  const a = validPreset();
  const b = { ...validPreset(), title: "Another title" };
  const result = validatePresetCatalog([a, b]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("catalog: duplicate preset id test-preset"));
});

test("malformed runtime preset data returns errors instead of throwing", () => {
  const result = validateTacticsPreset({
    id: "broken",
    version: 1,
    title: "Broken",
    shortDescription: "Broken data",
    steps: [{ id: "s1" }],
  } as unknown as TacticsPreset);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("the complete built-in catalog is valid and includes initial release content", () => {
  const result = validatePresetCatalog(BUILT_IN_TACTICS_PRESETS);
  assert.deepEqual(result, { valid: true, errors: [] });
  assert.equal(BUILT_IN_TACTICS_PRESETS.length, 46);
  assert.equal(
    BUILT_IN_TACTICS_PRESETS.filter((preset) => preset.kind === "formation")
      .length,
    9,
  );
  assert.equal(
    BUILT_IN_TACTICS_PRESETS.filter(
      (preset) => preset.kind === "practice_drill",
    ).length,
    15,
  );
  assert.equal(
    BUILT_IN_TACTICS_PRESETS.filter(
      (preset) => preset.category === "set_pieces",
    ).length,
    12,
  );
});
