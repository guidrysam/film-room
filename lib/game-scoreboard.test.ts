import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScoreboardTicks,
  scoreboardAtGameTime,
  scoreDeltaForTimelineEvent,
} from "@/lib/game-scoreboard";
import type { GameTimelineEvent } from "@/lib/games";

function ev(
  partial: Partial<GameTimelineEvent> & { id: string; t: number },
): GameTimelineEvent {
  return {
    type: "coach_mark",
    ...partial,
  };
}

describe("scoreDeltaForTimelineEvent", () => {
  it("maps Game Cap goal and opponentGoal", () => {
    assert.deepEqual(
      scoreDeltaForTimelineEvent(
        ev({
          id: "1",
          t: 10,
          payload: { gameCapType: "goal" },
        }),
      ),
      { home: 1, away: 0 },
    );
    assert.deepEqual(
      scoreDeltaForTimelineEvent(
        ev({
          id: "2",
          t: 20,
          payload: { gameCapType: "opponentGoal" },
        }),
      ),
      { home: 0, away: 1 },
    );
  });

  it("counts AI / stat goals and opponent goals", () => {
    assert.deepEqual(
      scoreDeltaForTimelineEvent(
        ev({
          id: "3",
          t: 30,
          label: "Goal: header",
          payload: { aiKind: "goal", statType: "goal" },
        }),
      ),
      { home: 1, away: 0 },
    );
    assert.deepEqual(
      scoreDeltaForTimelineEvent(
        ev({
          id: "4",
          t: 40,
          label: "Goal (opponent): tap-in",
          payload: { aiKind: "goal", opponent: true },
        }),
      ),
      { home: 0, away: 1 },
    );
    assert.deepEqual(
      scoreDeltaForTimelineEvent(
        ev({
          id: "5",
          t: 50,
          label: "Other team goal",
          payload: { opponent: true },
        }),
      ),
      { home: 0, away: 1 },
    );
  });

  it("counts basketball opponent scoring at full point value", () => {
    assert.deepEqual(
      scoreDeltaForTimelineEvent(
        ev({
          id: "6",
          t: 60,
          label: "Other team bucket",
          payload: { opponent: true },
        }),
      ),
      { home: 0, away: 2 },
    );
    assert.deepEqual(
      scoreDeltaForTimelineEvent(
        ev({
          id: "7",
          t: 70,
          label: "3PT (opponent): corner",
          payload: { aiKind: "three_pointer", opponent: true },
        }),
      ),
      { home: 0, away: 3 },
    );
  });
});

describe("scoreboardAtGameTime", () => {
  it("applies scores at markedAtSec for lookback goals", () => {
    const ticks = buildScoreboardTicks([
      ev({
        id: "g1",
        t: 90,
        label: "Goal",
        payload: {
          gameCapType: "goal",
          markedAtSec: 100,
          lookbackSec: 10,
        },
      }),
    ]);
    const before = scoreboardAtGameTime(ticks, 95, {
      homeName: "Us",
      awayName: "Them",
    });
    assert.equal(before.home, 0);
    const after = scoreboardAtGameTime(ticks, 100, {
      homeName: "Us",
      awayName: "Them",
    });
    assert.equal(after.home, 1);
    assert.equal(after.away, 0);
  });
});
