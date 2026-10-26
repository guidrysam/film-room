import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filmSourceToSeasonClip,
  momentInputForSeasonClip,
  seasonClipDurationSec,
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

  it("builds a full-clip reel moment", () => {
    const clip = filmSourceToSeasonClip(stub())!;
    const moment = momentInputForSeasonClip("src1", clip);
    assert.equal(moment.activeSourceId, "src1");
    assert.equal(moment.gameTime, 0);
    assert.equal(moment.startOffsetSec, 0);
    assert.equal(moment.endOffsetSec, 180);
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
});
