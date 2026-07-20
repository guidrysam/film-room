import { buildCanonicalIdentityFingerprint } from "@/lib/academy/catalog-deduplication";
import {
  OPEN_BODY_ASSIGNMENT,
  OPEN_BODY_QUIZ,
  OPEN_BODY_QUIZ_QUESTIONS,
  OPEN_BODY_SMALL_SIDED_GAME,
  OPEN_BODY_TECHNICAL_ACTIVITY,
  OPEN_BODY_WARMUP,
  RECEIVE_OPEN_BODY_LESSON,
} from "@/lib/academy/receive-open-body-content";
import type {
  AcademyActivity,
  AcademyCanonicalObjectType,
  AcademyCanonicalRecord,
  AcademyLessonPackageManifest,
  AcademyWorkflowStatus,
} from "@/lib/academy/types";

export const OPEN_BODY_PACKAGE_ID = "academy-package-receive-open-body";
export const OPEN_BODY_PACKAGE_CREATED_AT = "2026-07-19T12:00:00.000Z";

const ACTIVITIES = [
  OPEN_BODY_WARMUP,
  OPEN_BODY_TECHNICAL_ACTIVITY,
  OPEN_BODY_SMALL_SIDED_GAME,
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
      createdAt: OPEN_BODY_PACKAGE_CREATED_AT,
      updatedAt: OPEN_BODY_PACKAGE_CREATED_AT,
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
      attestedBy: "phase3a-author",
      attestedAt: OPEN_BODY_PACKAGE_CREATED_AT,
    },
    deduplication: {
      identityFingerprint: buildCanonicalIdentityFingerprint({
        objectType: input.objectType,
        title: input.title,
      }),
      decision: "unique",
      comparedCanonicalIds: [],
      confidence: 1,
      reviewedBy: "phase3a-author",
      reviewedAt: OPEN_BODY_PACKAGE_CREATED_AT,
    },
    versionHistory: [
      {
        version: input.payload.version,
        changedAt: OPEN_BODY_PACKAGE_CREATED_AT,
        changedBy: "phase3a-author",
        summary: "Seeded from Phase 3A canonical content modules.",
      },
    ],
    createdAt: OPEN_BODY_PACKAGE_CREATED_AT,
    updatedAt: OPEN_BODY_PACKAGE_CREATED_AT,
  };
}

export function buildOpenBodyPackageManifest(
  status: AcademyWorkflowStatus = "needs_coach_review",
): AcademyLessonPackageManifest {
  return {
    id: OPEN_BODY_PACKAGE_ID,
    version: 1,
    title: "Receive with an Open Body Package",
    summary:
      "Canonical lesson package for u12-receive-open-body, including activities, assignment, and quiz.",
    primaryGoalId: "u12-receive-open-body",
    lessonId: RECEIVE_OPEN_BODY_LESSON.id,
    activityIds: ACTIVITIES.map((activity) => activity.id),
    assignmentId: OPEN_BODY_ASSIGNMENT.id,
    quizId: OPEN_BODY_QUIZ.id,
    questionIds: OPEN_BODY_QUIZ_QUESTIONS.map((question) => question.id),
    memberIds: [
      RECEIVE_OPEN_BODY_LESSON.id,
      ...ACTIVITIES.map((activity) => activity.id),
      OPEN_BODY_ASSIGNMENT.id,
      OPEN_BODY_QUIZ.id,
      ...OPEN_BODY_QUIZ_QUESTIONS.map((question) => question.id),
    ],
    editorial: {
      status,
      originalWording: true,
      originalDiagram: true,
      generatedWithAssistance: true,
      createdAt: OPEN_BODY_PACKAGE_CREATED_AT,
      updatedAt: OPEN_BODY_PACKAGE_CREATED_AT,
    },
  };
}

/**
 * Builds editorial envelopes for the Phase 3A package without inventing new
 * curriculum content. Defaults to needs_coach_review.
 */
export function buildOpenBodyEditorialRecords(
  status: AcademyWorkflowStatus = "needs_coach_review",
): AcademyCanonicalRecord[] {
  const manifest = buildOpenBodyPackageManifest(status);
  return [
    envelope({
      objectType: "lesson",
      title: RECEIVE_OPEN_BODY_LESSON.title,
      payload: withStatus(RECEIVE_OPEN_BODY_LESSON, status),
      status,
    }),
    ...ACTIVITIES.map((activity) =>
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
      title: OPEN_BODY_ASSIGNMENT.title,
      payload: withStatus(OPEN_BODY_ASSIGNMENT, status),
      status,
    }),
    envelope({
      objectType: "quiz",
      title: OPEN_BODY_QUIZ.title,
      payload: withStatus(OPEN_BODY_QUIZ, status),
      status,
    }),
    ...OPEN_BODY_QUIZ_QUESTIONS.map((question) =>
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

export function getOpenBodyPackageMemberRecords(
  records: readonly AcademyCanonicalRecord[],
): AcademyCanonicalRecord[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const packageRecord = byId.get(OPEN_BODY_PACKAGE_ID);
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
