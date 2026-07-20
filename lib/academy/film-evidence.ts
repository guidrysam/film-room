import type { GameTimelineEvent } from "@/lib/games";
import type { GameStatType } from "@/lib/game-stats";
import type {
  AcademyFilmEvidenceAttachment,
  AcademyFilmReference,
  AcademyGameEvidenceEventType,
  AcademyGameEvidenceTag,
  AcademyGoal,
  AcademyGoalGraphCatalog,
} from "@/lib/academy/types";

export type FilmEvidenceSuggestion = {
  eventTypes: AcademyGameEvidenceEventType[];
  suggestedTagIds: string[];
  suggestedGoalIds: string[];
  confidence: "high" | "medium" | "low";
  notes: string[];
};

export type DevelopmentFollowUpRecommendation = {
  goalIds: string[];
  primaryGoalIds: string[];
  relatedGoalIds: string[];
  improvementGoalIds: string[];
  positiveGoalIds: string[];
  recommendedLessonCount: number;
  recommendedDrillCount: number;
  assignmentSuitability: Array<"filmStudy" | "quiz" | "reflection" | "homePractice" | "partnerPractice">;
  practicePrimaryGoalIds: string[];
  coachCues: string[];
  feedbackExamples: string[];
  warnings: string[];
};

const STAT_TO_ACADEMY_EVENTS: Partial<
  Record<GameStatType, AcademyGameEvidenceEventType[]>
> = {
  goal: ["goal", "shot"],
  shot: ["shot"],
  shot_on_goal: ["shot"],
  corner: ["corner"],
  turnover: ["turnover"],
  defensive_stop: ["defensive_action", "duel"],
  key_pass: ["pass"],
  assist: ["pass"],
  save: ["shot", "recovery"],
};

const LABEL_HINTS: Array<{
  pattern: RegExp;
  eventTypes: AcademyGameEvidenceEventType[];
}> = [
  { pattern: /\bcorner\b/i, eventTypes: ["corner"] },
  { pattern: /\bturnover\b|\blost\b|\bgiveaway\b/i, eventTypes: ["turnover"] },
  { pattern: /\brecover|regain|won\b/i, eventTypes: ["recovery", "transition"] },
  { pattern: /\btransition|counter\b/i, eventTypes: ["transition"] },
  { pattern: /\bbuild.?up|goal.?kick|from the back\b/i, eventTypes: ["buildup"] },
  { pattern: /\breceiv|first touch\b/i, eventTypes: ["receive"] },
  { pattern: /\bpass|combine|switch\b/i, eventTypes: ["pass"] },
  { pattern: /\b1\s*v\s*1|duel|tackle\b/i, eventTypes: ["duel"] },
  { pattern: /\bdefend|press|cover|shape\b/i, eventTypes: ["defensive_action"] },
  { pattern: /\bshot|finish|scoring\b/i, eventTypes: ["shot"] },
  { pattern: /\bgreat play|teaching|clip\b/i, eventTypes: ["coach_clip"] },
];

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function filmReferenceFromTimelineEvent(
  gameId: string,
  event: Pick<GameTimelineEvent, "id" | "t" | "sourceId">,
): AcademyFilmReference {
  return {
    gameId,
    timelineEventId: event.id,
    ...(event.sourceId ? { sourceId: event.sourceId } : {}),
    gameTimeSec: event.t,
  };
}

export function filmReferenceFromHighlightMoment(input: {
  gameId: string;
  highlightId: string;
  momentId: string;
  gameTimeSec: number;
  sourceId?: string;
}): AcademyFilmReference {
  return {
    gameId: input.gameId,
    highlightId: input.highlightId,
    momentId: input.momentId,
    gameTimeSec: input.gameTimeSec,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
  };
}

/**
 * Infer Academy teaching event types from a native Film Room timeline event.
 * Does not invent advanced tactical intent — returns coarse event families only.
 */
export function inferAcademyEventTypesFromTimelineEvent(
  event: GameTimelineEvent,
): AcademyGameEvidenceEventType[] {
  const inferred: AcademyGameEvidenceEventType[] = [];
  if (event.type === "stat") {
    const statType = event.payload?.statType;
    if (typeof statType === "string" && statType in STAT_TO_ACADEMY_EVENTS) {
      inferred.push(
        ...(STAT_TO_ACADEMY_EVENTS[statType as GameStatType] ?? []),
      );
    }
  }
  if (event.type === "coach_mark" || event.type === "note" || event.type === "tag") {
    inferred.push("coach_clip");
  }
  const label = `${event.label ?? ""} ${
    typeof event.payload?.note === "string" ? event.payload.note : ""
  }`;
  for (const hint of LABEL_HINTS) {
    if (hint.pattern.test(label)) inferred.push(...hint.eventTypes);
  }
  return unique(inferred.length ? inferred : (["coach_clip"] as const));
}

export function suggestEvidenceTagsForEventTypes(
  catalog: AcademyGoalGraphCatalog,
  eventTypes: readonly AcademyGameEvidenceEventType[],
  options?: {
    category?: AcademyGameEvidenceTag["category"];
    domainIds?: readonly string[];
    priorityGoalIds?: readonly string[];
    limit?: number;
  },
): AcademyGameEvidenceTag[] {
  const eventSet = new Set(eventTypes);
  const domainSet = options?.domainIds
    ? new Set(options.domainIds)
    : null;
  const priorityGoals = new Set(options?.priorityGoalIds ?? []);
  const goalById = new Map(catalog.goals.map((goal) => [goal.id, goal]));
  const matches = catalog.evidenceTags.filter((tag) => {
    if (options?.category && tag.category !== options.category) return false;
    if (!tag.applicableEventTypes.some((type) => eventSet.has(type))) {
      return false;
    }
    if (domainSet) {
      return tag.applicableGoalIds.some((goalId) => {
        const goal = goalById.get(goalId);
        return goal ? domainSet.has(goal.domainId) : false;
      });
    }
    return true;
  });
  const scored = matches.map((tag, index) => {
    const eventOverlap = tag.applicableEventTypes.filter((type) =>
      eventSet.has(type),
    ).length;
    const priorityOverlap = tag.applicableGoalIds.filter((goalId) =>
      priorityGoals.has(goalId),
    ).length;
    // Prefer specific families over broad coach_clip-only matches.
    const specificity =
      tag.applicableEventTypes.includes("coach_clip") &&
      tag.applicableEventTypes.length === 1
        ? 0
        : 2;
    return {
      tag,
      score: priorityOverlap * 8 + eventOverlap * 3 + specificity,
      index,
    };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const limit = options?.limit ?? 12;
  return scored.slice(0, limit).map((entry) => entry.tag);
}

export function resolveGoalsForEvidenceTags(
  catalog: AcademyGoalGraphCatalog,
  evidenceTagIds: readonly string[],
): AcademyGoal[] {
  const tagById = new Map(catalog.evidenceTags.map((tag) => [tag.id, tag]));
  const goalIds = unique(
    evidenceTagIds.flatMap((tagId) => tagById.get(tagId)?.applicableGoalIds ?? []),
  );
  const goalById = new Map(catalog.goals.map((goal) => [goal.id, goal]));
  return goalIds
    .map((goalId) => goalById.get(goalId))
    .filter((goal): goal is AcademyGoal => Boolean(goal));
}

export function suggestFilmEvidence(
  catalog: AcademyGoalGraphCatalog,
  event: GameTimelineEvent,
  options?: {
    category?: AcademyGameEvidenceTag["category"];
    limit?: number;
  },
): FilmEvidenceSuggestion {
  const eventTypes = inferAcademyEventTypesFromTimelineEvent(event);
  const tags = suggestEvidenceTagsForEventTypes(catalog, eventTypes, {
    category: options?.category,
    limit: options?.limit ?? 8,
  });
  const goals = resolveGoalsForEvidenceTags(
    catalog,
    tags.map((tag) => tag.id),
  );
  const confidence: FilmEvidenceSuggestion["confidence"] =
    event.type === "stat" && eventTypes.some((type) => type !== "coach_clip")
      ? "medium"
      : eventTypes.length > 1
        ? "medium"
        : "low";
  return {
    eventTypes,
    suggestedTagIds: tags.map((tag) => tag.id),
    suggestedGoalIds: goals.map((goal) => goal.id),
    confidence,
    notes: [
      "Suggestions are event-family filters only. Coaches must confirm the teaching tag.",
      "Automated video passes cannot reliably identify advanced tactical intent.",
    ],
  };
}

export function resolveAttachmentGoalIds(
  catalog: AcademyGoalGraphCatalog,
  attachment: Pick<AcademyFilmEvidenceAttachment, "evidenceTagIds" | "goalIds">,
): string[] {
  if (attachment.goalIds?.length) return unique(attachment.goalIds);
  return resolveGoalsForEvidenceTags(catalog, attachment.evidenceTagIds).map(
    (goal) => goal.id,
  );
}

/**
 * Turn confirmed film evidence into development follow-ups for practice,
 * individual assignments, and later content selection.
 */
export function recommendDevelopmentFollowUps(
  catalog: AcademyGoalGraphCatalog,
  evidenceTagIds: readonly string[],
  options?: { maxPrimaryGoals?: number },
): DevelopmentFollowUpRecommendation {
  const tagById = new Map(catalog.evidenceTags.map((tag) => [tag.id, tag]));
  const goals = resolveGoalsForEvidenceTags(catalog, evidenceTagIds);
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const improvementGoalIds: string[] = [];
  const positiveGoalIds: string[] = [];
  for (const tagId of evidenceTagIds) {
    const tag = tagById.get(tagId);
    if (!tag) continue;
    for (const goalId of tag.applicableGoalIds) {
      if (!goalById.has(goalId)) continue;
      if (tag.category === "improvement") improvementGoalIds.push(goalId);
      if (tag.category === "positive") positiveGoalIds.push(goalId);
    }
  }
  const orderedGoalIds = unique([
    ...improvementGoalIds,
    ...positiveGoalIds,
    ...goals.map((goal) => goal.id),
  ]);
  const maxPrimary = options?.maxPrimaryGoals ?? 2;
  const primaryGoalIds = orderedGoalIds.slice(0, maxPrimary);
  const relatedGoalIds = unique(
    primaryGoalIds.flatMap(
      (goalId) => goalById.get(goalId)?.relatedGoalIds ?? [],
    ),
  ).filter((goalId) => !primaryGoalIds.includes(goalId));
  const primaryGoals = primaryGoalIds
    .map((goalId) => goalById.get(goalId))
    .filter((goal): goal is AcademyGoal => Boolean(goal));
  const assignmentSuitability = unique(
    primaryGoals.flatMap((goal) => {
      const support = goal.individualLearningSupport;
      const kinds: DevelopmentFollowUpRecommendation["assignmentSuitability"] =
        [];
      if (support.filmStudy) kinds.push("filmStudy");
      if (support.quiz) kinds.push("quiz");
      if (support.reflection) kinds.push("reflection");
      if (support.homePractice) kinds.push("homePractice");
      if (support.partnerPractice) kinds.push("partnerPractice");
      return kinds;
    }),
  );
  const warnings: string[] = [];
  if (!evidenceTagIds.length) {
    warnings.push("No evidence tags provided.");
  }
  if (!primaryGoalIds.length) {
    warnings.push("No development goals could be resolved from the evidence tags.");
  }
  warnings.push(
    "Lesson and drill IDs are not selected until approved content exists for these goals.",
  );
  return {
    goalIds: orderedGoalIds,
    primaryGoalIds,
    relatedGoalIds,
    improvementGoalIds: unique(improvementGoalIds),
    positiveGoalIds: unique(positiveGoalIds),
    recommendedLessonCount: primaryGoals.reduce(
      (sum, goal) => sum + goal.recommendedLessonCount,
      0,
    ),
    recommendedDrillCount: primaryGoals.reduce(
      (sum, goal) => sum + goal.recommendedDrillCount,
      0,
    ),
    assignmentSuitability,
    practicePrimaryGoalIds: primaryGoalIds,
    coachCues: primaryGoals.flatMap((goal) => goal.coachCues).slice(0, 6),
    feedbackExamples: primaryGoals
      .flatMap((goal) => goal.coachFeedbackExamples)
      .slice(0, 6),
    warnings,
  };
}

export function aggregatePracticeGoalsFromFilmEvidence(
  catalog: AcademyGoalGraphCatalog,
  attachments: readonly Pick<
    AcademyFilmEvidenceAttachment,
    "evidenceTagIds" | "goalIds"
  >[],
  options?: { maxPrimaryGoals?: number; maxSupportingGoals?: number },
): {
  primaryGoalIds: string[];
  supportingGoalIds: string[];
  evidenceTagIds: string[];
  followUp: DevelopmentFollowUpRecommendation;
} {
  const evidenceTagIds = unique(
    attachments.flatMap((attachment) => attachment.evidenceTagIds),
  );
  const followUp = recommendDevelopmentFollowUps(catalog, evidenceTagIds, {
    maxPrimaryGoals: options?.maxPrimaryGoals ?? 2,
  });
  const supportingLimit = options?.maxSupportingGoals ?? 3;
  const supportingGoalIds = unique([
    ...followUp.relatedGoalIds,
    ...followUp.goalIds.filter(
      (goalId) => !followUp.primaryGoalIds.includes(goalId),
    ),
  ]).slice(0, supportingLimit);
  return {
    primaryGoalIds: followUp.primaryGoalIds,
    supportingGoalIds,
    evidenceTagIds,
    followUp,
  };
}
