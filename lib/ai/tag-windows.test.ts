import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeTagWindowResults,
  planTagWindows,
  shiftDraftsToVideoTime,
} from "@/lib/ai/tag-windows";

describe("planTagWindows", () => {
  it("uses one window for short film", () => {
    const w = planTagWindows(35 * 60);
    assert.equal(w.length, 1);
    assert.equal(w[0]?.label, "full");
  });

  it("splits long film into overlapping halves", () => {
    const w = planTagWindows(70 * 60);
    assert.equal(w.length, 2);
    assert.ok((w[0]?.endSec ?? 0) > 30 * 60);
    assert.ok((w[1]?.startSec ?? 0) < 40 * 60);
    assert.ok((w[1]?.endSec ?? 0) >= 70 * 60);
  });
});

describe("shiftDraftsToVideoTime", () => {
  it("adds window start", () => {
    const out = shiftDraftsToVideoTime(
      [
        {
          tSec: 10,
          kind: "goal",
          label: "g",
          confidence: 0.9,
        },
      ],
      1800,
    );
    assert.equal(out[0]?.tSec, 1810);
  });
});

describe("mergeTagWindowResults", () => {
  it("dedupes near-duplicate kinds", () => {
    const merged = mergeTagWindowResults([
      {
        drafts: [
          { tSec: 100, kind: "goal", label: "a", confidence: 0.6 },
          { tSec: 200, kind: "shot", label: "s", confidence: 0.7 },
        ],
      },
      {
        drafts: [
          { tSec: 103, kind: "goal", label: "b", confidence: 0.9 },
          { tSec: 400, kind: "corner", label: "c", confidence: 0.8 },
        ],
      },
    ]);
    assert.equal(merged.drafts.length, 3);
    const goal = merged.drafts.find((d) => d.kind === "goal");
    assert.equal(goal?.confidence, 0.9);
    assert.equal(goal?.label, "b");
  });
});
