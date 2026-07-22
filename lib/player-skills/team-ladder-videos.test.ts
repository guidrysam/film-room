import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  firstAvailableSuggestion,
  resolveLevelTeachingVideo,
  type TeamLadderLevelEntry,
} from "./team-ladder-videos";

const suggestions = [
  { videoId: "aaa11111111", title: "First drill" },
  { videoId: "bbb22222222", title: "Second drill" },
];

describe("resolveLevelTeachingVideo", () => {
  it("prefers the coach-selected video", () => {
    const entry: TeamLadderLevelEntry = {
      videoId: "bbb22222222",
      videoTitle: "Coach pick",
      suggestions,
      discardedSuggestionIds: [],
    };
    assert.deepEqual(resolveLevelTeachingVideo(entry), {
      videoId: "bbb22222222",
      videoTitle: "Coach pick",
    });
  });

  it("falls back to the first non-discarded suggestion", () => {
    const entry: TeamLadderLevelEntry = {
      suggestions,
      discardedSuggestionIds: ["aaa11111111"],
    };
    assert.deepEqual(resolveLevelTeachingVideo(entry), {
      videoId: "bbb22222222",
      videoTitle: "Second drill",
    });
  });

  it("returns null when nothing is available", () => {
    assert.equal(resolveLevelTeachingVideo(undefined), null);
    assert.equal(
      resolveLevelTeachingVideo({
        suggestions: [],
        discardedSuggestionIds: [],
      }),
      null,
    );
  });
});

describe("firstAvailableSuggestion", () => {
  it("skips discarded ids", () => {
    const entry: TeamLadderLevelEntry = {
      suggestions,
      discardedSuggestionIds: ["aaa11111111"],
    };
    assert.equal(firstAvailableSuggestion(entry)?.videoId, "bbb22222222");
  });
});
