import type {
  AcademyContentGraph,
  AcademyGoal,
} from "@/lib/academy/types";
import { validateGoalCatalog } from "@/lib/academy/validation";

export type GoalGraphBuildResult = {
  graph: AcademyContentGraph;
  errors: string[];
  warnings: string[];
};

/**
 * Build the goal-centric knowledge graph spine used by planners and Phase 2
 * content generation. Content edge maps start empty and are filled as lessons,
 * drills, practices, assignments, and quizzes are authored.
 */
export function buildGoalGraph(
  goals: readonly AcademyGoal[],
): GoalGraphBuildResult {
  const catalog = validateGoalCatalog(goals);
  const goalIds = goals.map((goal) => goal.id);
  const prerequisiteGoalIdsByGoalId: Record<string, string[]> = {};
  const relatedGoalIdsByGoalId: Record<string, string[]> = {};

  for (const goal of goals) {
    prerequisiteGoalIdsByGoalId[goal.id] = [
      ...(goal.prerequisiteGoalIds ?? []),
    ];
    relatedGoalIdsByGoalId[goal.id] = [...(goal.relatedGoalIds ?? [])];
  }

  return {
    graph: {
      goalIds,
      prerequisiteGoalIdsByGoalId,
      relatedGoalIdsByGoalId,
      lessonIdsByGoalId: Object.fromEntries(goalIds.map((id) => [id, []])),
      drillIdsByGoalId: Object.fromEntries(goalIds.map((id) => [id, []])),
      practiceIdsByGoalId: Object.fromEntries(goalIds.map((id) => [id, []])),
      assignmentIdsByGoalId: Object.fromEntries(goalIds.map((id) => [id, []])),
      quizIdsByGoalId: Object.fromEntries(goalIds.map((id) => [id, []])),
    },
    errors: catalog.errors,
    warnings: catalog.warnings,
  };
}

export function prerequisitesSatisfied(
  graph: AcademyContentGraph,
  goalId: string,
  completedGoalIds: readonly string[],
): boolean {
  const completed = new Set(completedGoalIds);
  return (graph.prerequisiteGoalIdsByGoalId[goalId] ?? []).every((id) =>
    completed.has(id),
  );
}

export function attachContentEdges(
  graph: AcademyContentGraph,
  edges: {
    lessonIdsByGoalId?: Record<string, string[]>;
    drillIdsByGoalId?: Record<string, string[]>;
    practiceIdsByGoalId?: Record<string, string[]>;
    assignmentIdsByGoalId?: Record<string, string[]>;
    quizIdsByGoalId?: Record<string, string[]>;
  },
): AcademyContentGraph {
  return {
    ...graph,
    lessonIdsByGoalId: {
      ...graph.lessonIdsByGoalId,
      ...edges.lessonIdsByGoalId,
    },
    drillIdsByGoalId: {
      ...graph.drillIdsByGoalId,
      ...edges.drillIdsByGoalId,
    },
    practiceIdsByGoalId: {
      ...graph.practiceIdsByGoalId,
      ...edges.practiceIdsByGoalId,
    },
    assignmentIdsByGoalId: {
      ...graph.assignmentIdsByGoalId,
      ...edges.assignmentIdsByGoalId,
    },
    quizIdsByGoalId: {
      ...graph.quizIdsByGoalId,
      ...edges.quizIdsByGoalId,
    },
  };
}
