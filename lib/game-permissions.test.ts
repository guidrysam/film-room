import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Game } from "./games";
import {
  canContributeGameSources,
  canEditGame,
  canManageGame,
  canViewGame,
} from "./games";
import { contributorPresent, parseContributorRole } from "./game-access-denorm";

const ownerUid = "owner-uid";
const editorUid = "editor-uid";
const viewerUid = "viewer-uid";
const teamCoachUid = "coach-uid";
const outsiderUid = "outsider-uid";

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-1",
    title: "Cup final",
    ownerId: ownerUid,
    contributors: {
      [ownerUid]: "owner",
      [editorUid]: "editor",
      [viewerUid]: "viewer",
    },
    memberUids: [ownerUid, editorUid, viewerUid],
    visibility: "private",
    teamId: "team-1",
    sourceIds: [],
    eventIds: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

/**
 * Client-side permission matrix (Firestore rules mirror these paths in firestore.rules).
 *
 * Collection layout:
 * - games/{gameId}
 * - games/{gameId}/sources   (video sources)
 * - games/{gameId}/events    (coach marks, stats, notes)
 * - games/{gameId}/cuts      (highlights / director tracks)
 *
 * There is no games/{gameId}/stats or /highlights subcollection — stats are
 * events with type "stat"; highlights are cuts with kind "highlight".
 */
describe("game permission matrix (client helpers)", () => {
  it("owner can view, edit, manage, and contribute sources", () => {
    const g = game();
    assert.equal(canViewGame(g, ownerUid, "coach"), true);
    assert.equal(canManageGame(g, ownerUid), true);
    assert.equal(canEditGame(g, ownerUid), true);
    assert.equal(canContributeGameSources(g, ownerUid, "coach"), true);
  });

  it("editor can view and edit but not manage", () => {
    const g = game();
    assert.equal(canViewGame(g, editorUid, null), true);
    assert.equal(canManageGame(g, editorUid), false);
    assert.equal(canEditGame(g, editorUid), true);
    assert.equal(canContributeGameSources(g, editorUid, null), true);
  });

  it("viewer can view but not edit or attach sources alone", () => {
    const g = game();
    assert.equal(canViewGame(g, viewerUid, null), true);
    assert.equal(canEditGame(g, viewerUid), false);
    assert.equal(canContributeGameSources(g, viewerUid, null), false);
  });

  it("team coach without contributor entry can view and attach via team role", () => {
    const g = game({ contributors: { [ownerUid]: "owner" }, memberUids: [ownerUid] });
    assert.equal(canViewGame(g, teamCoachUid, "coach"), true);
    assert.equal(canEditGame(g, teamCoachUid), false);
    assert.equal(canContributeGameSources(g, teamCoachUid, "coach"), true);
  });

  it("anonymous user cannot view private games", () => {
    const g = game();
    assert.equal(canViewGame(g, "", null), false);
  });

  it("public visibility allows anonymous view", () => {
    const g = game({ visibility: "public" });
    assert.equal(canViewGame(g, "", null), true);
  });

  it("outsider cannot view private team game without membership", () => {
    const g = game();
    assert.equal(canViewGame(g, outsiderUid, null), false);
  });

  it("accepts nested contributor role objects for read checks", () => {
    assert.equal(parseContributorRole({ role: "owner" }), "owner");
    assert.equal(
      contributorPresent({ [ownerUid]: { role: "owner" } }, ownerUid),
      true,
    );
  });
});
