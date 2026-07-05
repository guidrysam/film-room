import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  diagnoseFromGameSource,
  diagnoseFromYouTubeMeta,
  diagnosePasteInput,
  playbackIssueBadgeLabel,
} from "./youtube-playback-issue";
import type { GameVideoSource } from "./games";

describe("youtube-playback-issue", () => {
  it("flags private videos", () => {
    const d = diagnoseFromYouTubeMeta({
      videoId: "abc12345678",
      privacyStatus: "private",
      embeddable: true,
    });
    assert.equal(d.code, "private_video");
    assert.equal(d.severity, "error");
    assert.match(d.headline, /Private/i);
  });

  it("flags non-embeddable VOD with auto-fix", () => {
    const d = diagnoseFromYouTubeMeta({
      videoId: "abc12345678",
      privacyStatus: "unlisted",
      embeddable: false,
      uploadStatus: "processed",
      durationSec: 120,
    });
    assert.equal(d.code, "not_embeddable");
    assert.equal(d.canAutoFix, true);
  });

  it("escalates steps after auto-fix failure", () => {
    const d = diagnoseFromYouTubeMeta(
      {
        videoId: "abc12345678",
        privacyStatus: "unlisted",
        embeddable: false,
        uploadStatus: "processed",
        durationSec: 120,
      },
      { autoFixFailed: true },
    );
    assert.match(d.detail ?? "", /channel/i);
    assert.match(d.steps.join(" "), /Channel/i);
  });

  it("detects live embed disabled", () => {
    const d = diagnoseFromYouTubeMeta({
      videoId: "abc12345678",
      privacyStatus: "unlisted",
      embeddable: false,
      isLive: true,
      streamPhase: "active",
    });
    assert.equal(d.code, "live_embed_disabled");
  });

  it("diagnoses paste input without meta as not found", () => {
    const d = diagnosePasteInput(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      null,
    );
    assert.equal(d.code, "video_not_found");
  });

  it("diagnoses stored private source", () => {
    const source: GameVideoSource = {
      id: "s1",
      kind: "youtube",
      label: "Parent cam",
      videoId: "abc12345678",
      youtubePrivacyStatus: "private",
    };
    const d = diagnoseFromGameSource(source);
    assert.equal(d?.code, "private_video");
  });

  it("returns null for playable stored source", () => {
    const source: GameVideoSource = {
      id: "s1",
      kind: "youtube",
      label: "Parent cam",
      videoId: "abc12345678",
      youtubePrivacyStatus: "unlisted",
      youtubeEmbeddable: true,
    };
    assert.equal(diagnoseFromGameSource(source), null);
  });

  it("maps badge labels", () => {
    assert.equal(playbackIssueBadgeLabel("private_video"), "Private");
    assert.equal(playbackIssueBadgeLabel("ok"), null);
  });
});
