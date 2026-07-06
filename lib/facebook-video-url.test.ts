import assert from "node:assert/strict";
import test from "node:test";
import { extractFacebookVideoRef, isFacebookVideoKey } from "./facebook-video-url";

test("extractFacebookVideoRef parses watch?v=", () => {
  const ref = extractFacebookVideoRef(
    "https://www.facebook.com/watch?v=3081111611928745",
  );
  assert.ok(ref);
  assert.equal(ref!.videoKey, "3081111611928745");
  assert.match(ref!.href, /watch\?v=3081111611928745/);
});

test("extractFacebookVideoRef parses /videos/ path", () => {
  const ref = extractFacebookVideoRef(
    "https://www.facebook.com/jimcel.longos/videos/3081111611928745/",
  );
  assert.ok(ref);
  assert.equal(ref!.videoKey, "3081111611928745");
  assert.match(ref!.href, /\/videos\/3081111611928745/);
});

test("extractFacebookVideoRef parses reel URLs", () => {
  const ref = extractFacebookVideoRef(
    "https://www.facebook.com/reel/1234567890123456",
  );
  assert.ok(ref);
  assert.equal(ref!.videoKey, "1234567890123456");
});

test("extractFacebookVideoRef rejects YouTube URLs", () => {
  assert.equal(
    extractFacebookVideoRef("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    null,
  );
});

test("isFacebookVideoKey distinguishes providers", () => {
  assert.equal(isFacebookVideoKey("3081111611928745"), true);
  assert.equal(isFacebookVideoKey("dQw4w9WgXcQ"), false);
});
