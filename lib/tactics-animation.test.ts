import assert from "node:assert/strict";
import test from "node:test";
import {
  createIdlePlaybackState,
  easeInOutCubic,
  interpolateStepObjects,
  pausePlayback,
  resumePlayback,
  startPlayback,
  tickPlayback,
} from "./tactics-animation";
import type { TacticsBoardObject } from "./tactics-boards";

const player = (
  id: string,
  x: number,
  y: number,
): TacticsBoardObject => ({
  id,
  type: "player",
  team: "home",
  x,
  y,
  label: "10",
});

const ball = (id: string, x: number, y: number): TacticsBoardObject => ({
  id,
  type: "ball",
  x,
  y,
});

test("easeInOutCubic endpoints", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.ok(easeInOutCubic(0.5) > 0.4 && easeInOutCubic(0.5) < 0.6);
});

test("interpolate unchanged object", () => {
  const from = [player("p1", 0.2, 0.5)];
  const to = [player("p1", 0.2, 0.5)];
  const mid = interpolateStepObjects(from, to, 0.5);
  assert.equal(mid.length, 1);
  const o = mid[0]!;
  assert.equal(o.type, "player");
  if (o.type === "player") {
    assert.ok(Math.abs(o.x - 0.2) < 1e-9);
    assert.ok(Math.abs(o.y - 0.5) < 1e-9);
  }
  assert.equal(o.opacity, 1);
});

test("interpolate moving object at 0, 0.5, 1", () => {
  const from = [player("p1", 0, 0)];
  const to = [player("p1", 1, 1)];
  const a = interpolateStepObjects(from, to, 0);
  const b = interpolateStepObjects(from, to, 0.5);
  const c = interpolateStepObjects(from, to, 1);
  assert.equal(a[0]!.type, "player");
  assert.equal(c[0]!.type, "player");
  if (a[0]!.type === "player" && b[0]!.type === "player" && c[0]!.type === "player") {
    assert.ok(Math.abs(a[0]!.x - 0) < 1e-9);
    assert.ok(b[0]!.x > 0.4 && b[0]!.x < 0.6);
    assert.ok(Math.abs(c[0]!.x - 1) < 1e-9);
  }
});

test("appearing object fades in", () => {
  const from: TacticsBoardObject[] = [];
  const to = [ball("b1", 0.5, 0.5)];
  const mid = interpolateStepObjects(from, to, 0.5);
  assert.equal(mid.length, 1);
  assert.ok(mid[0]!.opacity > 0.4 && mid[0]!.opacity < 0.6);
});

test("disappearing object fades out", () => {
  const from = [ball("b1", 0.5, 0.5)];
  const to: TacticsBoardObject[] = [];
  const mid = interpolateStepObjects(from, to, 0.5);
  assert.equal(mid.length, 1);
  assert.ok(mid[0]!.opacity > 0.4 && mid[0]!.opacity < 0.6);
  assert.equal(mid[0]!.fromLayer, true);
});

test("reordered arrays still match by id", () => {
  const from = [player("a", 0, 0), player("b", 1, 1)];
  const to = [player("b", 0.5, 0.5), player("a", 0.2, 0.2)];
  const mid = interpolateStepObjects(from, to, 1);
  const a = mid.find((o) => o.id === "a");
  const b = mid.find((o) => o.id === "b");
  assert.ok(a && a.type === "player");
  assert.ok(b && b.type === "player");
  if (a?.type === "player" && b?.type === "player") {
    assert.ok(Math.abs(a.x - 0.2) < 1e-9);
    assert.ok(Math.abs(b.x - 0.5) < 1e-9);
  }
});

test("visible false treated as absent", () => {
  const from: TacticsBoardObject[] = [
    { ...player("p1", 0.1, 0.1), visible: false },
  ];
  const to = [player("p1", 0.9, 0.9)];
  const mid = interpolateStepObjects(from, to, 0.5);
  assert.equal(mid.length, 1);
  // Appearing (not moving) because from was invisible
  assert.ok(mid[0]!.opacity < 1);
});

test("missing steps / empty inputs", () => {
  assert.deepEqual(interpolateStepObjects([], [], 0.5), []);
  assert.deepEqual(interpolateStepObjects(undefined as never, [], 0), []);
});

test("does not mutate inputs", () => {
  const from = [player("p1", 0.1, 0.2)];
  const to = [player("p1", 0.8, 0.9)];
  const fromCopy = structuredClone(from);
  const toCopy = structuredClone(to);
  interpolateStepObjects(from, to, 0.3);
  assert.deepEqual(from, fromCopy);
  assert.deepEqual(to, toCopy);
});

test("playback start pause resume restart transitions", () => {
  let state = startPlayback(0, 1000);
  assert.equal(state.status, "playing");
  assert.equal(state.phase, "hold");

  state = tickPlayback(
    state,
    { transitionDurationMs: 900, holdDurationMs: 100, loop: false },
    3,
    1100,
  );
  assert.equal(state.phase, "transition");
  assert.equal(state.toStepIndex, 1);

  state = pausePlayback(state);
  assert.equal(state.status, "paused");
  const frozenProgress = state.progress;

  state = resumePlayback(state, 2000);
  assert.equal(state.status, "playing");
  assert.equal(state.progress, frozenProgress);

  // Finish transition
  state = tickPlayback(
    state,
    { transitionDurationMs: 100, holdDurationMs: 50, loop: false },
    3,
    2200,
    frozenProgress,
  );
  assert.equal(state.phase, "hold");
  assert.equal(state.fromStepIndex, 1);

  // Idle at end without loop
  state = startPlayback(2, 3000);
  state = tickPlayback(
    state,
    { transitionDurationMs: 100, holdDurationMs: 10, loop: false },
    3,
    3020,
  );
  assert.equal(state.status, "idle");

  const idle = createIdlePlaybackState(2);
  assert.equal(idle.status, "idle");
  assert.equal(idle.fromStepIndex, 2);
});
