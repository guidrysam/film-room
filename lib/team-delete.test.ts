import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canDeleteTeam,
  TEAM_DELETE_BLOCKED_GAMES_MSG,
  type Team,
} from "./teams";

function team(partial: Partial<Team> & Pick<Team, "id" | "name" | "ownerId">): Team {
  return {
    members: {},
    memberUids: [],
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

describe("team deletion permissions", () => {
  it("owner can delete team", () => {
    const t = team({
      id: "t1",
      name: "U14 Wolves",
      ownerId: "owner-uid",
      members: { "owner-uid": "admin" },
      memberUids: ["owner-uid"],
    });
    assert.equal(canDeleteTeam(t, "owner-uid"), true);
  });

  it("non-owner admin cannot delete team", () => {
    const t = team({
      id: "t1",
      name: "U14 Wolves",
      ownerId: "owner-uid",
      members: { "owner-uid": "admin", "coach-uid": "admin" },
      memberUids: ["owner-uid", "coach-uid"],
    });
    assert.equal(canDeleteTeam(t, "coach-uid"), false);
  });

  it("coach cannot delete team", () => {
    const t = team({
      id: "t1",
      name: "U14 Wolves",
      ownerId: "owner-uid",
      members: { "owner-uid": "admin", "coach-uid": "coach" },
      memberUids: ["owner-uid", "coach-uid"],
    });
    assert.equal(canDeleteTeam(t, "coach-uid"), false);
  });
});

describe("team deletion blocked by games", () => {
  it("exposes message when games exist", () => {
    assert.match(TEAM_DELETE_BLOCKED_GAMES_MSG, /games/i);
    assert.match(TEAM_DELETE_BLOCKED_GAMES_MSG, /Delete or move/i);
  });
});
