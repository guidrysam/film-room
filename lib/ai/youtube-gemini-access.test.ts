import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  geminiCanWatchYoutubePrivacy,
  youtubePrivacyBlockReason,
} from "@/lib/ai/youtube-gemini-access";

describe("youtube-gemini-access", () => {
  it("allows public and unknown; blocks unlisted/private", () => {
    assert.equal(geminiCanWatchYoutubePrivacy("public"), true);
    assert.equal(geminiCanWatchYoutubePrivacy(""), true);
    assert.equal(geminiCanWatchYoutubePrivacy("unlisted"), false);
    assert.equal(geminiCanWatchYoutubePrivacy("private"), false);
  });

  it("explains unlisted block", () => {
    const msg = youtubePrivacyBlockReason("unlisted", "End zone");
    assert.match(msg ?? "", /End zone/);
    assert.match(msg ?? "", /public/i);
  });
});
