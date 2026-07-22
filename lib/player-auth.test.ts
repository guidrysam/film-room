import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlayerAuthEmail,
  normalizePlayerUsername,
  playerUsernameToAuthEmail,
  validatePlayerPassword,
  validatePlayerUsername,
} from "@/lib/player-auth";

test("normalizes and validates player usernames", () => {
  assert.equal(normalizePlayerUsername(" Sam.Soccer "), "sam.soccer");
  assert.equal(validatePlayerUsername("ab").ok, false);
  assert.equal(validatePlayerUsername("sam_1").ok, true);
  assert.equal(
    playerUsernameToAuthEmail("Sam_1"),
    "sam_1@player.filmroom.app",
  );
  assert.equal(isPlayerAuthEmail("sam_1@player.filmroom.app"), true);
  assert.equal(isPlayerAuthEmail("parent@gmail.com"), false);
});

test("player passwords require Firebase-compatible length", () => {
  assert.equal(validatePlayerPassword("12345").ok, false);
  assert.equal(validatePlayerPassword("soccer1").ok, true);
});
