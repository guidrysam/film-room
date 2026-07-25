import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isScoringStatType, reviewTagsForSport } from "@/lib/sport-pack";

describe("reviewTagsForSport", () => {
  it("returns basketball quick tags", () => {
    const { quickTags, markTags, sportId } = reviewTagsForSport("basketball");
    assert.equal(sportId, "basketball");
    assert.ok(quickTags.some((t) => t.label === "Bucket"));
    assert.ok(markTags.some((t) => t.label === "Inbound"));
    assert.ok(!quickTags.some((t) => t.label === "Goal"));
  });

  it("returns soccer quick tags by default", () => {
    const { quickTags, sportId } = reviewTagsForSport(undefined);
    assert.equal(sportId, "soccer");
    assert.ok(quickTags.some((t) => t.label === "Goal"));
  });
});

describe("isScoringStatType", () => {
  it("includes basketball scoring", () => {
    assert.equal(isScoringStatType("field_goal"), true);
    assert.equal(isScoringStatType("three_pointer"), true);
    assert.equal(isScoringStatType("goal"), true);
    assert.equal(isScoringStatType("assist"), false);
  });
});
