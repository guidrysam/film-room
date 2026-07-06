import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoomSeedFromSavedTemplate,
  isFacebookLessonTemplate,
  parseSavedClips,
  roomClipToSavedClip,
  savedClipToRoomClip,
} from "./saved-session-clips";

test("roomClipToSavedClip preserves Facebook fields", () => {
  const saved = roomClipToSavedClip({
    videoId: "1234567890",
    label: "Warmup",
    provider: "facebook",
    facebookVideoUrl: "https://www.facebook.com/watch?v=1234567890",
  });
  assert.equal(saved.provider, "facebook");
  assert.match(saved.facebookVideoUrl!, /1234567890/);
});

test("parseSavedClips reads provider from stored clips", () => {
  const clips = parseSavedClips([
    {
      videoId: "999",
      provider: "facebook",
      facebookVideoUrl: "https://www.facebook.com/watch?v=999",
    },
  ]);
  assert.equal(clips.length, 1);
  assert.equal(clips[0]!.provider, "facebook");
});

test("buildRoomSeedFromSavedTemplate seeds Facebook lesson rooms", () => {
  const seed = buildRoomSeedFromSavedTemplate({
    name: "Lesson 1",
    clips: [
      {
        videoId: "111",
        provider: "facebook",
        facebookVideoUrl: "https://www.facebook.com/watch?v=111",
        label: "Intro",
      },
    ],
    chapters: [{ time: 30, label: "Key point", videoId: "111" }],
    currentClipIndex: 0,
    ownerUserId: "coach",
    createdAt: null,
    updatedAt: null,
  });
  assert.equal(seed.videoProvider, "facebook");
  assert.equal((seed.clips as unknown[]).length, 1);
  assert.equal(seed.videoId, "111");
});

test("isFacebookLessonTemplate detects facebook clips", () => {
  assert.equal(
    isFacebookLessonTemplate({
      clips: [{ videoId: "1", provider: "facebook" }],
    }),
    true,
  );
  assert.equal(
    isFacebookLessonTemplate({
      clips: [{ videoId: "dQw4w9WgXcQ" }],
    }),
    false,
  );
});

test("savedClipToRoomClip round-trip", () => {
  const original = {
    videoId: "42",
    label: "Drill",
    provider: "facebook" as const,
    facebookVideoUrl: "https://www.facebook.com/watch?v=42",
  };
  assert.deepEqual(savedClipToRoomClip(roomClipToSavedClip(original)), original);
});
