import assert from "node:assert/strict";
import test from "node:test";
import {
  countPlayersOnSide,
  setPlayersOnSide,
} from "./tactics-formations";
import type { TacticsBoardObject } from "./tactics-boards";

test("setPlayersOnSide places home and away counts", () => {
  let objects: TacticsBoardObject[] = [];
  objects = setPlayersOnSide(objects, "home", 11);
  assert.equal(countPlayersOnSide(objects, "home"), 11);
  assert.equal(countPlayersOnSide(objects, "away"), 0);

  objects = setPlayersOnSide(objects, "away", 7);
  assert.equal(countPlayersOnSide(objects, "home"), 11);
  assert.equal(countPlayersOnSide(objects, "away"), 7);

  const home = objects.filter((o) => o.type === "player" && o.team === "home");
  const away = objects.filter((o) => o.type === "player" && o.team === "away");
  assert.ok(home.every((p) => p.type === "player" && p.x < 0.5));
  assert.ok(away.every((p) => p.type === "player" && p.x > 0.5));
});

test("setPlayersOnSide preserves drawings and ball", () => {
  const base: TacticsBoardObject[] = [
    {
      id: "ball1",
      type: "ball",
      x: 0.5,
      y: 0.5,
    },
    {
      id: "line1",
      type: "arrow",
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.4 },
      ],
      color: "#fbbf24",
    },
  ];
  const next = setPlayersOnSide(base, "home", 5);
  assert.equal(next.filter((o) => o.type === "ball").length, 1);
  assert.equal(next.filter((o) => o.type === "arrow").length, 1);
  assert.equal(countPlayersOnSide(next, "home"), 5);
});

test("setPlayersOnSide reduces count and keeps earlier labels", () => {
  let objects = setPlayersOnSide([], "home", 5);
  const firstLabel =
    objects.find((o) => o.type === "player") &&
    (objects.find((o) => o.type === "player") as { label: string }).label;
  objects = setPlayersOnSide(objects, "home", 2);
  assert.equal(countPlayersOnSide(objects, "home"), 2);
  const kept = objects.filter((o) => o.type === "player");
  assert.equal(kept[0] && kept[0].type === "player" ? kept[0].label : "", firstLabel);
});
