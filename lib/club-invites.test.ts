import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractClubInviteCode,
  normalizeClubInviteCode,
} from "./club-invites";

describe("normalizeClubInviteCode", () => {
  it("trims and decodes", () => {
    assert.equal(normalizeClubInviteCode("  abc_12-xy  "), "abc_12-xy");
    assert.equal(normalizeClubInviteCode("a%2Fb"), "a/b");
  });
});

describe("extractClubInviteCode", () => {
  it("reads a join URL", () => {
    assert.equal(
      extractClubInviteCode("https://film-room-gray.vercel.app/join/club/abc_12-xyZZ"),
      "abc_12-xyZZ",
    );
  });

  it("reads a path or raw code", () => {
    assert.equal(
      extractClubInviteCode("/join/club/abc_12-xyZZ"),
      "abc_12-xyZZ",
    );
    assert.equal(extractClubInviteCode("abc_12-xyZZZZ"), "abc_12-xyZZZZ");
  });

  it("rejects short or unrelated text", () => {
    assert.equal(extractClubInviteCode("CMFC"), null);
    assert.equal(extractClubInviteCode(""), null);
  });
});
