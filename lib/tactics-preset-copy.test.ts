import assert from "node:assert/strict";
import test from "node:test";
import { clonePresetSteps } from "@/lib/tactics-preset-copy";
import { ball, player, step } from "@/lib/tactics-presets/helpers";
import type { TacticsPreset } from "@/lib/tactics-presets/types";

const preset: TacticsPreset = {
  id: "copy-test",
  version: 2,
  title: "Copy test",
  shortDescription: "Tests independent copies.",
  kind: "tactical_sequence",
  category: "attacking",
  format: "small_sided",
  difficulty: "foundation",
  fieldOrientation: "horizontal",
  fieldView: "full",
  objectives: ["Copy safely."],
  setupInstructions: ["Set up."],
  coachingPoints: ["Keep stable identities."],
  playbackSettings: {
    transitionDurationMs: 900,
    holdDurationMs: 700,
    loop: false,
  },
  steps: [
    step("one", 0, "One", [
      player("player-a", "home", 0.2, 0.2, "1"),
      ball("ball", 0.2, 0.25),
    ]),
    step("two", 1, "Two", [
      player("player-a", "home", 0.6, 0.2, "1"),
      ball("ball", 0.6, 0.25),
    ]),
  ],
  tags: ["copy"],
};

test("deep copies steps while preserving stable tactical object ids", () => {
  const copy = clonePresetSteps(preset);
  assert.notEqual(copy[0], preset.steps[0]);
  assert.notEqual(copy[0]!.objects[0], preset.steps[0]!.objects[0]);
  assert.equal(copy[0]!.objects[0]!.id, "player-a");
  assert.equal(copy[1]!.objects[0]!.id, "player-a");

  const copiedPlayer = copy[0]!.objects[0]!;
  assert.equal(copiedPlayer.type, "player");
  if (copiedPlayer.type === "player") copiedPlayer.x = 0.9;
  const originalPlayer = preset.steps[0]!.objects[0]!;
  assert.equal(originalPlayer.type, "player");
  if (originalPlayer.type === "player") assert.equal(originalPlayer.x, 0.2);
});
