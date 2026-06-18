import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectTaggedPlayerIds,
  computeGameDashboardMetrics,
  countCoachMarks,
  isSourceSynced,
  recentCoachMarks,
  recentHighlightDrafts,
  syncStatusSummary,
} from "./game-dashboard";
import type { Game } from "./games";
import type { GameTimelineEvent, GameVideoSource } from "./games";
import type { HighlightDraft } from "./highlight-draft";
import type { Player, Team } from "./teams";

const team: Team = {
  id: "t1",
  name: "Wolves",
  ownerId: "o1",
  members: { coach1: "coach", p1: "parent", p2: "parent" },
  memberUids: ["coach1", "p1", "p2"],
  createdAt: null,
  updatedAt: null,
};

describe("game-dashboard", () => {
  it("computeGameDashboardMetrics aggregates counts", () => {
    const sources: GameVideoSource[] = [
      { id: "s1", kind: "youtube", label: "A", syncStatus: "clock_synced" },
      { id: "s2", kind: "youtube", label: "B", syncStatus: "unsynced" },
    ];
    const events: GameTimelineEvent[] = [
      { id: "e1", type: "coach_mark", t: 10, label: "Goal" },
      { id: "e2", type: "note", t: 5 },
    ];
    const players: Player[] = [
      { id: "pl1", name: "Alex" },
      { id: "pl2", name: "Sam" },
    ];
    const drafts: HighlightDraft[] = [
      { id: "d1", name: "Q1", gameId: "g1", moments: [] },
    ];

    const m = computeGameDashboardMetrics({
      sources,
      events,
      players,
      highlightDrafts: drafts,
      team,
    });

    assert.equal(m.sourceCount, 2);
    assert.equal(m.syncedSourceCount, 1);
    assert.equal(m.playerCount, 2);
    assert.equal(m.parentContributorCount, 2);
    assert.equal(m.coachMarkCount, 1);
    assert.equal(m.highlightDraftCount, 1);
    assert.equal(m.statCount, 0);
  });

  it("collectTaggedPlayerIds from events and highlights", () => {
    const events: GameTimelineEvent[] = [
      {
        id: "e1",
        type: "coach_mark",
        t: 1,
        payload: { playerIds: ["pl1"] },
      },
    ];
    const drafts: HighlightDraft[] = [
      {
        id: "d1",
        name: "H",
        gameId: "g1",
        playerIds: ["pl2"],
        moments: [{ id: "m1", gameTime: 0, startOffsetSec: -5, endOffsetSec: 10, activeSourceId: "s1", playerIds: ["pl1"] }],
      },
    ];
    const tagged = collectTaggedPlayerIds(events, drafts).sort();
    assert.deepEqual(tagged, ["pl1", "pl2"]);
  });

  it("isSourceSynced and syncStatusSummary", () => {
    assert.equal(isSourceSynced({ syncStatus: "manually_synced" }), true);
    assert.equal(isSourceSynced({ syncStatus: "unsynced" }), false);
    assert.match(
      syncStatusSummary([
        { id: "a", kind: "youtube", label: "x", syncStatus: "clock_synced" },
        { id: "b", kind: "youtube", label: "y", syncStatus: "unsynced" },
      ]),
      /1 of 2 synced/,
    );
  });

  it("recentCoachMarks returns newest coach marks", () => {
    const events: GameTimelineEvent[] = [
      { id: "e1", type: "coach_mark", t: 5 },
      { id: "e2", type: "coach_mark", t: 20 },
      { id: "e3", type: "note", t: 10 },
    ];
    const recent = recentCoachMarks(events, 1);
    assert.equal(recent.length, 1);
    assert.equal(recent[0]!.t, 20);
  });

  it("countCoachMarks only counts coach_mark type", () => {
    assert.equal(
      countCoachMarks([
        { id: "e1", type: "coach_mark", t: 1 },
        { id: "e2", type: "tag", t: 2 },
      ]),
      1,
    );
  });

  it("full fixture reflects everything on the game dashboard", () => {
    const game: Game = {
      id: "g1",
      title: "Wolves vs Hawks",
      opponent: "Hawks",
      date: "2026-03-01",
      teamId: "t1",
      ownerId: "coach1",
      contributors: { coach1: "owner" },
      memberUids: ["coach1"],
      visibility: "private",
      createdAt: null,
      updatedAt: null,
    };
    const sources: GameVideoSource[] = [
      { id: "s1", kind: "youtube", label: "Sideline", syncStatus: "clock_synced" },
      { id: "s2", kind: "youtube", label: "End zone", syncStatus: "unsynced" },
    ];
    const events: GameTimelineEvent[] = [
      { id: "e1", type: "coach_mark", t: 120, label: "Assist" },
      { id: "e2", type: "coach_mark", t: 300, label: "Goal" },
      { id: "e3", type: "note", t: 50 },
    ];
    const players: Player[] = [
      { id: "pl1", name: "Alex", jerseyNumber: "7" },
      { id: "pl2", name: "Sam", jerseyNumber: "10" },
    ];
    const highlightDrafts: HighlightDraft[] = [
      {
        id: "d1",
        name: "First half",
        gameId: game.id,
        playerIds: ["pl2"],
        moments: [
          {
            id: "m1",
            gameTime: 120,
            startOffsetSec: -5,
            endOffsetSec: 10,
            activeSourceId: "s1",
            playerIds: ["pl1"],
          },
        ],
      },
      { id: "d2", name: "Goals", gameId: game.id, moments: [] },
    ];

    const metrics = computeGameDashboardMetrics({
      sources,
      events,
      players,
      highlightDrafts,
      team,
    });
    const tagged = collectTaggedPlayerIds(events, highlightDrafts);
    const marks = recentCoachMarks(events);
    const drafts = recentHighlightDrafts(highlightDrafts);

    assert.equal(game.title, "Wolves vs Hawks");
    assert.equal(metrics.sourceCount, 2);
    assert.equal(metrics.syncedSourceCount, 1);
    assert.equal(metrics.playerCount, 2);
    assert.equal(metrics.parentContributorCount, 2);
    assert.equal(metrics.coachMarkCount, 2);
    assert.equal(metrics.highlightDraftCount, 2);
    assert.equal(metrics.statCount, 0);
    assert.deepEqual(tagged.sort(), ["pl1", "pl2"]);
    assert.equal(marks.length, 2);
    assert.equal(marks[0]!.t, 300);
    assert.equal(drafts.length, 2);
    assert.match(syncStatusSummary(sources), /1 of 2 synced/);
  });
});
