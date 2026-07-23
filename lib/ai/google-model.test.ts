import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_AI_TAG_MODEL,
  resolveAiModelId,
} from "@/lib/ai/google-model";

describe("resolveAiModelId", () => {
  it("keeps current flash ids", () => {
    assert.equal(resolveAiModelId("gemini-2.5-flash"), "gemini-2.5-flash");
    assert.equal(resolveAiModelId(null), DEFAULT_AI_TAG_MODEL);
  });

  it("upgrades retired 1.x ids", () => {
    assert.equal(resolveAiModelId("gemini-1.5-flash"), DEFAULT_AI_TAG_MODEL);
    assert.equal(
      resolveAiModelId("models/gemini-1.5-flash"),
      DEFAULT_AI_TAG_MODEL,
    );
  });
});
