import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mediaStemsMatch,
  normalizeMediaStem,
} from "@/lib/drive/sidecar-stem";

describe("normalizeMediaStem", () => {
  it("strips Main prefix, extension, and case", () => {
    assert.equal(
      normalizeMediaStem(
        "Main — GameCapMOGO-2026-08-08T21-49-23.592Z-282e4e1.mov",
      ),
      "gamecapmogo-2026-08-08t21-49-23.592z-282e4e1",
    );
  });

  it("matches YouTube title to vault JSON", () => {
    assert.ok(
      mediaStemsMatch(
        "GameCapMOGO-2026-08-08T21-49-23.592Z-282e4e1.mov",
        "Main — GameCapMOGO-2026-08-08T21-49-23.592Z-282e4e1.json",
      ),
    );
  });

  it("matches space vs hyphen variants via compact form", () => {
    assert.ok(
      mediaStemsMatch(
        "GameCapMOGO 2026 08 08T20 37 52 925Z 5440d59e",
        "GameCapMOGO-2026-08-08T20-37-52-925Z-5440d59e.json",
      ),
    );
  });
});
