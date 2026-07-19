import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTacticsBoard,
  parseTacticsBoardObject,
  relativeUpdatedLabel,
  visibilityLabel,
} from "./tactics-boards";
import { clampNorm, svgToNorm, normToSvg } from "./tactics-field-geometry";
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

test("visibilityLabel and relativeUpdatedLabel", () => {
  assert.match(visibilityLabel("team_coaches"), /coaches/i);
  assert.equal(relativeUpdatedLabel(null), "Not saved yet");
  const now = Timestamp.fromMillis(Date.now());
  assert.equal(relativeUpdatedLabel(now, Date.now()), "Just now");
});
