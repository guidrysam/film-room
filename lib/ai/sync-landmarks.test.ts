import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickSecondHalfStart,
  planSyncLandmarks,
} from "@/lib/ai/sync-landmarks";
import type { AiTagDraft } from "@/lib/ai/tag-schema";

function draft(
  partial: Pick<AiTagDraft, "kind" | "tSec"> &
    Partial<Omit<AiTagDraft, "kind" | "tSec">>,
): AiTagDraft {
  return {
    label: partial.label ?? partial.kind,
    confidence: partial.confidence ?? 0.8,
    ...partial,
  };
}

describe("pickSecondHalfStart", () => {
  it("prefers half_start after half_end", () => {
    const landmarks = [
      draft({ kind: "half_start", tSec: 10, label: "1H restart mis-tag" }),
      draft({ kind: "half_end", tSec: 2400 }),
      draft({ kind: "half_start", tSec: 2520, label: "2H" }),
    ];
    const picked = pickSecondHalfStart(landmarks);
    assert.equal(picked?.tSec, 2520);
  });

  it("falls back to latest half_start without half_end", () => {
    const landmarks = [
      draft({ kind: "half_start", tSec: 100 }),
      draft({ kind: "half_start", tSec: 2600 }),
    ];
    assert.equal(pickSecondHalfStart(landmarks)?.tSec, 2600);
  });
});

describe("planSyncLandmarks", () => {
  it("prefers kickoff when confident and still offers half_start fallback", () => {
    const plan = planSyncLandmarks([
      draft({ kind: "kickoff", tSec: 90, confidence: 0.9 }),
      draft({ kind: "half_end", tSec: 2400 }),
      draft({ kind: "half_start", tSec: 2520, confidence: 0.85 }),
      draft({ kind: "goal", tSec: 1200, label: "goal" }),
    ]);
    assert.equal(plan.preferredAnchor, "kickoff");
    assert.match(plan.guidance, /FALLBACK/i);
    assert.match(plan.guidance, /2520/);
    assert.ok(plan.landmarks.some((d) => d.kind === "half_start"));
  });

  it("falls back to half_start when kickoff is weak", () => {
    const plan = planSyncLandmarks([
      draft({
        kind: "kickoff",
        tSec: 90,
        confidence: 0.3,
        lowEvidence: true,
      }),
      draft({ kind: "half_end", tSec: 2400 }),
      draft({ kind: "half_start", tSec: 2520, confidence: 0.9 }),
    ]);
    assert.equal(plan.preferredAnchor, "half_start");
    assert.match(plan.guidance, /half_start @ 2520/);
  });

  it("falls back to goal when structure is missing", () => {
    const plan = planSyncLandmarks([
      draft({ kind: "goal", tSec: 800, confidence: 0.95, label: "goal" }),
    ]);
    assert.equal(plan.preferredAnchor, "goal");
  });

  it("uses tipoff and period_start for basketball landmarks", () => {
    const plan = planSyncLandmarks([
      draft({ kind: "tipoff", tSec: 80, confidence: 0.9 }),
      draft({ kind: "period_end", tSec: 1200, confidence: 0.8 }),
      draft({ kind: "period_start", tSec: 1260, confidence: 0.85 }),
      draft({ kind: "field_goal", tSec: 400, confidence: 0.9, label: "bucket" }),
    ]);
    assert.equal(plan.preferredAnchor, "kickoff");
    assert.match(plan.guidance, /tipoff @ 80/);
    assert.match(plan.guidance, /period_start/);
  });
});
