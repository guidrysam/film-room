/**
 * Quick sanity check for game timeline math (run: node scripts/verify-game-timeline.mjs)
 */

function sourceOffsetSec(source) {
  const o = source.offsetFromGameTime;
  return typeof o === "number" && Number.isFinite(o) ? o : 0;
}

function gameTimeToSourceTime(gameTime, source) {
  return gameTime + sourceOffsetSec(source);
}

function sourceTimeToGameTime(sourceTime, source) {
  return sourceTime - sourceOffsetSec(source);
}

function estimateClockSync(game, source) {
  const scheduledMs = Date.parse(game.scheduledStartAt);
  const recordedMs = Date.parse(source.recordedStartTime);
  if (!Number.isFinite(scheduledMs) || !Number.isFinite(recordedMs)) return null;
  return { offsetFromGameTime: (scheduledMs - recordedMs) / 1000 };
}

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

const src = { offsetFromGameTime: 10 };
assert(gameTimeToSourceTime(0, src) === 10, "game 0 → source 10");
assert(sourceTimeToGameTime(10, src) === 0, "source 10 → game 0");
assert(gameTimeToSourceTime(30, src) === 40, "game 30 → source 40");

const kickoff = "2026-06-15T14:00:00.000Z";
const recordLate = "2026-06-15T14:00:30.000Z";
const est = estimateClockSync(
  { scheduledStartAt: kickoff },
  { recordedStartTime: recordLate },
);
assert(est?.offsetFromGameTime === -30, "record 30s after kickoff → offset -30");
assert(
  gameTimeToSourceTime(0, { offsetFromGameTime: -30 }) === -30,
  "at kickoff source not started",
);

if (failed > 0) {
  process.exit(1);
}
console.log("All game-timeline checks passed.");
