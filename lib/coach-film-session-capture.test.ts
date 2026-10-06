import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCoachFilmSessionCaptureSupported } from "./coach-film-session-capture";

describe("coach film session capture", () => {
  it("reports unsupported in node (no mediaDevices)", () => {
    assert.equal(isCoachFilmSessionCaptureSupported(), false);
  });
});
