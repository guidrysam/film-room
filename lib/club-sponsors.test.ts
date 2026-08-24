import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clubSponsorToReelSponsor } from "./club-sponsors";

describe("clubSponsorToReelSponsor", () => {
  it("copies logo and name onto a new reel sponsor id", () => {
    const reel = clubSponsorToReelSponsor({
      logoUrl: "data:image/png;base64,abc",
      name: "Acme",
    });
    assert.equal(reel.logoUrl, "data:image/png;base64,abc");
    assert.equal(reel.name, "Acme");
    assert.match(reel.id, /^sp_/);
  });
});
