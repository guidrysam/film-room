import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filmSourceToSeasonClip,
  momentInputsForSeasonClip,
  seasonClipDurationSec,
  seasonHighlightChapterSeeds,
  SEASON_CLIP_DEFAULT_DURATION_SEC,
} from "./season-highlight-from-film";
import { SEASON_PLAY_CYCLE_SEC } from "./season-highlight-split";
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

  it("builds play live + slow-mo reel moments at 1x on a virtual timeline", () => {
    const clip = filmSourceToSeasonClip(
      stub({ durationSec: SEASON_PLAY_CYCLE_SEC * 2 }),
    )!;
    const cursor = 100;
    const moments = momentInputsForSeasonClip("src1", clip, cursor);
    // 2 plays × 2 segments
    assert.equal(moments.length, 4);
    assert.equal(moments[0]!.gameTime, cursor);
    assert.equal(moments[0]!.startOffsetSec, 0);
    assert.equal(moments[0]!.speed, 1);
    assert.match(moments[0]!.label ?? "", /Play 1 · Live/);
    assert.match(moments[2]!.label ?? "", /Play 2 · Live/);
    assert.ok((moments[2]!.gameTime ?? 0) > cursor);
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

  it("seeds Film Room chapters per play segment", () => {
    const chapters = seasonHighlightChapterSeeds([
      {
        id: "a",
        label: "Clip A",
        youtubeVideoId: "abcdefghijk",
        durationSec: SEASON_PLAY_CYCLE_SEC * 2,
      },
    ]);
    assert.equal(chapters.length, 4);
    assert.equal(chapters[0]!.videoId, "abcdefghijk");
    assert.equal(chapters[0]!.time, 0);
    assert.match(chapters[0]!.label, /Play 1 · Live/);
  });
});
