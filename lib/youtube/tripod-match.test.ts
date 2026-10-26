import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyGameCapChannelUpload,
  isGameCapChannelYouTubeVideo,
} from "@/lib/youtube/channel-match";
import {
  formatGameCapTripodDisplayName,
  isGameCapTripodYouTubeVideo,
  isNormalizedGameCapMatchTitle,
  looksLikeHighlightReelTitle,
  parseGameCapTripodRecordedAt,
} from "@/lib/youtube/tripod-match";

describe("isGameCapTripodYouTubeVideo", () => {
  it("matches tripod in the description", () => {
    assert.equal(
      isGameCapTripodYouTubeVideo(
        "CMFC Sand 12U v Beach Bash",
        "Recorded on Game Cap Tripod\nAngle: Main",
      ),
      true,
    );
    assert.equal(
      isGameCapTripodYouTubeVideo("Saturday game", "Uploaded with tripod mount."),
      true,
    );
  });

  it("matches GameCapTripod code titles", () => {
    assert.equal(
      isGameCapTripodYouTubeVideo(
        "GameCapTripod-2026-08-08T21-49-23.592Z-abc123.mov",
      ),
      true,
    );
  });

  it("matches normalized v titles when Game Cap is mentioned", () => {
    assert.equal(
      isGameCapTripodYouTubeVideo(
        "Falcons v Eagles",
        "Uploaded via Film Room Game Cap",
      ),
      true,
    );
    assert.equal(isNormalizedGameCapMatchTitle("Falcons v Eagles"), true);
    assert.equal(isNormalizedGameCapMatchTitle("Falcons vs Eagles"), true);
  });

  it("rejects unrelated titles without tripod signal", () => {
    assert.equal(isGameCapTripodYouTubeVideo("My vacation v2"), false);
    assert.equal(isGameCapTripodYouTubeVideo("Random sports clip"), false);
  });
});

describe("formatGameCapTripodDisplayName", () => {
  it("formats Tripod stamps", () => {
    const at = parseGameCapTripodRecordedAt(
      "GameCapTripod-2026-08-08T21-49-23.592Z-abc123 highlights",
    );
    assert.ok(at);
    assert.equal(at.toISOString(), "2026-08-08T21:49:23.592Z");
    const label = formatGameCapTripodDisplayName(
      "GameCapTripod-2026-08-08T21-49-23.592Z-abc123 highlights",
      { timeZone: "UTC" },
    );
    assert.match(label, /Aug 8, 2026/);
    assert.match(label, /highlights/i);
    assert.doesNotMatch(label, /GameCapTripod/i);
  });
});

describe("channel match + highlights", () => {
  it("unifies MOGO and Tripod", () => {
    assert.equal(
      isGameCapChannelYouTubeVideo("GameCapMOGO-2026-08-08T21-49-23.592Z-x"),
      true,
    );
    assert.equal(
      isGameCapChannelYouTubeVideo("Match film", "tripod sideline"),
      true,
    );
  });

  it("flags highlight-titled Tripod uploads", () => {
    assert.equal(
      looksLikeHighlightReelTitle("CMFC v Beach · Highlights"),
      true,
    );
    const hit = classifyGameCapChannelUpload(
      "CMFC Sand v Beach Highlights",
      "Recorded on tripod",
    );
    assert.ok(hit);
    assert.equal(hit.device, "tripod");
    assert.equal(hit.isHighlight, true);
  });
});
