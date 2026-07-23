import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_AI_TAG_MODEL,
  resolveAiModelId,
} from "@/lib/ai/google-model";

describe("resolveAiModelId", () => {
  it("keeps current flash ids", () => {
    assert.equal(resolveAiModelId("gemini-3.5-flash"), "gemini-3.5-flash");
    assert.equal(resolveAiModelId("gemini-3.6-flash"), "gemini-3.6-flash");
    assert.equal(resolveAiModelId(null), DEFAULT_AI_TAG_MODEL);
    assert.equal(DEFAULT_AI_TAG_MODEL, "gemini-3.6-flash");
  });

  it("upgrades retired and new-user-blocked ids", () => {
    assert.equal(resolveAiModelId("gemini-1.5-flash"), DEFAULT_AI_TAG_MODEL);
    assert.equal(
      resolveAiModelId("models/gemini-1.5-flash"),
      DEFAULT_AI_TAG_MODEL,
    );
    assert.equal(resolveAiModelId("gemini-2.5-flash"), DEFAULT_AI_TAG_MODEL);
    assert.equal(resolveAiModelId("gemini-2.0-flash"), DEFAULT_AI_TAG_MODEL);
  });
});
