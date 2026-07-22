import assert from "node:assert/strict";
import test from "node:test";
import {
  BALL_MASTERY_LEVELS,
  getNextBallMasteryLevel,
} from "@/lib/player-skills/ball-mastery-ladder";

test("ball mastery levels are sequential from 1", () => {
  assert.ok(BALL_MASTERY_LEVELS.length >= 6);
  BALL_MASTERY_LEVELS.forEach((level, index) => {
    assert.equal(level.order, index + 1);
    assert.ok(level.youtubeQuery.length >= 3);
    assert.ok(level.practicePrompt.length > 0);
  });
});

test("next level unlocks in order", () => {
  const first = BALL_MASTERY_LEVELS[0];
  const second = BALL_MASTERY_LEVELS[1];
  assert.ok(first && second);
  assert.equal(getNextBallMasteryLevel(first.id)?.id, second.id);
  const last = BALL_MASTERY_LEVELS[BALL_MASTERY_LEVELS.length - 1];
  assert.ok(last);
  assert.equal(getNextBallMasteryLevel(last.id), undefined);
});
