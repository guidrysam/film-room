import { resolveGoalsForEvidenceTags } from "@/lib/academy/film-evidence";
import {
  getPublishedLessonPackageView,
  listPublishedLessons,
  type PublishedLessonPackageView,
} from "@/lib/academy/published-content";
import type {
  AcademyFilmEvidenceAttachment,
  AcademyFilmReference,
  AcademyGameEvidenceTag,
  AcademyGoal,
  PublishedAcademyCatalog,
} from "@/lib/academy/types";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

export type EvidenceRecommendationStrength =
  | "Strong match"
  | "Repeated need"
  | "Recent teaching opportunity"
  | "Coach-selected priority";

export type ConfirmedEvidenceInput = {
  id: string;
  evidenceTagIds: string[];
  filmReference: AcademyFilmReference;
  playerIds?: string[];
  personIds?: string[];
  note?: string;
  confirmedAt?: string | Date | { toDate(): Date };
};

export type EvidenceTrace = {
  evidenceId: string;
  evidenceTagId: string;
  evidenceTagLabel: string;
  developmentGoalId: string;
  developmentGoalTitle: string;
  lessonId: string;
  lessonTitle: string;
  filmReference: AcademyFilmReference;
  note?: string;
};

export type PublishedLessonRecommendation = {
  id: string;
  teamId: string;
  playerId?: string;
  goal: AcademyGoal;
  lesson: PublishedLessonPackageView;
  supportingEvidence: ConfirmedEvidenceInput[];
  distinctEvidenceTagIds: string[];
  confirmedMomentCount: number;
  gameIds: string[];
  strength: EvidenceRecommendationStrength;
  strengthReasons: EvidenceRecommendationStrength[];
  reasons: string[];
  traces: EvidenceTrace[];
  publishedRelease: {
    catalogId: string;
    catalogVersion: number;
    lessonVersion: number;
  };
};

export type EvidenceRecommendationResolution = {
  teamId: string;
  recommendations: PublishedLessonRecommendation[];
  resolvedGoalsWithoutPublishedLesson: AcademyGoal[];
  ignoredEvidenceTagIds: string[];
};

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function dateFromEvidence(
  value: ConfirmedEvidenceInput["confirmedAt"],
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  try {
    return value.toDate();
  } catch {
    return null;
  }
}

function momentIdentity(evidence: ConfirmedEvidenceInput): string {
  const ref = evidence.filmReference;
  return [
    ref.gameId,
    ref.timelineEventId ?? "",
    ref.highlightId ?? "",
    ref.momentId ?? "",
    ref.gameTimeSec ?? "",
  ].join("|");
}

function rankRecommendation(input: {
  distinctTagCount: number;
  distinctMomentCount: number;
  mostRecent: Date | null;
  coachPriority: boolean;
  now: Date;
}): {
  strength: EvidenceRecommendationStrength;
  reasons: EvidenceRecommendationStrength[];
} {
  const reasons: EvidenceRecommendationStrength[] = [];
  if (input.coachPriority) reasons.push("Coach-selected priority");
  if (input.distinctMomentCount >= 2) reasons.push("Repeated need");
  if (
    input.mostRecent &&
    input.now.getTime() - input.mostRecent.getTime() <=
      14 * 24 * 60 * 60 * 1000
  ) {
    reasons.push("Recent teaching opportunity");
  }
  if (input.distinctTagCount >= 2 || input.distinctMomentCount >= 2) {
    reasons.push("Strong match");
  }
  const strength =
    reasons[0] ??
    (input.distinctMomentCount === 1
      ? "Recent teaching opportunity"
      : "Strong match");
  return { strength, reasons: unique([strength, ...reasons]) };
}

function asConfirmedEvidence(
  attachment: AcademyFilmEvidenceAttachment,
): ConfirmedEvidenceInput {
  return {
    id: attachment.id,
    evidenceTagIds: attachment.evidenceTagIds,
    filmReference: attachment.filmReference,
    playerIds: attachment.playerIds,
    personIds: attachment.personIds,
    note: attachment.note,
    confirmedAt: attachment.createdAt,
  };
}

/**
 * Deterministic, graph-authoritative resolver:
 * confirmed evidence → canonical tags → development goals → published lessons.
 */
export function resolvePublishedLessonRecommendations(input: {
  teamId: string;
  confirmedEvidence: readonly ConfirmedEvidenceInput[];
  playerId?: string;
  gameId?: string;
  coachPriorityGoalIds?: readonly string[];
  publishedCatalog: PublishedAcademyCatalog;
  now?: Date;
}): EvidenceRecommendationResolution {
  if (!input.teamId.trim()) {
    throw new Error("teamId is required.");
  }
  const tagById = new Map(
    U12_ACADEMY_GOAL_CATALOG.evidenceTags.map((tag) => [tag.id, tag]),
  );
  const filteredEvidence = input.confirmedEvidence.filter((evidence) => {
    if (
      input.gameId &&
      evidence.filmReference.gameId !== input.gameId
    ) {
      return false;
    }
    if (
      input.playerId &&
      !evidence.playerIds?.includes(input.playerId) &&
      !evidence.personIds?.includes(input.playerId)
    ) {
      return false;
    }
    return true;
  });
  const validTagIds = unique(
    filteredEvidence.flatMap((evidence) =>
      evidence.evidenceTagIds.filter((tagId) => tagById.has(tagId)),
    ),
  );
  const ignoredEvidenceTagIds = unique(
    filteredEvidence
      .flatMap((evidence) => evidence.evidenceTagIds)
      .filter((tagId) => !tagById.has(tagId)),
  );
  const goals = resolveGoalsForEvidenceTags(
    U12_ACADEMY_GOAL_CATALOG,
    validTagIds,
  );
  const publishedLessons = listPublishedLessons(input.publishedCatalog);
  const priorityGoals = new Set(input.coachPriorityGoalIds ?? []);
  const now = input.now ?? new Date();
  const recommendations: PublishedLessonRecommendation[] = [];
  const resolvedGoalsWithoutPublishedLesson: AcademyGoal[] = [];

  for (const goal of goals) {
    const lesson = publishedLessons.find((candidate) =>
      candidate.goalIds.includes(goal.id),
    );
    if (!lesson) {
      resolvedGoalsWithoutPublishedLesson.push(goal);
      continue;
    }
    const lessonView = getPublishedLessonPackageView(
      lesson.id,
      input.publishedCatalog,
    );
    if (!lessonView) {
      resolvedGoalsWithoutPublishedLesson.push(goal);
      continue;
    }
    const completePackage =
      lessonView.activities.length === lesson.activityIds.length &&
      (!lesson.relatedAssignmentIds.length || Boolean(lessonView.assignment)) &&
      (!lesson.relatedQuizIds.length ||
        (Boolean(lessonView.quiz) &&
          lessonView.questions.length === lessonView.quiz?.questionIds.length));
    if (!completePackage) {
      resolvedGoalsWithoutPublishedLesson.push(goal);
      continue;
    }
    const supportingEvidence = filteredEvidence.filter((evidence) =>
      evidence.evidenceTagIds.some((tagId) =>
        tagById.get(tagId)?.applicableGoalIds.includes(goal.id),
      ),
    );
    const distinctEvidenceTagIds = unique(
      supportingEvidence.flatMap((evidence) =>
        evidence.evidenceTagIds.filter((tagId) =>
          tagById.get(tagId)?.applicableGoalIds.includes(goal.id),
        ),
      ),
    );
    const distinctMomentCount = new Set(
      supportingEvidence.map(momentIdentity),
    ).size;
    const dates = supportingEvidence
      .map((evidence) => dateFromEvidence(evidence.confirmedAt))
      .filter((date): date is Date => Boolean(date));
    const mostRecent = dates.length
      ? new Date(Math.max(...dates.map((date) => date.getTime())))
      : null;
    const ranking = rankRecommendation({
      distinctTagCount: distinctEvidenceTagIds.length,
      distinctMomentCount,
      mostRecent,
      coachPriority: priorityGoals.has(goal.id),
      now,
    });
    const traces = supportingEvidence.flatMap((evidence) =>
      evidence.evidenceTagIds.flatMap((tagId) => {
        const tag = tagById.get(tagId);
        if (!tag?.applicableGoalIds.includes(goal.id)) return [];
        return [
          {
            evidenceId: evidence.id,
            evidenceTagId: tag.id,
            evidenceTagLabel: tag.label,
            developmentGoalId: goal.id,
            developmentGoalTitle: goal.title,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            filmReference: evidence.filmReference,
            note: evidence.note,
          },
        ];
      }),
    );
    recommendations.push({
      id: `${input.teamId}:${goal.id}:${lesson.id}`,
      teamId: input.teamId,
      playerId: input.playerId,
      goal,
      lesson: lessonView,
      supportingEvidence,
      distinctEvidenceTagIds,
      confirmedMomentCount: distinctMomentCount,
      gameIds: unique(
        supportingEvidence.map(
          (evidence) => evidence.filmReference.gameId,
        ),
      ),
      strength: ranking.strength,
      strengthReasons: ranking.reasons,
      reasons: [
        ...distinctEvidenceTagIds.map(
          (tagId) =>
            `Coach confirmed ${tagId} (${tagById.get(tagId)?.label ?? tagId}).`,
        ),
        `Evidence maps to ${goal.id} (${goal.title}).`,
        `Published lesson ${lesson.title} addresses that Development Goal.`,
      ],
      traces,
      publishedRelease: {
        catalogId: input.publishedCatalog.catalogId,
        catalogVersion: input.publishedCatalog.catalogVersion,
        lessonVersion: lesson.version,
      },
    });
  }

  return {
    teamId: input.teamId,
    recommendations: recommendations.sort(
      (left, right) =>
        right.confirmedMomentCount - left.confirmedMomentCount ||
        left.lesson.lesson.title.localeCompare(right.lesson.lesson.title),
    ),
    resolvedGoalsWithoutPublishedLesson,
    ignoredEvidenceTagIds,
  };
}

export function resolveRecommendationsFromAttachments(input: {
  teamId: string;
  attachments: readonly AcademyFilmEvidenceAttachment[];
  playerId?: string;
  gameId?: string;
  coachPriorityGoalIds?: readonly string[];
  publishedCatalog: PublishedAcademyCatalog;
  now?: Date;
}): EvidenceRecommendationResolution {
  return resolvePublishedLessonRecommendations({
    ...input,
    confirmedEvidence: input.attachments.map(asConfirmedEvidence),
  });
}

export function evidenceTagForTrace(
  trace: EvidenceTrace,
): AcademyGameEvidenceTag | undefined {
  return U12_ACADEMY_GOAL_CATALOG.evidenceTags.find(
    (tag) => tag.id === trace.evidenceTagId,
  );
}
