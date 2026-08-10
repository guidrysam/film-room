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

  it("prefers club logo in auto mode", () => {
    const card = buildReelTitleCard(
      game,
      { name: "Team", logoUrl: "https://example.com/team.png" },
      "Highlights",
      {
        club: { name: "Club", logoUrl: "https://example.com/club.png" },
        logoSource: "auto",
      },
    );
    assert.equal(card.logoUrl, "https://example.com/club.png");
  });

  it("can force team logo when both exist", () => {
    const card = buildReelTitleCard(
      game,
      { name: "Team", logoUrl: "https://example.com/team.png" },
      "Highlights",
      {
        club: { name: "Club", logoUrl: "https://example.com/club.png" },
        logoSource: "team",
      },
    );
    assert.equal(card.logoUrl, "https://example.com/team.png");
  });

  it("uses a custom logo picked from another club", () => {
    const card = buildReelTitleCard(
      game,
      { name: "Team", logoUrl: "https://example.com/team.png" },
      "Highlights",
      {
        club: { name: "Club", logoUrl: "https://example.com/club.png" },
        logoSource: "custom",
        customLogoUrl: "https://example.com/other-club.png",
      },
    );
    assert.equal(card.logoUrl, "https://example.com/other-club.png");
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
