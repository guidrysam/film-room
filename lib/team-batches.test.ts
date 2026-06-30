import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupTeamsByImportBatch } from "./team-batches";
import type { Team } from "./teams";

function stubTeam(
  id: string,
  name: string,
  extra?: Partial<Team>,
): Team {
  return {
    id,
    name,
    ownerId: "u1",
    members: { u1: "admin" },
    memberUids: ["u1"],
    createdAt: null,
    updatedAt: null,
    ...extra,
  };
}

describe("groupTeamsByImportBatch", () => {
  it("groups teams by import batch label", () => {
    const groups = groupTeamsByImportBatch([
      stubTeam("t1", "CMFC U12 · Fall 2026", {
        importBatchId: "b1",
        importBatchLabel: "Fall 2026",
        programName: "CMFC U12",
      }),
      stubTeam("t2", "CMFC U14 · Fall 2026", {
        importBatchId: "b1",
        importBatchLabel: "Fall 2026",
        programName: "CMFC U14",
      }),
      stubTeam("t3", "Legacy Team"),
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups[0]!.label, "Fall 2026");
    assert.equal(groups[0]!.teams.length, 2);
    assert.equal(groups[1]!.label, "Other teams");
    assert.equal(groups[1]!.teams.length, 1);
  });

  it("hides archived batches by default", () => {
    const groups = groupTeamsByImportBatch(
      [
        stubTeam("t1", "Fall", { importBatchId: "b1" }),
        stubTeam("t2", "Summer", { importBatchId: "b2" }),
      ],
      { archivedBatchIds: new Set(["b2"]) },
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.importBatchId, "b1");
  });
});
