import assert from "node:assert/strict";
import test from "node:test";
import { validateAcademyLessonPackage } from "@/lib/academy/lesson-package-validation";
import {
  OPEN_BODY_ASSIGNMENT,
  OPEN_BODY_QUIZ,
  OPEN_BODY_QUIZ_QUESTIONS,
  OPEN_BODY_SMALL_SIDED_GAME,
  OPEN_BODY_TECHNICAL_ACTIVITY,
  OPEN_BODY_WARMUP,
  RECEIVE_OPEN_BODY_LESSON,
} from "@/lib/academy/receive-open-body-content";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

const OPEN_BODY_ACTIVITIES = [
  OPEN_BODY_WARMUP,
  OPEN_BODY_TECHNICAL_ACTIVITY,
  OPEN_BODY_SMALL_SIDED_GAME,
];

function lessonPackage() {
  return {
    catalog: U12_ACADEMY_GOAL_CATALOG,
    lesson: RECEIVE_OPEN_BODY_LESSON,
    activities: OPEN_BODY_ACTIVITIES,
    assignment: OPEN_BODY_ASSIGNMENT,
    quiz: OPEN_BODY_QUIZ,
    questions: OPEN_BODY_QUIZ_QUESTIONS,
  };
}

test("open-body lesson package is complete and internally valid", () => {
  const validation = validateAcademyLessonPackage(lessonPackage());
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.valid, true);
  assert.equal(OPEN_BODY_ACTIVITIES.length, 3);
  assert.equal(OPEN_BODY_QUIZ_QUESTIONS.length, 6);
  assert.deepEqual(
    OPEN_BODY_ACTIVITIES.map((activity) => activity.activityRole),
    ["warm_up", "technical", "small_sided_game"],
  );
});

test("canonical IDs and target goal stay stable", () => {
  assert.equal(
    RECEIVE_OPEN_BODY_LESSON.id,
    "academy-lesson-receive-open-body",
  );
  assert.deepEqual(RECEIVE_OPEN_BODY_LESSON.goalIds, [
    "u12-receive-open-body",
  ]);
  assert.deepEqual(
    OPEN_BODY_ACTIVITIES.map((activity) => activity.id),
    [
      "academy-warmup-open-body-gates",
      "academy-activity-open-body-diamond",
      "academy-ssg-open-body-end-zones",
    ],
  );
  assert.equal(
    OPEN_BODY_ASSIGNMENT.id,
    "academy-assignment-open-body-three-moments",
  );
  assert.equal(OPEN_BODY_QUIZ.id, "academy-quiz-receive-open-body");
});

test("all content remains review-only and source-independent", () => {
  const serialized = JSON.stringify(lessonPackage());
  assert.equal(serialized.includes("sourceDocumentId"), false);
  assert.equal(serialized.includes(".pdf"), false);
  for (const record of [
    RECEIVE_OPEN_BODY_LESSON,
    ...OPEN_BODY_ACTIVITIES,
    OPEN_BODY_ASSIGNMENT,
    OPEN_BODY_QUIZ,
    ...OPEN_BODY_QUIZ_QUESTIONS,
  ]) {
    assert.equal(record.editorial.status, "needs_coach_review");
  }
});

test("quiz questions test decisions and have valid answers", () => {
  for (const question of OPEN_BODY_QUIZ_QUESTIONS) {
    assert.ok((question.options?.length ?? 0) >= 2);
    assert.ok((question.correctOptionIds?.length ?? 0) >= 1);
    const optionIds = new Set(question.options?.map((option) => option.id));
    assert.ok(
      question.correctOptionIds?.every((optionId) => optionIds.has(optionId)),
    );
    assert.ok(question.explanation);
  }
});

test("validation rejects broken goal, evidence, and activity links", () => {
  const brokenLesson = structuredClone(RECEIVE_OPEN_BODY_LESSON);
  brokenLesson.relatedGoalIds = ["missing-goal"];
  brokenLesson.evidenceTagIds = ["missing-evidence"];
  brokenLesson.activityIds = [];
  const validation = validateAcademyLessonPackage({
    ...lessonPackage(),
    lesson: brokenLesson,
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("related goal")));
  assert.ok(validation.errors.some((error) => error.includes("evidence tag")));
  assert.ok(validation.errors.some((error) => error.includes("activity")));
});

