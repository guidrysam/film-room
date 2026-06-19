import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NON_EMBEDDABLE_YOUTUBE_MESSAGE,
  NON_YOUTUBE_LINK_MESSAGE,
  PUBLIC_META_DESCRIPTION,
} from "./public-copy";

describe("public-copy", () => {
  it("uses YouTube-first landing metadata", () => {
    assert.match(PUBLIC_META_DESCRIPTION, /YouTube/i);
    assert.doesNotMatch(PUBLIC_META_DESCRIPTION, /any video/i);
  });

  it("guides users toward YouTube links", () => {
    assert.match(NON_YOUTUBE_LINK_MESSAGE, /YouTube/i);
    assert.doesNotMatch(NON_YOUTUBE_LINK_MESSAGE, /Vimeo|Facebook/i);
  });

  it("explains non-embeddable YouTube videos with fallback guidance", () => {
    assert.match(NON_EMBEDDABLE_YOUTUBE_MESSAGE, /cannot be embedded/i);
    assert.match(NON_EMBEDDABLE_YOUTUBE_MESSAGE, /YouTube/i);
  });
});
