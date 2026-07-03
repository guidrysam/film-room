import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveLogoFile } from "./team-logo";

describe("resolveLogoFile", () => {
  it("uses file extension when MIME type is missing", () => {
    assert.deepEqual(resolveLogoFile({ name: "crest.png", type: "" }), {
      contentType: "image/png",
      ext: "png",
    });
    assert.deepEqual(resolveLogoFile({ name: "photo.JPG", type: "" }), {
      contentType: "image/jpeg",
      ext: "jpg",
    });
  });

  it("accepts standard image MIME types", () => {
    assert.equal(resolveLogoFile({ name: "x", type: "image/webp" }).ext, "webp");
  });
});
