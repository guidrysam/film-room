import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRosterImportPreview } from "./roster-import";
import { playerRosterKey } from "./teams";

describe("roster-import parent targets", () => {
  it("preview includes parent email for import", () => {
    const preview = buildRosterImportPreview(
      [
        {
          rowIndex: 2,
          playerName: "Alex Smith",
          jerseyNumber: "7",
          parentName: "Jane Smith",
          parentEmail: "jane@example.com",
        },
      ],
      [],
    );
    assert.equal(preview.length, 1);
    assert.equal(preview[0]!.status, "create");
    assert.equal(preview[0]!.parentEmail, "jane@example.com");
    assert.equal(preview[0]!.parentName, "Jane Smith");
  });

  it("duplicate player name + jersey marks update", () => {
    const preview = buildRosterImportPreview(
      [{ rowIndex: 3, playerName: "Alex Smith", jerseyNumber: "7" }],
      [
        {
          id: "p1",
          name: "Alex Smith",
          jerseyNumber: "7",
        },
      ],
    );
    assert.equal(preview[0]!.status, "update");
    assert.equal(preview[0]!.existingPlayerId, "p1");
    assert.equal(
      playerRosterKey("Alex Smith", "7"),
      playerRosterKey("Alex Smith", "7"),
    );
  });
});
