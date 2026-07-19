import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase/firestore";
import {
  canEditTacticsBoard,
  canViewTacticsBoard,
  type TacticsBoard,
} from "./tactics-boards";
import type { Team } from "./teams";

function team(members: Record<string, "admin" | "coach" | "parent" | "player" | "viewer">): Team {
  return {
    id: "t1",
    name: "Test",
    ownerId: "owner",
    members: { owner: "admin", ...members },
    memberUids: ["owner", ...Object.keys(members)],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

function board(partial: Partial<TacticsBoard> = {}): TacticsBoard {
  return {
    id: "b1",
    teamId: "t1",
    title: "Board",
    createdAt: null,
    updatedAt: null,
    createdBy: "coach1",
    updatedBy: "coach1",
    sport: "soccer",
    fieldOrientation: "horizontal",
    fieldView: "full",
    visibility: "team_coaches",
    objects: [],
    previewObjects: [],
    stepCount: 1,
    playbackSettings: {
      transitionDurationMs: 900,
      holdDurationMs: 700,
      loop: false,
    },
    version: 1,
    ...partial,
  };
}

test("coaches can view and edit team boards", () => {
  const t = team({ coach1: "coach" });
  const b = board();
  assert.equal(canViewTacticsBoard(b, t, "coach1"), true);
  assert.equal(canEditTacticsBoard(b, t, "coach1"), true);
});

test("parents cannot view tactics library boards", () => {
  const t = team({ parent1: "parent" });
  assert.equal(canViewTacticsBoard(board(), t, "parent1"), false);
});

test("private boards only for creator or owner", () => {
  const t = team({ coach1: "coach", coach2: "coach" });
  const b = board({ visibility: "private", createdBy: "coach1" });
  assert.equal(canEditTacticsBoard(b, t, "coach1"), true);
  assert.equal(canEditTacticsBoard(b, t, "coach2"), false);
  assert.equal(canEditTacticsBoard(b, t, "owner"), true);
});
