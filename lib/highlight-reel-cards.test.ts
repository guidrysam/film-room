import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReelStatCard,
  buildReelTitleCard,
} from "./highlight-reel-cards";
import type { Game } from "./games";

const game: Game = {
  id: "g1",
  title: "CMFC Girls 12U vs Beach Bash",
  date: "2026-07-01",
  opponent: "Beach Bash",
  homeTeam: "CMFC Girls 12U",
  location: "Grand Rapids",
  ownerId: "u1",
  contributors: { u1: "owner" },
  memberUids: ["u1"],
  visibility: "private",
  createdAt: null,
  updatedAt: null,
};

describe("buildReelTitleCard", () => {
  it("uses reel name and team logo when provided", () => {
    const card = buildReelTitleCard(game, {
      name: "CMFC Girls 12U",
      logoUrl: "https://example.com/logo.png",
    }, "Summer highlights");
    assert.equal(card.headline, "Summer highlights");
    assert.match(card.subtitle ?? "", /Jul/);
    assert.equal(card.logoUrl, "https://example.com/logo.png");
  });
});

describe("buildReelStatCard", () => {
  it("splits goal and assist lines", () => {
    const card = buildReelStatCard({
      label: "Goal + Assist",
      playerOverlay: "Goal — Alex Smith · Assist — Jordan Lee",
    });
    assert.equal(card?.headline, "Goal + Assist");
    assert.deepEqual(card?.lines, ["Goal — Alex Smith", "Assist — Jordan Lee"]);
  });
});
