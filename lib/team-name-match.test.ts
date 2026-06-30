import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findBestTeamMatch,
  teamNameSimilarity,
  type Team,
} from "./teams";

function team(id: string, name: string): Team {
  return { id, name } as Team;
}

test("teamNameSimilarity is 1 for exact (normalized) matches", () => {
  assert.equal(teamNameSimilarity("CMFC 12U Girls", "cmfc  12u   girls"), 1);
});

test("teamNameSimilarity scores reordered / partial names highly", () => {
  // CSV name vs Film Room team name with a different word order + extra token.
  const score = teamNameSimilarity("CMFC 12U Girls", "CMFC SAND 12u Girls");
  assert.ok(score >= 0.5, `expected >= 0.5, got ${score}`);
});

test("teamNameSimilarity rewards substring containment", () => {
  const score = teamNameSimilarity("Sand", "CMFC SAND 12u Girls");
  assert.ok(score >= 0.5, `expected >= 0.5, got ${score}`);
});

test("teamNameSimilarity is 0 with no shared tokens", () => {
  assert.equal(teamNameSimilarity("Rapids U14 Boys", "Kings 10U Girls"), 0);
});

test("findBestTeamMatch picks the closest team", () => {
  const teams = [
    team("a", "CMFC 14U Boys"),
    team("b", "CMFC SAND 12u Girls"),
    team("c", "Rapids 12U Girls"),
  ];
  const best = findBestTeamMatch(teams, "CMFC 12U Girls");
  assert.equal(best?.team.id, "b");
});

test("findBestTeamMatch returns undefined when nothing overlaps", () => {
  const teams = [team("a", "Kings 10U Girls")];
  assert.equal(findBestTeamMatch(teams, "Rapids U14 Boys"), undefined);
});
