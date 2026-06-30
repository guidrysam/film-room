import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractYouTubeVideoId } from "./youtube-id";

describe("extractYouTubeVideoId", () => {
  it("parses watch URLs", () => {
    assert.equal(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      "dQw4w9WgXcQ",
    );
  });

  it("parses mobile attribution_link wrappers", () => {
    assert.equal(
      extractYouTubeVideoId(
        "https://www.youtube.com/attribution_link?a=foo&u=%2Fwatch%3Fv%3DdQw4w9WgXcQ",
      ),
      "dQw4w9WgXcQ",
    );
  });

  it("parses youtube-nocookie embed URLs", () => {
    assert.equal(
      extractYouTubeVideoId(
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      ),
      "dQw4w9WgXcQ",
    );
  });

  it("returns null for channel live entry points", () => {
    assert.equal(
      extractYouTubeVideoId("https://www.youtube.com/channel/UC123/live"),
      null,
    );
  });
});
