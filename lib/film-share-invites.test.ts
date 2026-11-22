import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isValidInviteEmail,
  normalizeInviteEmail,
  filmShareJoinPath,
  parseFilmShareInvite,
} from "./film-share-invites";

describe("film share invites", () => {
  it("normalizes emails", () => {
    assert.equal(normalizeInviteEmail("  Coach@Club.COM "), "coach@club.com");
  });

  it("validates emails", () => {
    assert.equal(isValidInviteEmail("a@b.co"), true);
    assert.equal(isValidInviteEmail("nope"), false);
    assert.equal(isValidInviteEmail(""), false);
  });

  it("builds join path", () => {
    assert.equal(filmShareJoinPath("abc"), "/join/film/abc");
  });

  it("parses invite docs", () => {
    const inv = parseFilmShareInvite("c1", {
      ownerUid: "u1",
      ownerLabel: "Sam",
      inviteeEmail: "Coach@X.com",
      status: "pending",
    });
    assert.ok(inv);
    assert.equal(inv.inviteeEmail, "coach@x.com");
    assert.equal(inv.status, "pending");
  });
});
