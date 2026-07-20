import assert from "node:assert/strict";
import test from "node:test";
import {
  approveOpenBodyPackage,
  publishOpenBodyPackage,
} from "@/lib/academy/editorial-repository";
import { buildOpenBodyEditorialRecords } from "@/lib/academy/open-body-package";
import {
  resolvePublishedLessonRecommendations,
  type ConfirmedEvidenceInput,
} from "@/lib/academy/evidence-recommendations";
import {
  assemblePublishedPackagePractice,
  buildPublishedAssignmentRecord,
} from "@/lib/academy/workflow-store";
import { scoreAcademyQuiz } from "@/lib/academy/quiz-scoring";
import {
  OPEN_BODY_QUIZ_QUESTIONS,
} from "@/lib/academy/receive-open-body-content";
import type { PublishedAcademyCatalog } from "@/lib/academy/types";

const improvementTag = "u12-receive-open-body-evidence-improvement";
const positiveTag = "u12-receive-open-body-evidence-positive";
const emptyCatalog: PublishedAcademyCatalog = {
  schemaVersion: 1,
  catalogId: "film-room-academy",
  catalogVersion: 0,
  objects: [],
};

function publishedCatalog(): PublishedAcademyCatalog {
  const seeded = buildOpenBodyEditorialRecords("needs_coach_review");
  const approved = approveOpenBodyPackage(seeded, {
    actor: "editor@filmroom.test",
    at: "2026-07-19T18:00:00.000Z",
  });
  return publishOpenBodyPackage(approved.records, {
    actor: "editor@filmroom.test",
    at: "2026-07-19T18:30:00.000Z",
    catalogVersion: 2,
  }).publishedCatalog;
}

function evidence(
  id: string,
  tagId = improvementTag,
  eventId = id,
): ConfirmedEvidenceInput {
  return {
    id,
    evidenceTagIds: [tagId],
    filmReference: {
      gameId: "game-phase3e",
      timelineEventId: eventId,
      gameTimeSec: 93,
    },
    playerIds: ["player-1"],
    confirmedAt: "2026-07-19T17:00:00.000Z",
  };
}

test("confirmed open-body evidence resolves through the graph to the published lesson", () => {
  const resolution = resolvePublishedLessonRecommendations({
    teamId: "team-1",
    confirmedEvidence: [evidence("evidence-1")],
    publishedCatalog: publishedCatalog(),
    now: new Date("2026-07-19T18:00:00.000Z"),
  });
  assert.equal(resolution.recommendations.length, 1);
  const recommendation = resolution.recommendations[0]!;
  assert.equal(recommendation.goal.id, "u12-receive-open-body");
  assert.equal(
    recommendation.lesson.lesson.id,
    "academy-lesson-receive-open-body",
  );
  assert.ok(recommendation.reasons.some((reason) => reason.includes(improvementTag)));
  assert.equal(recommendation.traces[0]?.filmReference.timelineEventId, "evidence-1");
});

test("unpublished and incomplete packages produce a goal without a lesson recommendation", () => {
  const unpublished = resolvePublishedLessonRecommendations({
    teamId: "team-1",
    confirmedEvidence: [evidence("evidence-1")],
    publishedCatalog: emptyCatalog,
  });
  assert.equal(unpublished.recommendations.length, 0);
  assert.equal(
    unpublished.resolvedGoalsWithoutPublishedLesson[0]?.id,
    "u12-receive-open-body",
  );

  const incomplete = structuredClone(publishedCatalog());
  incomplete.objects = incomplete.objects.filter(
    (object) => object.id !== "academy-warmup-open-body-gates",
  );
  const missingReference = resolvePublishedLessonRecommendations({
    teamId: "team-1",
    confirmedEvidence: [evidence("evidence-1")],
    publishedCatalog: incomplete,
  });
  assert.equal(missingReference.recommendations.length, 0);
});

test("duplicate evidence deduplicates the lesson and repeated moments strengthen it", () => {
  const resolution = resolvePublishedLessonRecommendations({
    teamId: "team-1",
    confirmedEvidence: [
      evidence("evidence-1", improvementTag, "event-1"),
      evidence("evidence-duplicate", improvementTag, "event-1"),
      evidence("evidence-2", positiveTag, "event-2"),
    ],
    playerId: "player-1",
    gameId: "game-phase3e",
    publishedCatalog: publishedCatalog(),
    now: new Date("2026-07-19T18:00:00.000Z"),
  });
  assert.equal(resolution.recommendations.length, 1);
  assert.equal(resolution.recommendations[0]?.confirmedMomentCount, 2);
  assert.equal(resolution.recommendations[0]?.strength, "Repeated need");
});

test("published-package practice references canonical activities in lesson order", () => {
  const recommendation = resolvePublishedLessonRecommendations({
    teamId: "team-1",
    confirmedEvidence: [evidence("evidence-1")],
    publishedCatalog: publishedCatalog(),
  }).recommendations[0]!;
  const practice = assemblePublishedPackagePractice({
    recommendation,
    createdBy: "coach-1",
    id: "practice-1",
  });
  assert.deepEqual(
    practice.activitySequence.map((activity) => activity.activityId),
    [
      "academy-warmup-open-body-gates",
      "academy-activity-open-body-diamond",
      "academy-ssg-open-body-end-zones",
    ],
  );
  assert.equal(practice.estimatedTotalDurationMinutes, 45);
  assert.equal(JSON.stringify(practice).includes("setupInstructions"), false);
  assert.equal(practice.supportingEvidence[0]?.evidenceId, "evidence-1");
});

test("assignment records contain references and recipients without answer keys", () => {
  const recommendation = resolvePublishedLessonRecommendations({
    teamId: "team-1",
    confirmedEvidence: [evidence("evidence-1")],
    publishedCatalog: publishedCatalog(),
  }).recommendations[0]!;
  const assignment = buildPublishedAssignmentRecord({
    recommendation,
    assignedBy: "coach-1",
    assignedPlayerIds: ["player-1", "player-2"],
    id: "assignment-1",
  });
  assert.deepEqual(assignment.assignedPlayerIds, ["player-1", "player-2"]);
  assert.equal(assignment.assignmentId, "academy-assignment-open-body-three-moments");
  assert.equal(JSON.stringify(assignment).includes("correctOptionIds"), false);
});

test("published quiz payload hides answers while server scoring remains deterministic", () => {
  const catalog = publishedCatalog();
  const questionObjects = catalog.objects.filter(
    (object) => object.objectType === "quiz_question",
  );
  assert.equal(questionObjects.length, 6);
  assert.ok(
    questionObjects.every(
      (question) =>
        !("correctOptionIds" in (question.payload as Record<string, unknown>)) &&
        !("explanation" in (question.payload as Record<string, unknown>)),
    ),
  );
  const answers = Object.fromEntries(
    OPEN_BODY_QUIZ_QUESTIONS.map((question) => [
      question.id,
      question.correctOptionIds ?? [],
    ]),
  );
  const score = scoreAcademyQuiz(OPEN_BODY_QUIZ_QUESTIONS, answers);
  assert.equal(score.score, 100);
  assert.equal(score.correctCount, 6);
});

test("quiz scoring requires an authenticated Firebase ID token", async () => {
  const { verifyFirebaseIdTokenRest } = await import("@/lib/firebase-id-token");
  await assert.rejects(
    () => verifyFirebaseIdTokenRest(""),
    /AUTH_REQUIRED/,
  );
});
