import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canManageClub,
  clubRoleFor,
  isClubCoach,
  isClubParent,
  normalizeCreateClubInput,
  type Club,
} from "./clubs";

function stubClub(overrides?: Partial<Club>): Club {
  return {
    id: "club-1",
    name: "CMFC",
    ownerId: "owner-1",
    members: { "owner-1": "club_admin" },
    memberUids: ["owner-1"],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("normalizeCreateClubInput", () => {
  it("requires a name", () => {
    assert.deepEqual(normalizeCreateClubInput({ name: "  " }), {
      error: "Give the club a name.",
    });
  });

  it("trims name and sport", () => {
    assert.deepEqual(
      normalizeCreateClubInput({ name: " CMFC ", sport: " Soccer " }),
      { name: "CMFC", sport: "soccer" },
    );
  });
});

describe("club role helpers", () => {
  it("treats owner as club_admin", () => {
    const club = stubClub({ members: {} });
    assert.equal(clubRoleFor(club, "owner-1"), "club_admin");
    assert.equal(canManageClub(club, "owner-1"), true);
  });

  it("recognizes club_coach and club_parent", () => {
    const club = stubClub({
      members: {
        "owner-1": "club_admin",
        coach1: "club_coach",
        parent1: "club_parent",
      },
    });
    assert.equal(isClubCoach(club, "coach1"), true);
    assert.equal(canManageClub(club, "coach1"), false);
    assert.equal(isClubParent(club, "parent1"), true);
    assert.equal(isClubCoach(club, "parent1"), false);
  });
});
