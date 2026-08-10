import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isHighlightAudioFile,
  normalizeHighlightSoundtrack,
  soundtrackLengthDelta,
} from "@/lib/highlight-soundtrack";

describe("isHighlightAudioFile", () => {
  it("accepts mp3 by type or extension", () => {
    assert.equal(
      isHighlightAudioFile({ name: "a.bin", type: "audio/mpeg" }),
      true,
    );
    assert.equal(
      isHighlightAudioFile({ name: "song.mp3", type: "" }),
      true,
    );
    assert.equal(
      isHighlightAudioFile({ name: "clip.mp4", type: "video/mp4" }),
      false,
    );
  });
});

describe("normalizeHighlightSoundtrack", () => {
  it("requires id, name, and positive duration", () => {
    assert.equal(normalizeHighlightSoundtrack(null), null);
    assert.deepEqual(
      normalizeHighlightSoundtrack({
        driveFileId: "file1",
        name: "Song.mp3",
        durationSec: 184.2,
        mimeType: "audio/mpeg",
      }),
      {
        driveFileId: "file1",
        name: "Song.mp3",
        durationSec: 184.2,
        mimeType: "audio/mpeg",
      },
    );
  });
});

describe("soundtrackLengthDelta", () => {
  it("classifies short / fit / long", () => {
    assert.equal(soundtrackLengthDelta(40, 60).status, "short");
    assert.equal(soundtrackLengthDelta(60.5, 60).status, "fit");
    assert.equal(soundtrackLengthDelta(90, 60).status, "long");
  });
});
