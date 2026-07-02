import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GameTimelineEvent } from "./games";
import {
  formatHighlightMarkLabel,
  highlightMomentsFromGameMarks,
  isHighlightMarkEvent,
  mergeGoalAssistMarks,
  resolveHighlightMarkSourceId,
} from "./highlight-from-marks";

function mark(
  partial: Pick<GameTimelineEvent, "id" | "type" | "t"> &
    Partial<GameTimelineEvent>,
): GameTimelineEvent {
  return partial as GameTimelineEvent;
}

describe("isHighlightMarkEvent", () => {
  it("includes coach marks, stats, and tags with finite time", () => {
    assert.equal(
      isHighlightMarkEvent(mark({ id: "1", type: "coach_mark", t: 10 })),
      true,
    );
    assert.equal(
      isHighlightMarkEvent(mark({ id: "2", type: "stat", t: 20 })),
      true,
    );
    assert.equal(
      isHighlightMarkEvent(mark({ id: "3", type: "note", t: 30 })),
      false,
    );
  });
});

describe("formatHighlightMarkLabel", () => {
  it("formats stat labels and falls back for coach marks", () => {
    assert.equal(
      formatHighlightMarkLabel(
        mark({
          id: "s1",
          type: "stat",
          t: 1,
          payload: { statType: "goal" },
        }),
      ),
      "Goal",
    );
    assert.equal(
      formatHighlightMarkLabel(
        mark({ id: "m1", type: "coach_mark", t: 1, label: "Corner kick" }),
      ),
      "Corner kick",
    );
  });
});

describe("resolveHighlightMarkSourceId", () => {
  it("prefers the mark source when playable", () => {
    assert.equal(
      resolveHighlightMarkSourceId(
        mark({ id: "1", type: "coach_mark", t: 1, sourceId: "cam-b" }),
        ["cam-a", "cam-b"],
        "cam-a",
      ),
      "cam-b",
    );
  });

  it("falls back to the primary source", () => {
    assert.equal(
      resolveHighlightMarkSourceId(
        mark({ id: "1", type: "coach_mark", t: 1, sourceId: "missing" }),
        ["cam-a"],
        "cam-a",
      ),
      "cam-a",
    );
  });
});

describe("highlightMomentsFromGameMarks", () => {
  it("builds one segment per mark in game-time order", () => {
    const moments = highlightMomentsFromGameMarks(
      [
        mark({ id: "late", type: "coach_mark", t: 120, label: "Late" }),
        mark({ id: "early", type: "tag", t: 30, label: "Early" }),
      ],
      {
        primarySourceId: "cam-a",
        playableSourceIds: ["cam-a", "cam-b"],
        presetId: "single",
      },
    );
    assert.equal(moments.length, 2);
    assert.equal(moments[0]!.gameTime, 30);
    assert.equal(moments[0]!.label, "Early");
    assert.equal(moments[1]!.gameTime, 120);
    assert.equal(moments[0]!.timelineEventId, "early");
    assert.equal(moments[1]!.activeSourceId, "cam-a");
  });

  it("uses replay preset to expand each mark", () => {
    const moments = highlightMomentsFromGameMarks(
      [mark({ id: "g1", type: "stat", t: 90, sourceId: "cam-a", payload: { statType: "goal" } })],
      {
        primarySourceId: "cam-a",
        playableSourceIds: ["cam-a"],
        presetId: "replay",
      },
    );
    assert.equal(moments.length, 2);
    assert.equal(moments[0]!.label, "Goal");
    assert.equal(moments[1]!.label, "Slow-mo replay");
  });

  it("merges goal and assist at the same time into one highlight", () => {
    const merged = mergeGoalAssistMarks([
      mark({
        id: "goal1",
        type: "stat",
        t: 374,
        sourceId: "cam-a",
        payload: { statType: "goal", playerIds: ["p1"] },
      }),
      mark({
        id: "ast1",
        type: "stat",
        t: 374,
        sourceId: "cam-a",
        payload: { statType: "assist", playerIds: ["p2"] },
      }),
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.label, "Goal + Assist");

    const moments = highlightMomentsFromGameMarks(
      [
        mark({
          id: "goal1",
          type: "stat",
          t: 374,
          payload: { statType: "goal", playerIds: ["p1"] },
        }),
        mark({
          id: "ast1",
          type: "stat",
          t: 374,
          payload: { statType: "assist", playerIds: ["p2"] },
        }),
        mark({ id: "shot1", type: "stat", t: 400, payload: { statType: "shot" } }),
      ],
      {
        primarySourceId: "cam-a",
        playableSourceIds: ["cam-a"],
        presetId: "single",
      },
    );
    assert.equal(moments.length, 2);
    assert.equal(moments[0]!.label, "Goal + Assist");
    assert.equal(moments[0]!.gameTime, 374);
    assert.deepEqual(moments[0]!.goalPlayerIds, ["p1"]);
    assert.deepEqual(moments[0]!.assistPlayerIds, ["p2"]);
    assert.equal(moments[1]!.label, "Shot");
  });
});
