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
    warnings: [],
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

test("practice drills require instructional fields and four meaningful steps", () => {
  const drill = {
    ...validPreset(),
    id: "instructional-drill",
    kind: "practice_drill" as const,
    category: "practice_drills" as const,
    howItWorks: ["Play through the sequence and reset."],
    progressions: [
      { title: "Add pressure", description: "Introduce a passive defender." },
    ],
    equipment: { balls: 1, cones: 4 },
    ageGuidance: "U10+",
    commonMistakes: [
      { mistake: "Players stand still." },
      { mistake: "Passes lack pace." },
      { mistake: "The group resets slowly." },
    ],
    steps: Array.from({ length: 4 }, (_, index) => ({
      ...validPreset().steps[index % 2]!,
      id: `drill-step-${index}`,
      order: index,
      title: `Step ${index + 1}`,
      explanation: `Meaningful instruction ${index + 1}.`,
      coachCue: `Cue ${index + 1}.`,
    })),
  };
  assert.equal(validateTacticsPreset(drill).valid, true);

  drill.steps = drill.steps.slice(0, 3);
  drill.steps[0] = { ...drill.steps[0]!, explanation: "" };
  const result = validateTacticsPreset(drill);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) => error.includes("at least four steps")),
  );
  assert.ok(
    result.errors.some((error) => error.includes("require an explanation")),
  );
});

test("practice drill quality gaps produce warnings without hard failure", () => {
  const base = validPreset();
  const drill: TacticsPreset = {
    ...base,
    kind: "practice_drill",
    category: "practice_drills",
    howItWorks: ["Repeat and reset."],
    progressions: ["Add pressure"],
    steps: Array.from({ length: 4 }, (_, index) => ({
      ...base.steps[index % 2]!,
      id: `warning-step-${index}`,
      order: index,
      explanation: `Instruction ${index + 1}`,
    })),
  };
  const result = validateTacticsPreset(drill);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((warning) => warning.includes("coach cue")));
  assert.ok(
    result.warnings.some((warning) => warning.includes("common mistakes")),
  );
  assert.ok(result.warnings.some((warning) => warning.includes("equipment")));
});

test("legacy non-drill presets remain valid without instructional fields", () => {
  const legacy = validPreset();
  delete legacy.steps[0]!.explanation;
  assert.equal(validateTacticsPreset(legacy).valid, true);
});

test("legacy team drill validation remains migration-compatible", () => {
  const legacyDrill: TacticsPreset = {
    ...validPreset(),
    kind: "practice_drill",
    category: "practice_drills",
    steps: [validPreset().steps[0]!],
  };
  assert.equal(validateTacticsPreset(legacyDrill).valid, false);
  assert.equal(
    validateTacticsPreset(legacyDrill, { allowLegacyDrill: true }).valid,
    true,
  );
});

test("the complete built-in catalog is valid and includes initial release content", () => {
  const result = validatePresetCatalog(BUILT_IN_TACTICS_PRESETS);
  assert.deepEqual(result, { valid: true, errors: [], warnings: [] });
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
  for (const preset of BUILT_IN_TACTICS_PRESETS) {
    assert.equal(preset.editorialMetadata?.contentStatus, "internal_draft");
    assert.deepEqual(preset.editorialMetadata?.methodologyTags, [
      "game-based learning",
      "guided discovery",
      "technical development",
    ]);
    assert.equal(Object.isFrozen(preset), true);
    assert.equal(Object.isFrozen(preset.steps), true);
  }
  const drills = BUILT_IN_TACTICS_PRESETS.filter(
    (preset) => preset.kind === "practice_drill",
  );
  for (const drill of drills) {
    assert.ok(drill.steps.length >= 4, drill.title);
    assert.ok(drill.steps.every((lessonStep) => lessonStep.explanation));
    assert.ok((drill.commonMistakes?.length ?? 0) >= 3, drill.title);
    assert.ok(
      (drill.progressions?.length ?? 0) +
        (drill.regressions?.length ?? 0) >
        0,
      drill.title,
    );
  }
  const requiredLessonLengths: Record<string, number> = {
    "drill-ball-mastery-grid": 6,
    "drill-passing-gates-pairs": 6,
    "drill-passing-diamond": 7,
    "drill-rondo-4v1": 7,
    "drill-rondo-5v2": 6,
    "drill-3v2-to-goal": 7,
    "drill-end-zone-possession": 6,
    "drill-buildout-directional": 7,
  };
  for (const [id, minimum] of Object.entries(requiredLessonLengths)) {
    const drill = drills.find((candidate) => candidate.id === id);
    assert.ok(drill, id);
    assert.ok(drill.steps.length >= minimum, `${id} requires ${minimum} steps`);
  }
});
