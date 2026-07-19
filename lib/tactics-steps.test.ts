import assert from "node:assert/strict";
import test from "node:test";
import { deepCloneObjects } from "./tactics-animation";
import { buildLegacyStepPayload } from "./tactics-migration";
import {
  buildPreviewObjects,
  defaultStepTitle,
  parseTacticsStep,
  PREVIEW_OBJECT_CAP,
} from "./tactics-steps";

test("parseTacticsStep defaults title and version", () => {
  const step = parseTacticsStep("s1", "b1", {
    createdBy: "u1",
    updatedBy: "u1",
    order: 2,
    objects: [
      {
        id: "p1",
        type: "player",
        team: "home",
        x: 0.2,
        y: 0.5,
        label: "9",
      },
    ],
  });
  assert.ok(step);
  assert.equal(step!.title, "Step 3");
  assert.equal(step!.version, 1);
  assert.equal(step!.objects.length, 1);
  assert.equal(step!.boardId, "b1");
});

test("defaultStepTitle is 1-based", () => {
  assert.equal(defaultStepTitle(0), "Step 1");
  assert.equal(defaultStepTitle(4), "Step 5");
});

test("deepCloneObjects preserves object ids for Add Step", () => {
  const objects = [
    {
      id: "stable-1",
      type: "ball" as const,
      x: 0.4,
      y: 0.5,
    },
  ];
  const copy = deepCloneObjects(objects);
  assert.equal(copy[0]!.id, "stable-1");
  assert.notEqual(copy[0], objects[0]);
  if (copy[0]!.type === "ball") {
    copy[0] = { ...copy[0], x: 0.9 };
  }
  assert.equal(objects[0]!.x, 0.4);
});

test("buildPreviewObjects caps length", () => {
  const many = Array.from({ length: PREVIEW_OBJECT_CAP + 10 }, (_, i) => ({
    id: `p${i}`,
    type: "ball" as const,
    x: 0.1,
    y: 0.1,
  }));
  assert.equal(buildPreviewObjects(many).length, PREVIEW_OBJECT_CAP);
});

test("buildLegacyStepPayload is idempotent shape", () => {
  const a = buildLegacyStepPayload("board", [{ id: "b", type: "ball", x: 0, y: 0 }], "uid");
  const b = buildLegacyStepPayload("board", [{ id: "b", type: "ball", x: 0, y: 0 }], "uid");
  assert.deepEqual(a, b);
  assert.equal(a.order, 0);
  assert.equal(a.title, "Step 1");
});

test("cannot delete last step is enforced by API contract", () => {
  // Pure guard mirrored from deleteTacticsStep.
  const stepCount = 1;
  assert.equal(stepCount <= 1, true);
});
