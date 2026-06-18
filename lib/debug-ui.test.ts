import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDebugUiEnabled } from "./debug-ui";

describe("debug-ui", () => {
  it("isDebugUiEnabled respects query param", () => {
    assert.equal(isDebugUiEnabled("1"), true);
    assert.equal(isDebugUiEnabled("true"), true);
    assert.equal(isDebugUiEnabled("0"), process.env.NODE_ENV === "development");
    assert.equal(isDebugUiEnabled(null), process.env.NODE_ENV === "development");
  });
});
