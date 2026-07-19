import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSharePayload } from "./tactics-board-share";

test("normalizeSharePayload upgrades v1 objects to a single step", () => {
  const payload = normalizeSharePayload({
    schema: "tactics_board_share_v1",
    title: "Press",
    sport: "soccer",
    fieldOrientation: "horizontal",
    fieldView: "full",
    objects: [
      { id: "p1", type: "player", team: "home", x: 0.2, y: 0.5, label: "9" },
    ],
    steps: [],
    playbackSettings: {
      transitionDurationMs: 900,
      holdDurationMs: 700,
      loop: false,
    },
  });
  assert.equal(payload.schema, "tactics_board_share_v2");
  assert.equal(payload.steps.length, 1);
  assert.equal(payload.steps[0]!.objects.length, 1);
});

test("normalizeSharePayload sorts steps by order", () => {
  const payload = normalizeSharePayload({
    schema: "tactics_board_share_v2",
    title: "Sequence",
    sport: "soccer",
    fieldOrientation: "horizontal",
    fieldView: "offensive",
    objects: [],
    steps: [
      { id: "s2", order: 1, title: "Step 2", objects: [] },
      { id: "s1", order: 0, title: "Step 1", objects: [] },
    ],
    playbackSettings: {
      transitionDurationMs: 900,
      holdDurationMs: 700,
      loop: true,
    },
  });
  assert.equal(payload.steps[0]!.id, "s1");
  assert.equal(payload.steps[1]!.id, "s2");
  assert.equal(payload.playbackSettings.loop, true);
});
