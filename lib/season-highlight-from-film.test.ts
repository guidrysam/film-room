import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filmSourceToSeasonClip,
  momentInputsForSeasonClip,
  seasonClipDurationSec,
  seasonHighlightChapterSeeds,
  SEASON_CLIP_DEFAULT_DURATION_SEC,
} from "./season-highlight-from-film";
import type { FilmSource } from "./film-sources";

function stub(overrides: Partial<FilmSource> = {}): FilmSource {
  return {
    id: "fs1",
    ownerUid: "u1",
    label: "CMFC v Beach Highlights",
    organizeKind: "game",
    status: "ready",
    kind: "youtube",
    youtubeVideoId: "abcdefghijk",
    durationSec: 180,
    createdAt: null,
    ...overrides,
  };
}

describe("season highlight from film", () => {
  it("maps a YouTube film source to a season clip", () => {
    const clip = filmSourceToSeasonClip(stub());
    assert.ok(clip);
    assert.equal(clip.youtubeVideoId, "abcdefghijk");
    assert.equal(clip.durationSec, 180);
  });

  it("rejects sources without a YouTube id", () => {
    assert.equal(
      filmSourceToSeasonClip(stub({ youtubeVideoId: "", videoId: "" })),
      null,
    );
  });

  it("builds live + slow-mo reel moments at 1x", () => {
    const clip = filmSourceToSeasonClip(stub())!;
    const moments = momentInputsForSeasonClip("src1", clip);
    assert.equal(moments.length, 2);
    assert.equal(moments[0]!.activeSourceId, "src1");
    assert.equal(moments[0]!.startOffsetSec, 0);
    assert.equal(moments[0]!.endOffsetSec, 90);
    assert.equal(moments[0]!.speed, 1);
    assert.match(moments[0]!.label ?? "", /Live/);
    assert.equal(moments[1]!.startOffsetSec, 90);
    assert.equal(moments[1]!.endOffsetSec, 180);
    assert.equal(moments[1]!.speed, 1);
    assert.match(moments[1]!.label ?? "", /Slow-mo/);
  });

  it("falls back when duration is missing", () => {
    assert.equal(
      seasonClipDurationSec({
        id: "x",
        label: "Clip",
        youtubeVideoId: "abcdefghijk",
      }),
      SEASON_CLIP_DEFAULT_DURATION_SEC,
    );
  });

  it("seeds Film Room chapters per clip segment", () => {
    const chapters = seasonHighlightChapterSeeds([
      {
        id: "a",
        label: "Clip A",
        youtubeVideoId: "abcdefghijk",
        durationSec: 100,
      },
    ]);
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0]!.videoId, "abcdefghijk");
    assert.equal(chapters[0]!.time, 0);
    assert.equal(chapters[1]!.time, 50);
  });
});
