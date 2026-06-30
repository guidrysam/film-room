import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatEventTeamName } from "./import-batches";

describe("formatEventTeamName", () => {
  it("combines program and event label", () => {
    assert.equal(
      formatEventTeamName("CMFC U12 Girls", "Fall 2026"),
      "CMFC U12 Girls · Fall 2026",
    );
  });

  it("returns program alone when event is empty", () => {
    assert.equal(formatEventTeamName("CMFC U12 Girls", ""), "CMFC U12 Girls");
  });

  it("does not duplicate event when already in program name", () => {
    assert.equal(
      formatEventTeamName("CMFC U12 · Fall 2026", "Fall 2026"),
      "CMFC U12 · Fall 2026",
    );
  });
});
