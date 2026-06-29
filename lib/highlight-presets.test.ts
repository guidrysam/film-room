import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReelSteps,
  normalizeHighlightRepeat,
  normalizeHighlightSpeed,
  parseHighlightDraftMeta,
  reelDurationSec,
  type HighlightMoment,
} from "./highlight-draft";
import type { DirectorTrack } from "./games";
import { generatePresetMoments, HIGHLIGHT_PRESETS } from "./highlight-presets";

describe("highlight speed/repeat normalization", () => {
  it("clamps speed into 0.25–2 and defaults to 1", () => {
    assert.equal(normalizeHighlightSpeed(0.5), 0.5);
    assert.equal(normalizeHighlightSpeed(5), 2);
    assert.equal(normalizeHighlightSpeed(0), 1);
    assert.equal(normalizeHighlightSpeed("nope"), 1);
  });

  it("clamps repeat to an int 1–10", () => {
    assert.equal(normalizeHighlightRepeat(3), 3);
    assert.equal(normalizeHighlightRepeat(0), 1);
    assert.equal(normalizeHighlightRepeat(99), 10);
    assert.equal(normalizeHighlightRepeat(2.6), 3);
  });
});

describe("parseHighlightDraftMeta speed/repeat round-trip", () => {
  it("reads speed and repeat when present, drops defaults", () => {
    const track: DirectorTrack = {
      id: "d1",
      kind: "highlight",
      name: "Reel",
      description: JSON.stringify({
        schema: "highlight_draft_v1",
        moments: [
          {
            id: "m1",
            gameTime: 100,
            startOffsetSec: -2,
            endOffsetSec: 3,
            activeSourceId: "s1",
            speed: 0.5,
            repeat: 3,
          },
          {
            id: "m2",
            gameTime: 120,
            startOffsetSec: -5,
            endOffsetSec: 10,
            activeSourceId: "s2",
            speed: 1,
            repeat: 1,
          },
        ],
      }),
      track: [],
    };
    const meta = parseHighlightDraftMeta(track);
    assert.ok(meta);
    assert.equal(meta!.moments[0]!.speed, 0.5);
    assert.equal(meta!.moments[0]!.repeat, 3);
    // Defaults (1) are not stored on the parsed moment.
    assert.equal(meta!.moments[1]!.speed, undefined);
    assert.equal(meta!.moments[1]!.repeat, undefined);
  });
});

describe("buildReelSteps", () => {
  const moments: HighlightMoment[] = [
    {
      id: "m1",
      gameTime: 100,
      startOffsetSec: -2,
      endOffsetSec: 3,
      activeSourceId: "s1",
      speed: 0.5,
      repeat: 2,
    },
    {
      id: "m2",
      gameTime: 100,
      startOffsetSec: -2,
      endOffsetSec: 3,
      activeSourceId: "s2",
    },
  ];

  it("converts game time to source playback time via offsets", () => {
    const steps = buildReelSteps(moments, { s1: 0, s2: 12 });
    assert.equal(steps.length, 2);
    assert.equal(steps[0]!.sourceStartTime, 98);
    assert.equal(steps[0]!.sourceEndTime, 103);
    // s2 is offset +12s relative to game time.
    assert.equal(steps[1]!.sourceStartTime, 110);
    assert.equal(steps[1]!.sourceEndTime, 115);
  });

  it("applies normalized speed/repeat defaults", () => {
    const steps = buildReelSteps(moments, {});
    assert.equal(steps[0]!.speed, 0.5);
    assert.equal(steps[0]!.repeat, 2);
    assert.equal(steps[1]!.speed, 1);
    assert.equal(steps[1]!.repeat, 1);
  });

  it("never produces negative source times", () => {
    const steps = buildReelSteps(
      [{ id: "m", gameTime: 1, startOffsetSec: -5, endOffsetSec: 2, activeSourceId: "s1" }],
      { s1: 0 },
    );
    assert.equal(steps[0]!.sourceStartTime, 0);
  });

  it("reelDurationSec accounts for speed and repeat", () => {
    // m1: 5s window at 0.5x ×2 = 20s; m2: 5s at 1x ×1 = 5s.
    const steps = buildReelSteps(moments, {});
    assert.equal(reelDurationSec(steps), 25);
  });
});

describe("highlight presets", () => {
  const base = {
    gameTime: 100,
    startOffsetSec: -5,
    endOffsetSec: 10,
    primarySourceId: "s1",
    label: "Goal",
  };
  const angles = ["s1", "s2", "s3"];

  it("single → one real-time segment on the primary angle", () => {
    const out = generatePresetMoments("single", base, angles);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.activeSourceId, "s1");
    assert.equal(out[0]!.speed, 1);
  });

  it("replay → live then slow-mo on the same angle", () => {
    const out = generatePresetMoments("replay", base, angles);
    assert.equal(out.length, 2);
    assert.equal(out[1]!.speed, 0.5);
    assert.equal(out[1]!.activeSourceId, "s1");
  });

  it("every_angle → one segment per camera, primary first", () => {
    const out = generatePresetMoments("every_angle", base, angles);
    assert.equal(out.length, 3);
    assert.deepEqual(
      out.map((m) => m.activeSourceId),
      ["s1", "s2", "s3"],
    );
  });

  it("showcase → primary live then a slow-mo beat per other angle", () => {
    const out = generatePresetMoments("showcase", base, angles);
    assert.equal(out.length, 3);
    assert.equal(out[0]!.speed, 1);
    assert.ok(out.slice(1).every((m) => m.speed === 0.5));
  });

  it("loop → one repeated tight clip", () => {
    const out = generatePresetMoments("loop", base, angles);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.repeat, 3);
  });

  it("presets degrade gracefully with a single angle", () => {
    const single = ["s1"];
    assert.equal(generatePresetMoments("every_angle", base, single).length, 1);
    // showcase falls back to a slow-mo of the primary when no other angle.
    const sc = generatePresetMoments("showcase", base, single);
    assert.equal(sc.length, 2);
    assert.equal(sc[1]!.activeSourceId, "s1");
  });

  it("HIGHLIGHT_PRESETS keys match their ids", () => {
    for (const [id, preset] of Object.entries(HIGHLIGHT_PRESETS)) {
      assert.equal(id, preset.id);
    }
  });
});
