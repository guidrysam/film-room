import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_USER_PRIVACY_SETTINGS,
  expiresAtFromDays,
  formatExpiresDaysLabel,
  parseUserPrivacySettings,
} from "./user-privacy-settings";

describe("user-privacy-settings", () => {
  it("returns defaults for missing data", () => {
    const parsed = parseUserPrivacySettings(undefined);
    assert.equal(parsed.defaultGameVisibility, "private");
    assert.equal(parsed.teamInviteExpiresDays, 30);
    assert.equal(parsed.reelShareExpiresDays, 7);
    assert.equal(parsed.confirmBeforeReelShare, true);
  });

  it("clamps invite expiry days", () => {
    const parsed = parseUserPrivacySettings({
      teamInviteExpiresDays: 999,
      gameInviteExpiresDays: -5,
    });
    assert.equal(parsed.teamInviteExpiresDays, 365);
    assert.equal(parsed.gameInviteExpiresDays, 0);
  });

  it("computes expiry timestamps from days", () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    assert.equal(expiresAtFromDays(0, now), null);
    assert.equal(
      expiresAtFromDays(7, now),
      now + 7 * 86_400_000,
    );
  });

  it("formats expiry labels", () => {
    assert.equal(formatExpiresDaysLabel(7), "1 week");
    assert.equal(formatExpiresDaysLabel(0), "Never expires");
  });

  it("keeps youtube upload privacy unlisted", () => {
    assert.equal(
      DEFAULT_USER_PRIVACY_SETTINGS.youtubeUploadPrivacy,
      "unlisted",
    );
  });
});
