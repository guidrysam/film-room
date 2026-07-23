import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase/firestore";
import {
  normalizeSignupRoles,
  postOnboardingPath,
  signupRoleFromTeamInviteRole,
} from "./signup-roles";
import { parseUserProfile, userNeedsOnboarding } from "./user-profile";

describe("signup-roles", () => {
  it("normalizes and dedupes roles", () => {
    assert.deepEqual(
      normalizeSignupRoles(["coach", "parent", "coach", "invalid"]),
      ["coach", "parent"],
    );
  });

  it("maps team invite roles", () => {
    assert.equal(signupRoleFromTeamInviteRole("parent"), "parent");
  });

  it("suggests paths by role", () => {
    assert.equal(postOnboardingPath(["club_operator"]), "/club/new");
    assert.equal(postOnboardingPath(["parent"]), "/game-cap");
    assert.equal(postOnboardingPath(["coach", "parent"]), "/app");
  });
});

describe("user-profile", () => {
  it("detects incomplete onboarding", () => {
    assert.equal(userNeedsOnboarding(null), true);
    assert.equal(
      userNeedsOnboarding(
        parseUserProfile("u1", {
          signupRoles: ["coach"],
        }),
      ),
      true,
    );
    assert.equal(
      userNeedsOnboarding(
        parseUserProfile("u1", {
          signupRoles: ["coach"],
          onboardingCompletedAt: Timestamp.fromMillis(1),
        }),
      ),
      false,
    );
  });
});
