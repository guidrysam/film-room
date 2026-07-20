import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePracticeGoalsFromFilmEvidence,
  filmReferenceFromTimelineEvent,
  inferAcademyEventTypesFromTimelineEvent,
  recommendDevelopmentFollowUps,
  resolveGoalsForEvidenceTags,
  suggestFilmEvidence,
} from "@/lib/academy/film-evidence";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";
import type { GameTimelineEvent } from "@/lib/games";

const scanPositive = "u12-scan-before-receiving-evidence-positive";
const scanImprovement = "u12-scan-before-receiving-evidence-improvement";

test("timeline event times stay in seconds on film references", () => {
  const event: GameTimelineEvent = {
    id: "evt_1",
    type: "coach_mark",
    t: 92.5,
    sourceId: "cam-a",
    label: "Teaching moment",
  };
  const reference = filmReferenceFromTimelineEvent("game_1", event);
  assert.equal(reference.gameTimeSec, 92.5);
  assert.equal(reference.timelineEventId, "evt_1");
  assert.equal("gameTimeMs" in reference, false);
});

test("infers coarse Academy event families from stats without inventing intent", () => {
  const turnover: GameTimelineEvent = {
    id: "evt_2",
    type: "stat",
    t: 40,
    payload: { statType: "turnover" },
  };
  assert.deepEqual(inferAcademyEventTypesFromTimelineEvent(turnover), [
    "turnover",
  ]);

  const cornerMark: GameTimelineEvent = {
    id: "evt_3",
    type: "coach_mark",
    t: 55,
    label: "Corner",
  };
  const types = inferAcademyEventTypesFromTimelineEvent(cornerMark);
  assert.ok(types.includes("coach_clip"));
  assert.ok(types.includes("corner"));
});

test("suggests evidence tags and resolves goals for a coach mark", () => {
  const event: GameTimelineEvent = {
    id: "evt_4",
    type: "coach_mark",
    t: 120,
    label: "Great play",
  };
  const suggestion = suggestFilmEvidence(U12_ACADEMY_GOAL_CATALOG, event, {
    limit: 6,
  });
  assert.ok(suggestion.suggestedTagIds.length > 0);
  assert.ok(suggestion.suggestedGoalIds.length > 0);
  assert.equal(suggestion.confidence === "high", false);
  assert.ok(
    suggestion.notes.some((note) => note.includes("confirm the teaching tag")),
  );
});

test("evidence tags map to goals and prioritize improvement for follow-ups", () => {
  const goals = resolveGoalsForEvidenceTags(U12_ACADEMY_GOAL_CATALOG, [
    scanPositive,
    scanImprovement,
  ]);
  assert.equal(goals.length, 1);
  assert.equal(goals[0]?.id, "u12-scan-before-receiving");

  const followUp = recommendDevelopmentFollowUps(U12_ACADEMY_GOAL_CATALOG, [
    scanImprovement,
    scanPositive,
  ]);
  assert.deepEqual(followUp.primaryGoalIds, ["u12-scan-before-receiving"]);
  assert.ok(followUp.improvementGoalIds.includes("u12-scan-before-receiving"));
  assert.ok(followUp.assignmentSuitability.includes("filmStudy"));
  assert.ok(followUp.recommendedDrillCount >= 1);
});

test("aggregates practice goals from multiple film evidence attachments", () => {
  const aggregated = aggregatePracticeGoalsFromFilmEvidence(
    U12_ACADEMY_GOAL_CATALOG,
    [
      { evidenceTagIds: [scanImprovement] },
      {
        evidenceTagIds: [
          "u12-receive-open-body-evidence-improvement",
        ],
      },
    ],
    { maxPrimaryGoals: 2, maxSupportingGoals: 3 },
  );
  assert.ok(aggregated.primaryGoalIds.includes("u12-scan-before-receiving"));
  assert.ok(aggregated.evidenceTagIds.includes(scanImprovement));
  assert.ok(aggregated.primaryGoalIds.length <= 2);
});
