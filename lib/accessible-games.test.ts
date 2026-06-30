import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase/firestore";
import type { Game } from "./games";
import { mergeAccessibleGames } from "./accessible-games";

function game(id: string, millis: number, teamId?: string): Game {
  return {
    id,
    title: id,
    ownerId: "o",
    contributors: { o: "owner" },
    memberUids: ["o"],
    sourceIds: [],
    eventIds: [],
    visibility: "private",
    ...(teamId ? { teamId } : {}),
    createdAt: null,
    updatedAt: Timestamp.fromMillis(millis),
  };
}

describe("mergeAccessibleGames", () => {
  it("dedupes by id and sorts newest first", () => {
    const out = mergeAccessibleGames([
      [game("g1", 100, "t1"), game("g2", 200)],
      [game("g1", 100, "t1"), game("g3", 300)],
    ]);
    assert.deepEqual(
      out.map((g) => g.id),
      ["g3", "g2", "g1"],
    );
  });
});
