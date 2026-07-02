import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ReelStep } from "./highlight-draft";
import {
  HIGHLIGHT_REEL_SHARE_SCHEMA,
  buildHighlightReelSharePayload,
  highlightReelWatchPath,
  highlightReelWatchUrl,
  parseHighlightReelSharePayload,
} from "./highlight-reel-share";

const sampleStep: ReelStep = {
  momentId: "hm_1",
  sourceId: "src_a",
  sourceStartTime: 10,
  sourceEndTime: 20,
  speed: 1,
  repeat: 1,
};

describe("highlight-reel-share", () => {
  it("builds a share payload from game sources and preview steps", () => {
    const payload = buildHighlightReelSharePayload({
      reelName: "Goals",
      game: {
        id: "g1",
        title: "vs Rivals",
        ownerId: "u1",
        contributors: { u1: "owner" },
        memberUids: ["u1"],
        visibility: "private",
        createdAt: null,
        updatedAt: null,
      },
      team: { name: "Tigers", logoUrl: "https://example.com/logo.png" },
      previewSteps: [sampleStep],
      sources: [
        {
          id: "src_a",
          kind: "youtube",
          label: "Wide",
          videoId: "dQw4w9WgXcQ",
          offsetFromGameTime: 0,
        },
      ],
    });
    assert.equal(payload.schema, HIGHLIGHT_REEL_SHARE_SCHEMA);
    assert.equal(payload.reelName, "Goals");
    assert.equal(payload.sources[0]?.videoId, "dQw4w9WgXcQ");
    assert.equal(payload.steps.length, 1);
    assert.equal(parseHighlightReelSharePayload(payload)?.reelName, "Goals");
  });

  it("formats public watch URLs", () => {
    const id = "abc-123";
    assert.equal(highlightReelWatchPath(id), "/reel/abc-123");
    assert.equal(
      highlightReelWatchUrl(id, "https://film.example.com"),
      "https://film.example.com/reel/abc-123",
    );
  });
});
