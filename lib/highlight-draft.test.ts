import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  highlightDraftMatchesPlayer,
  highlightMomentsForPlayer,
  parseHighlightDraftMeta,
  type HighlightDraft,
} from "./highlight-draft";
import type { DirectorTrack } from "./games";

describe("highlight-draft player tags", () => {
  it("parseHighlightDraftMeta stays compatible without playerIds", () => {
    const track: DirectorTrack = {
      id: "d1",
      kind: "highlight",
      name: "Legacy",
      description: JSON.stringify({
        schema: "highlight_draft_v1",
        moments: [
          {
            id: "m1",
            gameTime: 10,
            startOffsetSec: -5,
            endOffsetSec: 10,
            activeSourceId: "s1",
          },
        ],
      }),
      track: [],
    };
    const meta = parseHighlightDraftMeta(track);
    assert.ok(meta);
    assert.equal(meta!.moments.length, 1);
    assert.equal(meta!.playerIds, undefined);
  });

  it("highlightDraftMatchesPlayer checks draft and moment playerIds", () => {
    const draft: HighlightDraft = {
      id: "d2",
      name: "Q1",
      gameId: "g1",
      playerIds: ["p1"],
      moments: [
        {
          id: "m1",
          gameTime: 5,
          startOffsetSec: -5,
          endOffsetSec: 10,
          activeSourceId: "s1",
          playerIds: ["p2"],
        },
      ],
    };
    assert.equal(highlightDraftMatchesPlayer(draft, "p1"), true);
    assert.equal(highlightDraftMatchesPlayer(draft, "p2"), true);
    assert.equal(highlightDraftMatchesPlayer(draft, "p9"), false);
  });

  it("highlightMomentsForPlayer returns moment-level tags", () => {
    const draft: HighlightDraft = {
      id: "d3",
      name: "Mix",
      gameId: "g1",
      moments: [
        {
          id: "m1",
          gameTime: 1,
          startOffsetSec: -5,
          endOffsetSec: 10,
          activeSourceId: "s1",
          playerIds: ["p1"],
        },
        {
          id: "m2",
          gameTime: 2,
          startOffsetSec: -5,
          endOffsetSec: 10,
          activeSourceId: "s1",
          playerIds: ["p2"],
        },
      ],
    };
    assert.equal(highlightMomentsForPlayer(draft, "p1").length, 1);
    assert.equal(highlightMomentsForPlayer(draft, "p1")[0]!.id, "m1");
  });
});
