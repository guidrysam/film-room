import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTacticsBoard,
  parseTacticsBoardObject,
  relativeUpdatedLabel,
  visibilityLabel,
} from "./tactics-boards";
import { clampNorm, svgToNorm, normToSvg, viewBoxAttr, viewBoxRect, clampNormToFieldView } from "./tactics-field-geometry";
import { Timestamp } from "firebase/firestore";

test("parseTacticsBoardObject parses player ball and drawings", () => {
  const player = parseTacticsBoardObject({
    id: "p1",
    type: "player",
    team: "home",
    x: 0.5,
    y: 0.5,
    label: "10",
  });
  assert.equal(player?.type, "player");
  if (player?.type === "player") {
    assert.equal(player.label, "10");
    assert.equal(player.team, "home");
  }

  const ball = parseTacticsBoardObject({
    id: "b1",
    type: "ball",
    x: 1.5,
    y: -0.2,
  });
  assert.equal(ball?.type, "ball");
  if (ball?.type === "ball") {
    assert.equal(ball.x, 1);
    assert.equal(ball.y, 0);
  }

  const arrow = parseTacticsBoardObject({
    id: "a1",
    type: "arrow",
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.4 },
    ],
    color: "#fbbf24",
  });
  assert.equal(arrow?.type, "arrow");
});

test("parseTacticsBoardObject parses drill equipment and labels", () => {
  assert.deepEqual(
    parseTacticsBoardObject({
      id: "cone-1",
      type: "cone",
      x: 0.2,
      y: 0.3,
      color: "#f97316",
    }),
    {
      id: "cone-1",
      type: "cone",
      x: 0.2,
      y: 0.3,
      color: "#f97316",
    },
  );
  assert.deepEqual(
    parseTacticsBoardObject({
      id: "goal-1",
      type: "mini_goal",
      x: 0.8,
      y: 0.5,
      rotation: 90,
    }),
    {
      id: "goal-1",
      type: "mini_goal",
      x: 0.8,
      y: 0.5,
      rotation: 90,
    },
  );
  assert.deepEqual(
    parseTacticsBoardObject({
      id: "label-1",
      type: "area_label",
      x: 0.5,
      y: 0.1,
      text: "End zone",
    }),
    {
      id: "label-1",
      type: "area_label",
      x: 0.5,
      y: 0.1,
      text: "End zone",
    },
  );
});

test("parseTacticsBoard defaults visibility and version", () => {
  const board = parseTacticsBoard("bid", "tid", {
    title: "Corner Kick",
    createdBy: "uid1",
    updatedBy: "uid1",
    objects: [],
  });
  assert.ok(board);
  assert.equal(board!.visibility, "team_coaches");
  assert.equal(board!.version, 1);
  assert.equal(board!.sport, "soccer");
  assert.equal(board!.fieldOrientation, "horizontal");
  assert.equal(board!.fieldView, "full");
  assert.equal(board!.stepCount, 0);
  assert.equal(board!.playbackSettings.transitionDurationMs, 900);
  assert.deepEqual(board!.previewObjects, []);
});

test("parseTacticsBoard reads fieldView", () => {
  const board = parseTacticsBoard("bid", "tid", {
    title: "Press",
    createdBy: "uid1",
    updatedBy: "uid1",
    fieldView: "offensive",
    objects: [],
  });
  assert.equal(board!.fieldView, "offensive");
});

test("normToSvg and svgToNorm round-trip horizontally", () => {
  const n = { x: 0.25, y: 0.75 };
  const s = normToSvg(n.x, n.y, "horizontal");
  const back = svgToNorm(s.x, s.y, "horizontal");
  assert.ok(Math.abs(back.x - n.x) < 1e-9);
  assert.ok(Math.abs(back.y - n.y) < 1e-9);
});

test("clampNorm clamps to unit square", () => {
  assert.deepEqual(clampNorm(-1, 2), { x: 0, y: 1 });
});

test("viewBoxRect crops halves for offensive and defensive", () => {
  assert.equal(viewBoxAttr("horizontal", "full"), "0 0 1050 680");
  assert.deepEqual(viewBoxRect("horizontal", "defensive"), {
    x: 0,
    y: 0,
    w: 525,
    h: 680,
  });
  assert.deepEqual(viewBoxRect("horizontal", "offensive"), {
    x: 525,
    y: 0,
    w: 525,
    h: 680,
  });
  assert.deepEqual(clampNormToFieldView(0.2, 0.5, "horizontal", "offensive"), {
    x: 0.5,
    y: 0.5,
  });
  assert.deepEqual(clampNormToFieldView(0.8, 0.5, "horizontal", "defensive"), {
    x: 0.5,
    y: 0.5,
  });
});
test("visibilityLabel and relativeUpdatedLabel", () => {
  assert.match(visibilityLabel("team_coaches"), /coaches/i);
  assert.equal(relativeUpdatedLabel(null), "Not saved yet");
  const now = Timestamp.fromMillis(Date.now());
  assert.equal(relativeUpdatedLabel(now, Date.now()), "Just now");
});
