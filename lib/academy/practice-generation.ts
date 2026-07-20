import {
  aggregatePracticeGoalsFromFilmEvidence,
  recommendDevelopmentFollowUps,
} from "@/lib/academy/film-evidence";
import {
  generatePlanOutline,
  generatePracticePlan,
  scaleU12SessionStructure,
} from "@/lib/academy/planning";
import type {
  AcademyFilmEvidenceAttachment,
  AcademyGoal,
  AcademyGoalGraphCatalog,
  AcademyPlanningRequest,
  GeneratedAcademyPlanOutline,
  GeneratedPracticePlan,
  PracticeGenerationRequest,
} from "@/lib/academy/types";

function goalByIdMap(catalog: AcademyGoalGraphCatalog): Map<string, AcademyGoal> {
  return new Map(catalog.goals.map((goal) => [goal.id, goal]));
}

function objectiveForRole(
  role: string,
  primaryGoals: readonly AcademyGoal[],
): string {
  const lead = primaryGoals[0];
  if (!lead) {
    return `Develop the session theme through a ${role.replaceAll("_", " ")} activity.`;
  }
  const cue = lead.coachCues[0] ?? lead.title;
  switch (role) {
    case "arrival":
      return `Arrive with ball security focused on ${lead.title}.`;
    case "technical":
      return `Unopposed or lightly opposed reps for ${lead.title}: ${cue}`;
    case "opposed":
      return `Opposed practice of ${lead.title} under realistic pressure.`;
    case "directional_game":
      return `Directional game that rewards ${lead.title} and connected support.`;
    case "small_sided_game":
      return `Game application: look for ${lead.title} under match-like decisions.`;
    case "review":
      return `Review film cues and player examples of ${lead.title}.`;
    default:
      return `Develop ${lead.title} through a ${role.replaceAll("_", " ")} activity.`;
  }
}

/**
 * Goal-aware practice generation. Uses catalog goal wording for objectives and
 * coach cues. Drill IDs are intentionally omitted until approved content exists.
 */
export function generateGoalAwarePracticePlan(
  catalog: AcademyGoalGraphCatalog,
  request: PracticeGenerationRequest,
): GeneratedPracticePlan {
  const goalMap = goalByIdMap(catalog);
  let primaryGoalIds = [...request.primaryGoalIds];
  let supportingGoalIds = [...(request.supportingGoalIds ?? [])];
  const warnings: string[] = [];

  if (request.evidenceTagIds?.length) {
    const followUp = recommendDevelopmentFollowUps(
      catalog,
      request.evidenceTagIds,
    );
    if (followUp.primaryGoalIds.length) {
      primaryGoalIds = followUp.primaryGoalIds;
      supportingGoalIds = [
        ...new Set([...supportingGoalIds, ...followUp.relatedGoalIds]),
      ].slice(0, 4);
      warnings.push(...followUp.warnings);
    } else {
      warnings.push(
        "Evidence tags did not resolve to goals; using requested goal IDs.",
      );
    }
  }

  const primaryGoals = primaryGoalIds
    .map((id) => goalMap.get(id))
    .filter((goal): goal is AcademyGoal => Boolean(goal));
  const segments = scaleU12SessionStructure(request.durationMinutes);
  const base = generatePracticePlan({
    ...request,
    primaryGoalIds,
    supportingGoalIds,
  });

  return {
    ...base,
    title:
      primaryGoals[0] != null
        ? `Practice · ${primaryGoals[0].title}`
        : base.title,
    summary:
      primaryGoals.length > 0
        ? `Goal-linked ${request.durationMinutes}-minute practice centered on ${primaryGoals
            .map((goal) => goal.title)
            .join(" and ")}. Drill slots remain open until approved content exists.`
        : base.summary,
    primaryGoalIds,
    supportingGoalIds,
    activities: segments.map((segment, index) => ({
      id: `${segment.role}-${index + 1}`,
      order: index,
      role: segment.role,
      plannedMinutes: segment.minutes,
      objective: objectiveForRole(segment.role, primaryGoals),
    })),
    introduction: [
      ...(primaryGoals[0]?.coachCues.slice(0, 2) ?? []),
      "Confirm the session theme with the players before the first activity.",
    ],
    reviewQuestions: [
      ...(primaryGoals[0]?.observableIndicators.slice(0, 1).map(
        (indicator) => `Where did we see: ${indicator}?`,
      ) ?? []),
      "What decision improved after the first activity?",
      "Where did support make the next action easier?",
    ],
    validationWarnings: [
      ...warnings,
      "Practice slots are goal-aware but drill IDs are deferred until approved content is authored.",
    ],
  };
}

export function generatePracticePlanFromFilmEvidence(
  catalog: AcademyGoalGraphCatalog,
  request: Omit<PracticeGenerationRequest, "primaryGoalIds" | "supportingGoalIds"> & {
    attachments: readonly Pick<
      AcademyFilmEvidenceAttachment,
      "evidenceTagIds" | "goalIds"
    >[];
  },
): GeneratedPracticePlan {
  const aggregated = aggregatePracticeGoalsFromFilmEvidence(
    catalog,
    request.attachments,
  );
  return generateGoalAwarePracticePlan(catalog, {
    ...request,
    primaryGoalIds: aggregated.primaryGoalIds,
    supportingGoalIds: aggregated.supportingGoalIds,
    evidenceTagIds: aggregated.evidenceTagIds,
  });
}

/**
 * Game/week/season outline driven by film-evidence goals when provided,
 * otherwise by explicit primary goals on the planning request.
 */
export function generateGamePlanOutline(
  catalog: AcademyGoalGraphCatalog,
  request: AcademyPlanningRequest & {
    evidenceTagIds?: string[];
    attachments?: readonly Pick<
      AcademyFilmEvidenceAttachment,
      "evidenceTagIds" | "goalIds"
    >[];
  },
): GeneratedAcademyPlanOutline & {
  evidenceDriven: boolean;
  followUpWarnings: string[];
} {
  let primaryGoalIds = [...request.primaryGoalIds];
  let supportingGoalIds = [...(request.supportingGoalIds ?? [])];
  let evidenceDriven = false;
  const followUpWarnings: string[] = [];

  const tagIds =
    request.evidenceTagIds ??
    request.attachments?.flatMap((attachment) => attachment.evidenceTagIds) ??
    [];
  if (tagIds.length) {
    const followUp = recommendDevelopmentFollowUps(catalog, tagIds, {
      maxPrimaryGoals: request.scope === "practice" ? 2 : 3,
    });
    if (followUp.primaryGoalIds.length) {
      primaryGoalIds = followUp.primaryGoalIds;
      supportingGoalIds = followUp.relatedGoalIds.slice(0, 4);
      evidenceDriven = true;
      followUpWarnings.push(...followUp.warnings);
    }
  }

  const goalMap = goalByIdMap(catalog);
  const primaryTitles = primaryGoalIds
    .map((id) => goalMap.get(id)?.title)
    .filter((title): title is string => Boolean(title));

  const outline = generatePlanOutline({
    ...request,
    primaryGoalIds,
    supportingGoalIds,
  });

  return {
    ...outline,
    title:
      primaryTitles.length > 0
        ? `${request.ageBand} ${request.scope} plan · ${primaryTitles.join(", ")}`
        : outline.title,
    evidenceDriven,
    followUpWarnings,
    validationWarnings: [
      ...outline.validationWarnings,
      ...followUpWarnings,
      evidenceDriven
        ? "Outline priorities were derived from film evidence tags."
        : "Outline priorities use explicitly requested goals.",
    ],
  };
}
