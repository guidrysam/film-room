import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gameTitleFromStreamMeta,
  opponentFromGameTitle,
  parseYouTubeStreamLines,
} from "./team-game-from-video";

describe("team-game-from-video", () => {
  it("parses one YouTube URL per line and dedupes", () => {
    const lines = parseYouTubeStreamLines(`
      https://www.youtube.com/watch?v=dQw4w9WgXcQ
      https://youtu.be/dQw4w9WgXcQ
      https://www.youtube.com/watch?v=abc12345678
    `);
    assert.equal(lines.length, 2);
  });

  it("prefers explicit title over YouTube title", () => {
    assert.equal(
      gameTitleFromStreamMeta({ videoId: "x", title: "YouTube name" }, "Custom"),
      "Custom",
    );
  });

  it("parses opponent from vs titles when team name matches", () => {
    assert.equal(
      opponentFromGameTitle("CMFC vs Champion", "CMFC SAND 12u Girls"),
      "Champion",
    );
  });
});
