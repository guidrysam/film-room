import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REEL_SPONSORS,
  normalizeHighlightSponsors,
} from "@/lib/highlight-sponsors";
import { sponsorInterstitialForCut } from "@/lib/highlight-reel-cards";

describe("normalizeHighlightSponsors", () => {
  it("keeps data-url logos and caps count", () => {
    const many = Array.from({ length: MAX_REEL_SPONSORS + 3 }, (_, i) => ({
      id: `sp_${i}`,
      logoUrl: `data:image/jpeg;base64,abc${i}`,
      name: `Sponsor ${i}`,
    }));
    const out = normalizeHighlightSponsors(many);
    assert.equal(out.length, MAX_REEL_SPONSORS);
    assert.equal(out[0]?.name, "Sponsor 0");
  });

  it("drops non-image urls", () => {
    assert.deepEqual(
      normalizeHighlightSponsors([
        { id: "1", logoUrl: "https://example.com/x.png" },
        { id: "2", logoUrl: "data:image/png;base64,xx" },
      ]),
      [{ id: "2", logoUrl: "data:image/png;base64,xx" }],
    );
  });
});

describe("sponsorInterstitialForCut", () => {
  it("cycles logos across cuts", () => {
    const sponsors = [
      { logoUrl: "data:image/png;base64,a", name: "A" },
      { logoUrl: "data:image/png;base64,b", name: "B" },
    ];
    const first = sponsorInterstitialForCut(sponsors, 0);
    const second = sponsorInterstitialForCut(sponsors, 1);
    const third = sponsorInterstitialForCut(sponsors, 2);
    assert.equal(first?.kind, "thanks");
    assert.equal(first?.logos[0]?.name, "A");
    assert.equal(second?.logos[0]?.name, "B");
    assert.equal(third?.logos[0]?.name, "A");
  });
});
