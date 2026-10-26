import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FilmSource } from "./film-sources";
import {
  filterFilmSources,
  filmSourceDateMs,
  isFilmKnownLongerThan,
  isFilmReviewed,
  isFilmUnderTenMinutes,
  localDateInputEndMs,
  localDateInputStartMs,
  matchesLengthFilter,
} from "./film-source-filters";

function stub(overrides: Partial<FilmSource> = {}): FilmSource {
  return {
    id: "s1",
    ownerUid: "u1",
    label: "CMFC v Beach Highlights",
    organizeKind: "game",
    status: "ready",
    kind: "youtube",
    createdAt: null,
    ...overrides,
  };
}

describe("film source filters", () => {
  it("treats reviewGameId as reviewed", () => {
    assert.equal(isFilmReviewed(stub()), false);
    assert.equal(isFilmReviewed(stub({ reviewGameId: "g1" })), true);
  });

  it("uses duration for under-10-min", () => {
    assert.equal(isFilmUnderTenMinutes(stub({ durationSec: 540 })), true);
    assert.equal(isFilmUnderTenMinutes(stub({ durationSec: 1200 })), false);
    assert.equal(isFilmKnownLongerThan(stub({ durationSec: 1200 })), true);
    // Older imports without duration stay visible in the under-10 filter.
    assert.equal(matchesLengthFilter(stub({}), "under10"), true);
    assert.equal(
      matchesLengthFilter(stub({ durationSec: 5400 }), "under10"),
      false,
    );
  });

  it("parses local date bounds", () => {
    const start = localDateInputStartMs("2026-06-01");
    const end = localDateInputEndMs("2026-06-01");
    assert.ok(start != null && end != null);
    assert.ok(end > start!);
  });

  it("filters by query, review, length, and date", () => {
    const rows = [
      stub({
        id: "a",
        label: "Tripod short",
        durationSec: 300,
        publishedAt: "2026-06-15T18:00:00.000Z",
      }),
      stub({
        id: "b",
        label: "Full game",
        durationSec: 5400,
        reviewGameId: "g1",
        publishedAt: "2026-07-01T18:00:00.000Z",
      }),
      stub({
        id: "c",
        label: "Old highlight",
        filmKind: "highlight",
        publishedAt: "2026-05-01T18:00:00.000Z",
      }),
    ];

    const shortUnreviewed = filterFilmSources(rows, {
      length: "under10",
      review: "unreviewed",
    });
    // Known-long "b" is reviewed anyway; unreviewed short/unknown = a + c
    assert.deepEqual(
      shortUnreviewed.map((r) => r.id).sort(),
      ["a", "c"],
    );
    const under10All = filterFilmSources(rows, { length: "under10" });
    assert.deepEqual(
      under10All.map((r) => r.id).sort(),
      ["a", "c"],
    );

    const june = filterFilmSources(rows, {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
    });
    assert.deepEqual(
      june.map((r) => r.id),
      ["a"],
    );

    const searched = filterFilmSources(rows, { query: "full" });
    assert.deepEqual(
      searched.map((r) => r.id),
      ["b"],
    );

    assert.ok(filmSourceDateMs(rows[0]!) != null);
  });
});
