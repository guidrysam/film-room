import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findBestPersonMatch,
  personNameSimilarity,
  type Person,
} from "./persons";

function stubPerson(id: string, name: string): Person {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    createdAt: null,
    updatedAt: null,
  };
}

describe("personNameSimilarity", () => {
  it("matches exact names", () => {
    assert.equal(personNameSimilarity("Lumen Guidry-Lane", "Lumen Guidry-Lane"), 1);
  });

  it("matches reordered tokens", () => {
    const score = personNameSimilarity("Guidry-Lane, Lumen", "Lumen Guidry-Lane");
    assert.ok(score >= 0.85);
  });
});

describe("findBestPersonMatch", () => {
  it("finds a person above threshold", () => {
    const persons = [stubPerson("p1", "Falynn Kagey")];
    const hit = findBestPersonMatch(persons, "Falynn Kagey");
    assert.ok(hit);
    assert.equal(hit!.person.id, "p1");
  });

  it("returns undefined when no similar person", () => {
    const persons = [stubPerson("p1", "Falynn Kagey")];
    assert.equal(findBestPersonMatch(persons, "Totally Different"), undefined);
  });
});
