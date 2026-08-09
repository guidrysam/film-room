import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isGameCapMogoYouTubeVideo } from "@/lib/youtube/mogo-match";

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
