import { buildCanonicalIdentityFingerprint } from "@/lib/academy/catalog-deduplication";
import {
  BALL_AVAILABLE_ASSIGNMENT,
  BALL_AVAILABLE_LESSON,
  BALL_AVAILABLE_PRACTICE_PLAN,
  BALL_AVAILABLE_QUIZ,
  BALL_AVAILABLE_QUIZ_QUESTIONS,
  BALL_AVAILABLE_SSG,
  BALL_AVAILABLE_TECHNICAL,
  BALL_AVAILABLE_WARMUP,
} from "@/lib/academy/block1-ball-available-content";
import {
  SHIELD_PURPOSE_ASSIGNMENT,
  SHIELD_PURPOSE_LESSON,
  SHIELD_PURPOSE_PRACTICE_PLAN,
  SHIELD_PURPOSE_QUIZ,
  SHIELD_PURPOSE_QUIZ_QUESTIONS,
  SHIELD_PURPOSE_SSG,
  SHIELD_PURPOSE_TECHNICAL,
  SHIELD_PURPOSE_WARMUP,
} from "@/lib/academy/block1-shield-purpose-content";
import {
  TURN_ESCAPE_ASSIGNMENT,
  TURN_ESCAPE_LESSON,
  TURN_ESCAPE_PRACTICE_PLAN,
  TURN_ESCAPE_QUIZ,
  TURN_ESCAPE_QUIZ_QUESTIONS,
  TURN_ESCAPE_SSG,
  TURN_ESCAPE_TECHNICAL,
  TURN_ESCAPE_WARMUP,
} from "@/lib/academy/block1-turn-escape-content";
import type {
  AcademyActivity,
  AcademyCanonicalObjectType,
  AcademyCanonicalRecord,
  AcademyLessonPackageManifest,
  AcademyWorkflowStatus,
} from "@/lib/academy/types";

export const BLOCK1_PACKAGE_CREATED_AT = "2026-07-20T18:00:00.000Z";

export const BLOCK1_PACKAGE_IDS = [
  "academy-package-ball-available",
  "academy-package-turn-escape",
  "academy-package-shield-purpose",
] as const;

export type Block1PackageId = (typeof BLOCK1_PACKAGE_IDS)[number];

const CURRICULUM_ID = "film-room-u12-development-v1";
const BLOCK_ID = "u12-curr-block-01-own-the-ball";
const SEQUENCE_ID = "u12-curr-block-01-own-the-ball-seq-01";

const BALL_AVAILABLE_PACKAGE_ID = "academy-package-ball-available";
const TURN_ESCAPE_PACKAGE_ID = "academy-package-turn-escape";
const SHIELD_PURPOSE_PACKAGE_ID = "academy-package-shield-purpose";

const BALL_AVAILABLE_ACTIVITIES = [
  BALL_AVAILABLE_WARMUP,
  BALL_AVAILABLE_TECHNICAL,
  BALL_AVAILABLE_SSG,
] as const;

const TURN_ESCAPE_ACTIVITIES = [
  TURN_ESCAPE_WARMUP,
  TURN_ESCAPE_TECHNICAL,
  TURN_ESCAPE_SSG,
] as const;

const SHIELD_PURPOSE_ACTIVITIES = [
  SHIELD_PURPOSE_WARMUP,
  SHIELD_PURPOSE_TECHNICAL,
  SHIELD_PURPOSE_SSG,
] as const;

function objectTypeForActivity(
  activity: AcademyActivity,
): AcademyCanonicalObjectType {
  switch (activity.category) {
    case "warmup":
      return "warmup";
    case "small_sided_game":
      return "small_sided_game";
    case "conditioned_game":
      return "conditioned_game";
    default:
      return "activity";
  }
}

function withStatus<T extends { editorial: { status: string } }>(
  payload: T,
  status: AcademyWorkflowStatus,
): T {
  return {
    ...payload,
    editorial: {
      ...payload.editorial,
      status,
      createdAt: BLOCK1_PACKAGE_CREATED_AT,
      updatedAt: BLOCK1_PACKAGE_CREATED_AT,
    },
  };
}

function envelope(input: {
  objectType: AcademyCanonicalObjectType;
  title: string;
  payload: { id: string; version: number };
  status?: AcademyWorkflowStatus;
}): AcademyCanonicalRecord {
  const status = input.status ?? "needs_coach_review";
  const lifecycle =
    status === "needs_coach_review" ? "needs_review" : status;
  return {
    id: input.payload.id,
    objectType: input.objectType,
    version: input.payload.version,
    title: input.title,
    lifecycle,
    payload: structuredClone(input.payload),
    sourceProvenance: [],
    sourceCandidateIds: [],
    editorialNotes: [],
    originality: {
      originalWording: true,
      originalDiagram: true,
      attestedBy: "phase-c-author",
      attestedAt: BLOCK1_PACKAGE_CREATED_AT,
    },
    deduplication: {
      identityFingerprint: buildCanonicalIdentityFingerprint({
        objectType: input.objectType,
        title: input.title,
      }),
      decision: "unique",
      comparedCanonicalIds: [],
      confidence: 1,
      reviewedBy: "phase-c-author",
      reviewedAt: BLOCK1_PACKAGE_CREATED_AT,
    },
    versionHistory: [
      {
        version: input.payload.version,
        changedAt: BLOCK1_PACKAGE_CREATED_AT,
        changedBy: "phase-c-author",
        summary: "Seeded from Phase C Block 1 Own the Ball content modules.",
      },
    ],
    createdAt: BLOCK1_PACKAGE_CREATED_AT,
    updatedAt: BLOCK1_PACKAGE_CREATED_AT,
  };
}

function buildPackageManifest(input: {
  id: string;
  title: string;
  summary: string;
  primaryGoalId: string;
  lesson: typeof BALL_AVAILABLE_LESSON;
  activities: readonly AcademyActivity[];
  assignment: typeof BALL_AVAILABLE_ASSIGNMENT;
  quiz: typeof BALL_AVAILABLE_QUIZ;
  questions: typeof BALL_AVAILABLE_QUIZ_QUESTIONS;
  practicePlan: typeof BALL_AVAILABLE_PRACTICE_PLAN;
  sequenceSlotOrder: number;
  priorLessonIds: string[];
  nextLessonIds: string[];
  status?: AcademyWorkflowStatus;
}): AcademyLessonPackageManifest {
  const status = input.status ?? "needs_coach_review";
  return {
    id: input.id,
    version: 1,
    title: input.title,
    summary: input.summary,
    primaryGoalId: input.primaryGoalId,
    lessonId: input.lesson.id,
    activityIds: input.activities.map((activity) => activity.id),
    assignmentId: input.assignment.id,
    quizId: input.quiz.id,
    questionIds: input.questions.map((question) => question.id),
    memberIds: [
      input.lesson.id,
      ...input.activities.map((activity) => activity.id),
      input.assignment.id,
      input.quiz.id,
      ...input.questions.map((question) => question.id),
    ],
    curriculumPlacement: {
      curriculumId: CURRICULUM_ID,
      trainingBlockId: BLOCK_ID,
      learningSequenceId: SEQUENCE_ID,
      sequenceSlotOrder: input.sequenceSlotOrder,
    },
    priorLessonIds: input.priorLessonIds,
    nextLessonIds: input.nextLessonIds,
    practicePlan: input.practicePlan,
    editorial: {
      status,
      originalWording: true,
      originalDiagram: true,
      generatedWithAssistance: true,
      createdAt: BLOCK1_PACKAGE_CREATED_AT,
      updatedAt: BLOCK1_PACKAGE_CREATED_AT,
    },
  };
}

function buildPackageEditorialRecords(input: {
  manifest: AcademyLessonPackageManifest;
  lesson: typeof BALL_AVAILABLE_LESSON;
  activities: readonly AcademyActivity[];
  assignment: typeof BALL_AVAILABLE_ASSIGNMENT;
  quiz: typeof BALL_AVAILABLE_QUIZ;
  questions: typeof BALL_AVAILABLE_QUIZ_QUESTIONS;
  status: AcademyWorkflowStatus;
}): AcademyCanonicalRecord[] {
  const { manifest, lesson, activities, assignment, quiz, questions, status } =
    input;
  return [
    envelope({
      objectType: "lesson",
      title: lesson.title,
      payload: withStatus(lesson, status),
      status,
    }),
    ...activities.map((activity) =>
      envelope({
        objectType: objectTypeForActivity(activity),
        title: activity.title,
        payload: {
          ...withStatus(activity, status),
          ...(status === "approved" || status === "published"
            ? {
                safetyReview: {
                  ...activity.safetyReview,
                  status: "safe" as const,
                  concerns: [],
                  recommendedChanges: [],
                },
              }
            : {}),
        },
        status,
      }),
    ),
    envelope({
      objectType: "assignment",
      title: assignment.title,
      payload: withStatus(assignment, status),
      status,
    }),
    envelope({
      objectType: "quiz",
      title: quiz.title,
      payload: withStatus(quiz, status),
      status,
    }),
    ...questions.map((question) =>
      envelope({
        objectType: "quiz_question",
        title: question.prompt,
        payload: {
          ...withStatus(question, status),
          version: 1,
        },
        status,
      }),
    ),
    envelope({
      objectType: "lesson_package",
      title: manifest.title,
      payload: withStatus(manifest, status),
      status,
    }),
  ];
}

export function buildBallAvailablePackageManifest(
  status: AcademyWorkflowStatus = "needs_coach_review",
): AcademyLessonPackageManifest {
  return buildPackageManifest({
    id: BALL_AVAILABLE_PACKAGE_ID,
    title: "Keep the Ball Available Package",
    summary:
      "Block 1 lesson package for u12-control-across-surfaces — surface control, early scanning, and noticing when the ball is free.",
    primaryGoalId: "u12-control-across-surfaces",
    lesson: BALL_AVAILABLE_LESSON,
    activities: BALL_AVAILABLE_ACTIVITIES,
    assignment: BALL_AVAILABLE_ASSIGNMENT,
    quiz: BALL_AVAILABLE_QUIZ,
    questions: BALL_AVAILABLE_QUIZ_QUESTIONS,
    practicePlan: BALL_AVAILABLE_PRACTICE_PLAN,
    sequenceSlotOrder: 1,
    priorLessonIds: [],
    nextLessonIds: ["u12-lesson-turn-escape"],
    status,
  });
}

export function buildTurnEscapePackageManifest(
  status: AcademyWorkflowStatus = "needs_coach_review",
): AcademyLessonPackageManifest {
  return buildPackageManifest({
    id: TURN_ESCAPE_PACKAGE_ID,
    title: "Turn to Escape Package",
    summary:
      "Block 1 lesson package for u12-change-speed-direction — scan, one sharp turn, and accelerate away from pressure.",
    primaryGoalId: "u12-change-speed-direction",
    lesson: TURN_ESCAPE_LESSON,
    activities: TURN_ESCAPE_ACTIVITIES,
    assignment: TURN_ESCAPE_ASSIGNMENT,
    quiz: TURN_ESCAPE_QUIZ,
    questions: TURN_ESCAPE_QUIZ_QUESTIONS,
    practicePlan: TURN_ESCAPE_PRACTICE_PLAN,
    sequenceSlotOrder: 2,
    priorLessonIds: ["u12-lesson-ball-available"],
    nextLessonIds: ["u12-lesson-shield-purpose"],
    status,
  });
}

export function buildShieldPurposePackageManifest(
  status: AcademyWorkflowStatus = "needs_coach_review",
): AcademyLessonPackageManifest {
  return buildPackageManifest({
    id: SHIELD_PURPOSE_PACKAGE_ID,
    title: "Shield with a Purpose Package",
    summary:
      "Block 1 lesson package for u12-shield-and-retain — body shape, safe foot, and intentional release under pressure.",
    primaryGoalId: "u12-shield-and-retain",
    lesson: SHIELD_PURPOSE_LESSON,
    activities: SHIELD_PURPOSE_ACTIVITIES,
    assignment: SHIELD_PURPOSE_ASSIGNMENT,
    quiz: SHIELD_PURPOSE_QUIZ,
    questions: SHIELD_PURPOSE_QUIZ_QUESTIONS,
    practicePlan: SHIELD_PURPOSE_PRACTICE_PLAN,
    sequenceSlotOrder: 3,
    priorLessonIds: ["u12-lesson-turn-escape"],
    nextLessonIds: ["u12-lesson-scan-early"],
    status,
  });
}

/**
 * Builds editorial envelopes for all three Block 1 packages without publishing.
 * Defaults to needs_coach_review.
 */
export function buildBlock1EditorialRecords(
  status: AcademyWorkflowStatus = "needs_coach_review",
): AcademyCanonicalRecord[] {
  const ballAvailableManifest = buildBallAvailablePackageManifest(status);
  const turnEscapeManifest = buildTurnEscapePackageManifest(status);
  const shieldPurposeManifest = buildShieldPurposePackageManifest(status);

  return [
    ...buildPackageEditorialRecords({
      manifest: ballAvailableManifest,
      lesson: BALL_AVAILABLE_LESSON,
      activities: BALL_AVAILABLE_ACTIVITIES,
      assignment: BALL_AVAILABLE_ASSIGNMENT,
      quiz: BALL_AVAILABLE_QUIZ,
      questions: BALL_AVAILABLE_QUIZ_QUESTIONS,
      status,
    }),
    ...buildPackageEditorialRecords({
      manifest: turnEscapeManifest,
      lesson: TURN_ESCAPE_LESSON,
      activities: TURN_ESCAPE_ACTIVITIES,
      assignment: TURN_ESCAPE_ASSIGNMENT,
      quiz: TURN_ESCAPE_QUIZ,
      questions: TURN_ESCAPE_QUIZ_QUESTIONS,
      status,
    }),
    ...buildPackageEditorialRecords({
      manifest: shieldPurposeManifest,
      lesson: SHIELD_PURPOSE_LESSON,
      activities: SHIELD_PURPOSE_ACTIVITIES,
      assignment: SHIELD_PURPOSE_ASSIGNMENT,
      quiz: SHIELD_PURPOSE_QUIZ,
      questions: SHIELD_PURPOSE_QUIZ_QUESTIONS,
      status,
    }),
  ];
}

export function getBlock1AuthoredPackages() {
  return [
    {
      manifest: buildBallAvailablePackageManifest(),
      lesson: BALL_AVAILABLE_LESSON,
      activities: BALL_AVAILABLE_ACTIVITIES,
      assignment: BALL_AVAILABLE_ASSIGNMENT,
      quiz: BALL_AVAILABLE_QUIZ,
      questions: BALL_AVAILABLE_QUIZ_QUESTIONS,
    },
    {
      manifest: buildTurnEscapePackageManifest(),
      lesson: TURN_ESCAPE_LESSON,
      activities: TURN_ESCAPE_ACTIVITIES,
      assignment: TURN_ESCAPE_ASSIGNMENT,
      quiz: TURN_ESCAPE_QUIZ,
      questions: TURN_ESCAPE_QUIZ_QUESTIONS,
    },
    {
      manifest: buildShieldPurposePackageManifest(),
      lesson: SHIELD_PURPOSE_LESSON,
      activities: SHIELD_PURPOSE_ACTIVITIES,
      assignment: SHIELD_PURPOSE_ASSIGNMENT,
      quiz: SHIELD_PURPOSE_QUIZ,
      questions: SHIELD_PURPOSE_QUIZ_QUESTIONS,
    },
  ] as const;
}

export function getBlock1PackageMemberRecords(
  records: readonly AcademyCanonicalRecord[],
  packageId: Block1PackageId,
): AcademyCanonicalRecord[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const packageRecord = byId.get(packageId);
  if (!packageRecord) return [];
  const payload = packageRecord.payload as AcademyLessonPackageManifest;
  return [
    packageRecord,
    ...payload.memberIds.flatMap((id) => {
      const record = byId.get(id);
      return record ? [record] : [];
    }),
  ];
}
