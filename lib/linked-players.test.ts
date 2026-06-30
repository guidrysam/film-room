import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  linkedPlayerGroupKey,
  parseLinkedPlayerGroupKey,
} from "./linked-players";

describe("linkedPlayerGroupKey", () => {
  it("uses person id when present", () => {
    assert.equal(
      linkedPlayerGroupKey({
        personId: "person-1",
        teamId: "t1",
        playerId: "p1",
      }),
      "person:person-1",
    );
  });

  it("falls back to team player id", () => {
    assert.equal(
      linkedPlayerGroupKey({ teamId: "t1", playerId: "p1" }),
      "player:t1:p1",
    );
  });
});

describe("parseLinkedPlayerGroupKey", () => {
  it("round-trips person keys", () => {
    const parsed = parseLinkedPlayerGroupKey("person:abc");
    assert.deepEqual(parsed, { kind: "person", personId: "abc" });
  });

  it("round-trips player keys", () => {
    const parsed = parseLinkedPlayerGroupKey("player:t1:p1");
    assert.deepEqual(parsed, {
      kind: "player",
      teamId: "t1",
      playerId: "p1",
    });
  });
});
