import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  seasonHighlightSegmentsForDuration,
  seasonSegmentMarkLabel,
  SEASON_HIGHLIGHT_LIVE_RATIO,
} from "./season-highlight-split";

describe("season highlight split", () => {
  it("splits a typical highlight at the live ratio", () => {
    const segs = seasonHighlightSegmentsForDuration(100);
    assert.equal(segs.length, 2);
    assert.equal(segs[0]!.kind, "live");
    assert.equal(segs[0]!.startSec, 0);
    assert.equal(segs[0]!.endSec, 100 * SEASON_HIGHLIGHT_LIVE_RATIO);
    assert.equal(segs[1]!.kind, "slomo");
    assert.equal(segs[1]!.startSec, segs[0]!.endSec);
    assert.equal(segs[1]!.endSec, 100);
  });

  it("keeps a single live segment when too short to split", () => {
    const segs = seasonHighlightSegmentsForDuration(3);
    assert.equal(segs.length, 1);
    assert.equal(segs[0]!.kind, "live");
    assert.equal(segs[0]!.endSec, 3);
  });

  it("labels marks with clip + segment", () => {
    const [live] = seasonHighlightSegmentsForDuration(60);
    assert.equal(
      seasonSegmentMarkLabel("CMFC vs Rangers", live!),
      "CMFC vs Rangers · Live",
    );
  });
});
