import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { TEAM_ACADEMY_COLLECTIONS } from "@/lib/academy/team-data";
import type {
  AcademyFilmEvidenceAttachment,
  AcademyPublishedAssignmentRecord,
  AcademyPublishedPracticeDraft,
  AcademyQuizSubmissionRecord,
} from "@/lib/academy/types";
import type { PublishedLessonRecommendation } from "@/lib/academy/evidence-recommendations";

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export async function listConfirmedFilmEvidence(
  teamId: string,
): Promise<AcademyFilmEvidenceAttachment[]> {
  if (!teamId.trim()) return [];
  const snapshot = await getDocs(
    collection(
      firestore,
      "teams",
      teamId,
      TEAM_ACADEMY_COLLECTIONS.filmEvidence,
    ),
  );
  return snapshot.docs.map((document) => {
    const data = document.data() as Omit<AcademyFilmEvidenceAttachment, "id">;
    return { ...data, id: document.id };
  });
}

export async function listAcademyQuizSubmissions(
  teamId: string,
): Promise<AcademyQuizSubmissionRecord[]> {
  const snapshot = await getDocs(
    collection(
      firestore,
      "teams",
      teamId,
      TEAM_ACADEMY_COLLECTIONS.quizAssignments,
    ),
  );
  return snapshot.docs.map((document) => {
    const data = document.data() as Omit<AcademyQuizSubmissionRecord, "id">;
    return { ...data, id: document.id };
  });
}

export function assemblePublishedPackagePractice(input: {
  recommendation: PublishedLessonRecommendation;
  createdBy: string;
  coachNotes?: string;
  id?: string;
}): Omit<
  AcademyPublishedPracticeDraft,
  "createdAt" | "updatedAt"
> {
  const { recommendation } = input;
  const activities = recommendation.lesson.activities;
  if (activities.length !== 3) {
    throw new Error(
      "Published lesson practice requires all three canonical activities.",
    );
  }
  const activitySequence = recommendation.lesson.lesson.activityIds.map(
    (activityId, order) => {
      const activity = activities.find((item) => item.id === activityId);
      if (!activity) {
        throw new Error(`Missing published activity ${activityId}.`);
      }
      return {
        activityId,
        activityVersion: activity.version,
        order: order + 1,
        durationMinutes: activity.durationMinutes.default,
      };
    },
  );
  return {
    id:
      input.id ??
      `practice-${recommendation.goal.id}-${Date.now().toString(36)}`,
    teamId: recommendation.teamId,
    title: `Teaching Opportunity: ${recommendation.goal.title}`,
    status: "draft",
    developmentGoalId: recommendation.goal.id,
    lessonId: recommendation.lesson.lesson.id,
    publishedRelease: recommendation.publishedRelease,
    activitySequence,
    estimatedTotalDurationMinutes: activitySequence.reduce(
      (sum, activity) => sum + activity.durationMinutes,
      0,
    ),
    equipment: unique(
      activities.flatMap((activity) => activity.equipment),
    ),
    coachingPoints: unique([
      ...recommendation.lesson.lesson.coachingPoints,
      ...activities.flatMap((activity) => activity.coachingPoints),
    ]),
    supportingEvidence: recommendation.supportingEvidence.map((evidence) => ({
      evidenceId: evidence.id,
      gameId: evidence.filmReference.gameId,
      ...(evidence.filmReference.timelineEventId
        ? { timelineEventId: evidence.filmReference.timelineEventId }
        : {}),
      ...(evidence.filmReference.highlightId
        ? { highlightId: evidence.filmReference.highlightId }
        : {}),
      ...(evidence.filmReference.momentId
        ? { momentId: evidence.filmReference.momentId }
        : {}),
      ...(evidence.filmReference.gameTimeSec !== undefined
        ? { gameTimeSec: evidence.filmReference.gameTimeSec }
        : {}),
      evidenceTagIds: evidence.evidenceTagIds,
    })),
    coachNotes: input.coachNotes?.trim() ?? "",
    coachModifications: {},
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
    academyPresetId: recommendation.publishedRelease.catalogId,
    academyPresetVersion: recommendation.publishedRelease.catalogVersion,
  };
}

export async function savePublishedPackagePractice(input: {
  recommendation: PublishedLessonRecommendation;
  createdBy: string;
  coachNotes?: string;
}): Promise<AcademyPublishedPracticeDraft> {
  const draft = assemblePublishedPackagePractice(input);
  const reference = doc(
    firestore,
    "teams",
    draft.teamId,
    TEAM_ACADEMY_COLLECTIONS.plans,
    draft.id,
  );
  const payload = {
    ...draft,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(reference, payload);
  return {
    ...draft,
    createdAt: payload.createdAt as Timestamp,
    updatedAt: payload.updatedAt as Timestamp,
  };
}

export function buildPublishedAssignmentRecord(input: {
  recommendation: PublishedLessonRecommendation;
  assignedBy: string;
  assignedPlayerIds?: readonly string[];
  entireTeam?: boolean;
  dueAt?: Date;
  id?: string;
}): Omit<AcademyPublishedAssignmentRecord, "assignedAt"> {
  const template = input.recommendation.lesson.assignment;
  if (!template) {
    throw new Error("Published lesson assignment is unavailable.");
  }
  const playerIds = unique(input.assignedPlayerIds ?? []);
  if (!input.entireTeam && !playerIds.length) {
    throw new Error("Select at least one player or the entire team.");
  }
  return {
    id:
      input.id ??
      `assignment-${template.id}-${Date.now().toString(36)}`,
    teamId: input.recommendation.teamId,
    assignmentId: template.id,
    assignmentVersion: template.version,
    lessonId: input.recommendation.lesson.lesson.id,
    developmentGoalId: input.recommendation.goal.id,
    audience: input.entireTeam ? "team" : "players",
    assignedPlayerIds: input.entireTeam ? [] : playerIds,
    assignedBy: input.assignedBy,
    ...(input.dueAt ? { dueAt: Timestamp.fromDate(input.dueAt) } : {}),
    completionByPlayerId: Object.fromEntries(
      playerIds.map((playerId) => [playerId, { status: "assigned" as const }]),
    ),
    publishedRelease: {
      catalogId: input.recommendation.publishedRelease.catalogId,
      catalogVersion: input.recommendation.publishedRelease.catalogVersion,
    },
  };
}

export async function savePublishedAssignment(input: {
  recommendation: PublishedLessonRecommendation;
  assignedBy: string;
  assignedPlayerIds?: readonly string[];
  entireTeam?: boolean;
  dueAt?: Date;
}): Promise<AcademyPublishedAssignmentRecord> {
  const assignment = buildPublishedAssignmentRecord(input);
  const reference = doc(
    firestore,
    "teams",
    assignment.teamId,
    TEAM_ACADEMY_COLLECTIONS.assignments,
    assignment.id,
  );
  const payload = { ...assignment, assignedAt: serverTimestamp() };
  await setDoc(reference, payload);
  return {
    ...assignment,
    assignedAt: payload.assignedAt as Timestamp,
  };
}

export async function saveRecommendationDecision(input: {
  teamId: string;
  recommendationId: string;
  goalId: string;
  lessonId: string;
  actor: string;
  decision: "dismissed" | "current_focus";
}): Promise<void> {
  const reference = doc(
    firestore,
    "teams",
    input.teamId,
    TEAM_ACADEMY_COLLECTIONS.recommendationState,
    input.recommendationId.replaceAll(":", "_"),
  );
  await setDoc(
    reference,
    {
      ...input,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
