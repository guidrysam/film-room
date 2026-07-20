import {
  OPEN_BODY_SMALL_SIDED_GAME,
  OPEN_BODY_TECHNICAL_ACTIVITY,
  OPEN_BODY_WARMUP,
} from "@/lib/academy/receive-open-body-content";
import {
  BALL_AVAILABLE_SSG,
  BALL_AVAILABLE_TECHNICAL,
  BALL_AVAILABLE_WARMUP,
} from "@/lib/academy/block1-ball-available-content";
import {
  SHIELD_PURPOSE_SSG,
  SHIELD_PURPOSE_TECHNICAL,
  SHIELD_PURPOSE_WARMUP,
} from "@/lib/academy/block1-shield-purpose-content";
import {
  TURN_ESCAPE_SSG,
  TURN_ESCAPE_TECHNICAL,
  TURN_ESCAPE_WARMUP,
} from "@/lib/academy/block1-turn-escape-content";
import type {
  AcademyActivity,
  AcademyActivityCategory,
  AcademyEditorialStatus,
} from "@/lib/academy/types";

export const ACADEMY_ACTIVITY_CATEGORY_LABELS: Record<
  AcademyActivityCategory,
  string
> = {
  warmup: "Warmup",
  technical: "Technical Activity",
  possession: "Possession Activity",
  small_sided_game: "Small-Sided Game",
  finishing: "Finishing Activity",
  defending: "Defending Activity",
  transition: "Transition Activity",
  goalkeeper: "Goalkeeper Activity",
  conditioned_game: "Conditioned Game",
};

export type AcademyActivityLibraryFilters = {
  query?: string;
  category?: AcademyActivityCategory;
  ageBand?: string;
  difficulty?: AcademyActivity["difficulty"];
  developmentGoalId?: string;
  editorialStatus?: AcademyEditorialStatus;
};

const ACTIVITIES: readonly AcademyActivity[] = [
  OPEN_BODY_WARMUP,
  OPEN_BODY_TECHNICAL_ACTIVITY,
  OPEN_BODY_SMALL_SIDED_GAME,
  BALL_AVAILABLE_WARMUP,
  BALL_AVAILABLE_TECHNICAL,
  BALL_AVAILABLE_SSG,
  TURN_ESCAPE_WARMUP,
  TURN_ESCAPE_TECHNICAL,
  TURN_ESCAPE_SSG,
  SHIELD_PURPOSE_WARMUP,
  SHIELD_PURPOSE_TECHNICAL,
  SHIELD_PURPOSE_SSG,
];

const activityById = new Map(
  ACTIVITIES.map((activity) => [activity.id, activity]),
);

export const CANONICAL_ACTIVITY_LIBRARY: readonly AcademyActivity[] =
  Object.freeze([...ACTIVITIES]);

export function getCanonicalActivity(
  activityId: string,
): AcademyActivity | undefined {
  return activityById.get(activityId);
}

export function filterCanonicalActivities(
  filters: AcademyActivityLibraryFilters,
): AcademyActivity[] {
  const query = filters.query?.trim().toLowerCase();
  return CANONICAL_ACTIVITY_LIBRARY.filter((activity) => {
    if (filters.category && activity.category !== filters.category) return false;
    if (filters.ageBand && !activity.ageBands.includes(filters.ageBand)) {
      return false;
    }
    if (
      filters.difficulty &&
      activity.difficulty !== filters.difficulty
    ) {
      return false;
    }
    if (
      filters.developmentGoalId &&
      !activity.goalIds.includes(filters.developmentGoalId)
    ) {
      return false;
    }
    if (
      filters.editorialStatus &&
      activity.editorial.status !== filters.editorialStatus
    ) {
      return false;
    }
    if (!query) return true;
    return [
      activity.id,
      activity.title,
      activity.summary,
      activity.description,
      ACADEMY_ACTIVITY_CATEGORY_LABELS[activity.category],
      ...activity.searchTags,
      ...activity.coachingPoints,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function getActivitiesForLesson(
  lessonId: string,
): AcademyActivity[] {
  return CANONICAL_ACTIVITY_LIBRARY.filter((activity) =>
    activity.relatedLessonIds.includes(lessonId),
  );
}

export function getActivitiesForPracticeTemplate(
  practiceTemplateId: string,
): AcademyActivity[] {
  return CANONICAL_ACTIVITY_LIBRARY.filter((activity) =>
    activity.relatedPracticeTemplateIds.includes(practiceTemplateId),
  );
}

export function getActivitiesForDevelopmentGoals(
  goalIds: readonly string[],
): AcademyActivity[] {
  const requested = new Set(goalIds);
  return CANONICAL_ACTIVITY_LIBRARY.filter((activity) =>
    activity.goalIds.some((goalId) => requested.has(goalId)),
  );
}

