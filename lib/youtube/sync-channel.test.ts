import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatGameCapMogoDisplayName,
  isGameCapMogoYouTubeVideo,
  parseGameCapMogoRecordedAt,
} from "@/lib/youtube/mogo-match";

describe("isGameCapMogoYouTubeVideo", () => {
  it("matches default MOGO file titles", () => {
    assert.equal(
      isGameCapMogoYouTubeVideo(
        "GameCapMOGO-2026-08-08T21-49-23.592Z-282e4e1.mov",
      ),
      true,
    );
  });

  it("matches Drive-style titles", () => {
    assert.equal(
      isGameCapMogoYouTubeVideo(
        "Main — GameCapMOGO-2026-08-08T21-49-23.592Z-282e4e1.mov",
      ),
      true,
    );
  });

  it("matches description tag", () => {
    assert.equal(
      isGameCapMogoYouTubeVideo(
        "Saturday scrimmage",
        "Uploaded from Game Cap MOGO (main).",
      ),
      true,
    );
  });

  it("rejects unrelated titles", () => {
    assert.equal(isGameCapMogoYouTubeVideo("My vacation"), false);
  });
});

describe("formatGameCapMogoDisplayName", () => {
  it("reads the recording stamp as a local date/time", () => {
    const at = parseGameCapMogoRecordedAt(
      "Main — GameCapMOGO-2026-08-08T21-49-23.592Z-282e4e1.mov",
    );
    assert.ok(at);
    assert.equal(at.toISOString(), "2026-08-08T21:49:23.592Z");

    const label = formatGameCapMogoDisplayName(
      "Main — GameCapMOGO-2026-08-08T21-49-23.592Z-282e4e1.mov",
      { timeZone: "UTC" },
    );
    assert.match(label, /^Main · /);
    assert.match(label, /Aug 8, 2026/);
    assert.match(label, /9:49\s*PM/i);
  });

  it("reads spaced MOGO stamps used as game / reel titles", () => {
    const at = parseGameCapMogoRecordedAt(
      "GameCapMOGO 2026 08 08T21 49 23 592Z 282ae4a1 highlights",
    );
    assert.ok(at);
    assert.equal(at.toISOString(), "2026-08-08T21:49:23.592Z");

    const label = formatGameCapMogoDisplayName(
      "GameCapMOGO 2026 08 08T21 49 23 592Z 282ae4a1 highlights",
      { timeZone: "UTC" },
    );
    assert.match(label, /Aug 8, 2026/);
    assert.match(label, /9:49\s*PM/i);
    assert.match(label, /highlights/i);
    assert.doesNotMatch(label, /GameCapMOGO/i);
    assert.doesNotMatch(label, /282ae4a1/i);
  });

  it("leaves non-MOGO titles alone", () => {
    assert.equal(
      formatGameCapMogoDisplayName("Saturday scrimmage"),
      "Saturday scrimmage",
    );
  });
});
