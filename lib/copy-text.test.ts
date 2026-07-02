import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { copyTextToClipboard } from "./copy-text";

describe("copyTextToClipboard", () => {
  it("returns false for empty text", async () => {
    assert.equal(await copyTextToClipboard(""), false);
    assert.equal(await copyTextToClipboard("   "), false);
  });
});
