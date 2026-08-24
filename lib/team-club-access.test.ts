import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canManageTeam,
  canViewTeam,
  type Team,
  type TeamClubContext,
} from "./teams";

function stubTeam(overrides?: Partial<Team>): Team {
  return {
    id: "team-1",
    name: "U12 Fall",
    ownerId: "coach-1",
    members: { "coach-1": "admin" },
    memberUids: ["coach-1"],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("club cascade on teams", () => {
  it("lets club admins view and manage linked teams", () => {
    const team = stubTeam({ clubId: "club-1" });
    const club: TeamClubContext = {
      id: "club-1",
      ownerId: "club-owner",
      members: { "club-owner": "club_admin", "club-admin-2": "club_admin" },
    };
    assert.equal(canViewTeam(team, "club-owner"), false);
    assert.equal(canViewTeam(team, "club-owner", club), true);
    assert.equal(canManageTeam(team, "club-owner", club), true);
    assert.equal(canViewTeam(team, "club-admin-2", club), true);
  });

  it("does not grant access when clubId does not match", () => {
    const team = stubTeam({ clubId: "club-other" });
    const club: TeamClubContext = {
      id: "club-1",
      ownerId: "club-owner",
      members: { "club-owner": "club_admin" },
    };
    assert.equal(canViewTeam(team, "club-owner", club), false);
  });
});
