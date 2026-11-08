import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  seasonHighlightSegmentsForDuration,
  seasonPlaysForDuration,
  seasonSegmentMarkLabel,
  SEASON_PLAY_CYCLE_SEC,
} from "./season-highlight-split";

describe("season highlight split", () => {
  it("keeps a short clip as one play with live + slow-mo", () => {
    const plays = seasonPlaysForDuration(40);
    assert.equal(plays.length, 1);
    assert.equal(plays[0]!.segments.length, 2);
    assert.equal(plays[0]!.segments[0]!.kind, "live");
    assert.equal(plays[0]!.segments[1]!.kind, "slomo");
  });

  it("breaks a long highlight VOD into multiple plays", () => {
    const duration = SEASON_PLAY_CYCLE_SEC * 4;
    const plays = seasonPlaysForDuration(duration);
    assert.equal(plays.length, 4);
    assert.equal(plays[0]!.startSec, 0);
    assert.equal(plays[3]!.endSec, duration);
    const segs = seasonHighlightSegmentsForDuration(duration);
    assert.equal(segs.length, 8);
    assert.equal(segs[0]!.playIndex, 1);
    assert.equal(segs[2]!.playIndex, 2);
  });

  it("keeps a single live segment when a play is too short to split", () => {
    const segs = seasonHighlightSegmentsForDuration(3);
    assert.equal(segs.length, 1);
    assert.equal(segs[0]!.kind, "live");
    assert.equal(segs[0]!.endSec, 3);
  });

  it("labels marks with clip, play, and segment", () => {
    const [live] = seasonHighlightSegmentsForDuration(60);
    assert.equal(
      seasonSegmentMarkLabel("CMFC vs Rangers", live!),
      "CMFC vs Rangers · Play 1 · Live",
    );
  });
});
