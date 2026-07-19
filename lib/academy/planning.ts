import type {
  AcademyDrill,
  AcademyPlanningRequest,
  GeneratedAcademyPlanOutline,
  PracticeActivityRole,
  PracticeGenerationRequest,
  GeneratedPracticePlan,
} from "@/lib/academy/types";

export type ScaledSessionSegment = {
  role: PracticeActivityRole;
  minutes: number;
};

const U12_BASE_SESSION: Array<
  ScaledSessionSegment & { minimumMinutes: number }
> = [
  { role: "arrival", minutes: 10, minimumMinutes: 5 },
  { role: "technical", minutes: 15, minimumMinutes: 8 },
  { role: "opposed", minutes: 15, minimumMinutes: 8 },
  { role: "directional_game", minutes: 20, minimumMinutes: 10 },
  { role: "small_sided_game", minutes: 10, minimumMinutes: 7 },
  { role: "review", minutes: 5, minimumMinutes: 3 },
];

/**
 * Deterministically scales the U11–U12 session flow while preserving every
 * learning phase, including game application and review.
 */
export function scaleU12SessionStructure(
  durationMinutes: 45 | 60 | 75 | 90,
): ScaledSessionSegment[] {
  const minimumTotal = U12_BASE_SESSION.reduce(
    (sum, segment) => sum + segment.minimumMinutes,
    0,
  );
  const distributable = durationMinutes - minimumTotal;
  const baseBeyondMinimum = U12_BASE_SESSION.reduce(
    (sum, segment) => sum + segment.minutes - segment.minimumMinutes,
    0,
  );
  const allocations = U12_BASE_SESSION.map((segment, index) => {
    const exactExtra =
      ((segment.minutes - segment.minimumMinutes) / baseBeyondMinimum) *
      distributable;
    return {
      index,
      role: segment.role,
      minutes: segment.minimumMinutes + Math.floor(exactExtra),
      remainder: exactExtra - Math.floor(exactExtra),
    };
  });
  let remaining =
    durationMinutes -
    allocations.reduce((sum, allocation) => sum + allocation.minutes, 0);
  for (const allocation of [...allocations].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  )) {
    if (remaining === 0) break;
    allocation.minutes += 1;
    remaining -= 1;
  }
  return allocations
    .sort((a, b) => a.index - b.index)
    .map(({ role, minutes }) => ({ role, minutes }));
}

export function isDrillPlayerCountCompatible(
  drill: AcademyDrill,
  playerCount: number,
  goalkeeperCount: number,
): boolean {
  if (
    playerCount < drill.playerCount.min ||
    playerCount > drill.playerCount.max
  ) {
    return false;
  }
  if (!drill.goalkeeperCount) return true;
  return (
    goalkeeperCount >= drill.goalkeeperCount.min &&
    goalkeeperCount <= drill.goalkeeperCount.max
  );
}

export function isDrillEquipmentCompatible(
  drill: AcademyDrill,
  availableEquipment?: readonly string[],
): boolean {
  if (!availableEquipment) return true;
  const available = new Set(
    availableEquipment.map((item) => item.trim().toLowerCase()),
  );
  return drill.equipment.every((item) =>
    available.has(item.trim().toLowerCase()),
  );
}

export function drillSupportsAnyGoal(
  drill: AcademyDrill,
  goalIds: readonly string[],
): boolean {
  const requested = new Set(goalIds);
  return drill.goalIds.some((goalId) => requested.has(goalId));
}

/**
 * Deterministic practice planner stub. Phase 2 fills slots from the goal graph
 * and approved content catalog; Phase 1 only returns the scaled skeleton.
 */
export function generatePracticePlan(
  request: PracticeGenerationRequest,
): GeneratedPracticePlan {
  const segments = scaleU12SessionStructure(request.durationMinutes);
  return {
    title: `Practice · ${request.ageBand}`,
    summary:
      "Skeleton practice scaled for the requested duration. Activity content is assembled from goal-linked drills after Phase 2 authoring.",
    totalMinutes: request.durationMinutes,
    primaryGoalIds: [...request.primaryGoalIds],
    supportingGoalIds: [...(request.supportingGoalIds ?? [])],
    activities: segments.map((segment, index) => ({
      id: `${segment.role}-${index + 1}`,
      order: index,
      role: segment.role,
      plannedMinutes: segment.minutes,
      objective: `Develop ${request.primaryGoalIds[0] ?? "the session theme"} through a ${segment.role.replaceAll("_", " ")} activity.`,
    })),
    introduction: [
      "Confirm the session theme with the players before the first activity.",
    ],
    reviewQuestions: [
      "What decision improved after the first activity?",
      "Where did support make the next action easier?",
    ],
    validationWarnings: [
      "Practice slots are structural only until goal-linked content is approved.",
    ],
  };
}

/**
 * High-level planning stub. Generates an outline first; detailed practices are
 * instantiated later when a coach opens or saves a plan.
 */
export function generatePlanOutline(
  request: AcademyPlanningRequest,
): GeneratedAcademyPlanOutline {
  const weeks = request.seasonWeeks ?? 12;
  const nodes =
    request.scope === "practice"
      ? [
          {
            id: "practice-1",
            scope: "practice" as const,
            title: `${request.ageBand} practice`,
            primaryGoalIds: [...request.primaryGoalIds],
            supportingGoalIds: [...(request.supportingGoalIds ?? [])],
          },
        ]
      : Array.from({ length: Math.max(1, Math.ceil(weeks / 2)) }, (_, index) => {
          const weekStart = index * 2 + 1;
          const weekEnd = Math.min(weeks, weekStart + 1);
          return {
            id: `block-${index + 1}`,
            scope: "month" as const,
            title: `Development block ${index + 1}`,
            primaryGoalIds: [...request.primaryGoalIds],
            supportingGoalIds: [...(request.supportingGoalIds ?? [])],
            weekStart,
            weekEnd,
            children: Array.from(
              { length: weekEnd - weekStart + 1 },
              (__, weekOffset) => ({
                id: `week-${weekStart + weekOffset}`,
                scope: "week" as const,
                title: `Week ${weekStart + weekOffset}`,
                primaryGoalIds: [...request.primaryGoalIds],
                supportingGoalIds: [...(request.supportingGoalIds ?? [])],
                weekStart: weekStart + weekOffset,
                weekEnd: weekStart + weekOffset,
              }),
            ),
          };
        });

  return {
    scope: request.scope,
    academyPresetId: request.academyPresetId,
    title: `${request.ageBand} ${request.scope} plan`,
    primaryGoalIds: [...request.primaryGoalIds],
    supportingGoalIds: [...(request.supportingGoalIds ?? [])],
    nodes,
    validationWarnings: [
      "Outline only. Instantiate practices from approved goal-linked content when opened or saved.",
    ],
  };
}
