import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCoachTeam,
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

  it("lets club admins coach linked teams (create games)", () => {
    const team = stubTeam({ clubId: "club-1" });
    const club: TeamClubContext = {
      id: "club-1",
      ownerId: "club-owner",
      members: { "club-owner": "club_admin" },
    };
    assert.equal(canCoachTeam(team, "club-owner"), false);
    assert.equal(canCoachTeam(team, "club-owner", club), true);
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

  it("lets club coaches view linked team film (not manage)", () => {
    const team = stubTeam({ clubId: "club-1" });
    const club: TeamClubContext = {
      id: "club-1",
      ownerId: "club-owner",
      members: { "club-coach-1": "club_coach" },
    };
    assert.equal(canViewTeam(team, "club-coach-1"), false);
    assert.equal(canViewTeam(team, "club-coach-1", club), true);
    assert.equal(canManageTeam(team, "club-coach-1", club), false);
    assert.equal(canCoachTeam(team, "club-coach-1", club), false);
  });
});
