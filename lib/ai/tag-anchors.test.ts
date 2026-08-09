import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anchorsInWindow,
  buildTagAnchorHints,
  formatAnchorsForPrompt,
} from "@/lib/ai/tag-anchors";

describe("buildTagAnchorHints", () => {
  it("maps Game Cap sidecar events and applies source offset", () => {
    const hints = buildTagAnchorHints(
      [
        {
          id: "1",
          type: "coach_mark",
          t: 120,
          label: "Goal",
          payload: {
            gameCapType: "goal",
            importedFrom: "gamecap_sidecar",
          },
        },
        {
          id: "2",
          type: "sync_point",
          t: 10,
          label: "sync",
        },
      ],
      { sourceOffsetFromGameTime: 5 },
    );
    assert.equal(hints.length, 1);
    assert.equal(hints[0]!.tSec, 125);
    assert.equal(hints[0]!.kind, "goal");
    assert.equal(hints[0]!.source, "gamecap");
  });

  it("formats clip-relative times for the prompt", () => {
    const text = formatAnchorsForPrompt(
      [
        {
          tSec: 600,
          kind: "shot",
          label: "Shot",
          source: "gamecap",
        },
      ],
      300,
    );
    assert.match(text, /tSec=300/);
    assert.match(text, /abs 600/);
  });

  it("filters anchors to the active window", () => {
    const inWin = anchorsInWindow(
      [
        { tSec: 10, kind: "kickoff", label: "Kickoff", source: "gamecap" },
        { tSec: 2000, kind: "goal", label: "Goal", source: "gamecap" },
      ],
      0,
      100,
    );
    assert.equal(inWin.length, 1);
    assert.equal(inWin[0]!.kind, "kickoff");
  });
});
