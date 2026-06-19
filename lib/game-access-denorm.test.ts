import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  contributorPresent,
  gameAccessDenormFromGame,
  gameAccessDenormFromUid,
  parseContributorRole,
} from "./game-access-denorm";
import type { Game } from "./games";

describe("game-access-denorm", () => {
  it("parses flat and nested contributor roles", () => {
    assert.equal(parseContributorRole("owner"), "owner");
    assert.equal(parseContributorRole({ role: "editor" }), "editor");
    assert.equal(parseContributorRole({ role: "nope" }), null);
  });

  it("detects contributor presence for nested role objects", () => {
    assert.equal(
      contributorPresent({ uid1: { role: "owner" } }, "uid1"),
      true,
    );
    assert.equal(contributorPresent({ uid1: "viewer" }, "uid1"), true);
    assert.equal(contributorPresent({}, "uid1"), false);
  });

  it("builds denorm fields from a game", () => {
    const game: Game = {
      id: "g1",
      title: "Test",
      ownerId: "coach",
      contributors: { coach: "owner" },
      memberUids: ["coach"],
      visibility: "private",
      teamId: "team-1",
      createdAt: null,
      updatedAt: null,
    };
    assert.deepEqual(gameAccessDenormFromGame(game), {
      gameOwnerId: "coach",
      gameMemberUids: ["coach"],
      gameTeamId: "team-1",
    });
  });

  it("builds minimal denorm from uid", () => {
    assert.deepEqual(gameAccessDenormFromUid("coach", "team-1"), {
      gameOwnerId: "coach",
      gameMemberUids: ["coach"],
      gameTeamId: "team-1",
    });
  });
});
