import assert from "node:assert/strict";
import test from "node:test";
import {
  ACADEMY_ACTIVITY_CATEGORY_LABELS,
  CANONICAL_ACTIVITY_LIBRARY,
  filterCanonicalActivities,
  getActivitiesForDevelopmentGoals,
  getActivitiesForLesson,
  getCanonicalActivity,
} from "@/lib/academy/activity-library";
import { validateCanonicalActivityLibrary } from "@/lib/academy/activity-library-validation";
import { RECEIVE_OPEN_BODY_LESSON } from "@/lib/academy/receive-open-body-content";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

test("canonical activity schema supports all required categories", () => {
  assert.deepEqual(Object.keys(ACADEMY_ACTIVITY_CATEGORY_LABELS), [
    "warmup",
    "technical",
    "possession",
    "small_sided_game",
    "finishing",
    "defending",
    "transition",
    "goalkeeper",
    "conditioned_game",
  ]);
});

test("initial canonical activity repository is valid and stable", () => {
  const validation = validateCanonicalActivityLibrary({
    activities: CANONICAL_ACTIVITY_LIBRARY,
    catalog: U12_ACADEMY_GOAL_CATALOG,
    lessonIds: [
      RECEIVE_OPEN_BODY_LESSON.id,
      "u12-lesson-ball-available",
      "u12-lesson-turn-escape",
      "u12-lesson-shield-purpose",
    ],
  });
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.valid, true);
  assert.deepEqual(
    CANONICAL_ACTIVITY_LIBRARY.slice(0, 3).map((activity) => activity.id),
    [
      "academy-warmup-open-body-gates",
      "academy-activity-open-body-diamond",
      "academy-ssg-open-body-end-zones",
    ],
  );
  assert.equal(CANONICAL_ACTIVITY_LIBRARY.length, 12);
  for (const activity of CANONICAL_ACTIVITY_LIBRARY) {
    assert.equal(activity.version, 1);
    assert.equal(activity.editorial.status, "needs_coach_review");
    assert.ok(activity.summary);
    assert.ok(activity.description);
    assert.ok(activity.organization.length);
    assert.ok(activity.safetyNotes.length);
  }
});

test("lesson composes canonical activity IDs without embedding activities", () => {
  assert.deepEqual(RECEIVE_OPEN_BODY_LESSON.activityIds, [
    "academy-warmup-open-body-gates",
    "academy-activity-open-body-diamond",
    "academy-ssg-open-body-end-zones",
  ]);
  assert.equal(
    Object.hasOwn(RECEIVE_OPEN_BODY_LESSON, "setupInstructions"),
    false,
  );
  assert.deepEqual(
    getActivitiesForLesson(RECEIVE_OPEN_BODY_LESSON.id).map(
      (activity) => activity.id,
    ),
    RECEIVE_OPEN_BODY_LESSON.activityIds,
  );
});

test("repository supports lookup, search, and reusable goal relationships", () => {
  assert.equal(
    getCanonicalActivity("academy-activity-open-body-diamond")?.category,
    "technical",
  );
  assert.deepEqual(
    filterCanonicalActivities({
      query: "late directional cue",
      category: "warmup",
      ageBand: "U11-U12",
      difficulty: "foundation",
      developmentGoalId: "u12-receive-open-body",
      editorialStatus: "needs_coach_review",
    }).map((activity) => activity.id),
    ["academy-warmup-open-body-gates"],
  );
  assert.equal(
    getActivitiesForDevelopmentGoals(["u12-first-touch-away-pressure"]).length,
    2,
  );
});

test("library validation rejects duplicate IDs and unresolved relationships", () => {
  const broken = structuredClone(CANONICAL_ACTIVITY_LIBRARY);
  broken[1].id = broken[0].id;
  broken[0].relatedActivityIds = ["missing-activity"];
  broken[0].goalIds = ["missing-goal"];
  broken[0].evidenceTagIds = ["missing-evidence"];
  broken[0].relatedLessonIds = ["missing-lesson"];
  const validation = validateCanonicalActivityLibrary({
    activities: broken,
    catalog: U12_ACADEMY_GOAL_CATALOG,
    lessonIds: [RECEIVE_OPEN_BODY_LESSON.id],
  });
  assert.equal(validation.valid, false);
  for (const expected of [
    "duplicate activity id",
    "unknown related activity",
    "unknown development goal",
    "unknown evidence tag",
    "unknown related lesson",
  ]) {
    assert.ok(
      validation.errors.some((error) => error.includes(expected)),
      `missing validation error: ${expected}`,
    );
  }
});

