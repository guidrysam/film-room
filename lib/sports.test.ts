import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeSportForStorage,
  isBasketballSport,
  isSoccerCurriculumSport,
  normalizeSportId,
  resolveSportId,
  sportLabel,
} from "@/lib/sports";

describe("normalizeSportId", () => {
  it("maps free-text and aliases", () => {
    assert.equal(normalizeSportId("Basketball"), "basketball");
    assert.equal(normalizeSportId(" youth soccer "), "soccer");
    assert.equal(normalizeSportId("Hoops"), "basketball");
    assert.equal(normalizeSportId("unknown-sport"), null);
  });
});

describe("canonicalizeSportForStorage", () => {
  it("stores canonical ids when known", () => {
    assert.equal(canonicalizeSportForStorage(" Basketball "), "basketball");
    assert.equal(canonicalizeSportForStorage(" Lacrosse "), "Lacrosse");
    assert.equal(canonicalizeSportForStorage("  "), undefined);
  });
});

describe("resolveSportId", () => {
  it("prefers game then team then club", () => {
    assert.equal(
      resolveSportId({
        gameSport: "basketball",
        teamSport: "soccer",
      }),
      "basketball",
    );
    assert.equal(
      resolveSportId({ teamSport: "Basketball" }),
      "basketball",
    );
    assert.equal(resolveSportId({}), "soccer");
  });
});

describe("curriculum gating", () => {
  it("treats basketball as non-soccer curriculum", () => {
    assert.equal(isBasketballSport("basketball"), true);
    assert.equal(isSoccerCurriculumSport("basketball"), false);
    assert.equal(isSoccerCurriculumSport(undefined), true);
    assert.equal(sportLabel("basketball"), "Basketball");
  });
});
