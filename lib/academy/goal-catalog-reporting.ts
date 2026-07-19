import type {
  AcademyGoal,
  AcademyGoalGraphCatalog,
  AcademyPositionGroup,
} from "@/lib/academy/types";
import { buildGoalGraph } from "@/lib/academy/goal-graph";
import { stripSourceMetadata } from "@/lib/academy/source-privacy";

export type AcademyGoalGraphSummary = {
  domains: number;
  goals: number;
  prerequisiteLinks: number;
  relatedLinks: number;
  evidenceTags: number;
  individualSuitableGoals: number;
  filmObservableGoals: number;
};

const POSITION_GROUPS: AcademyPositionGroup[] = [
  "all",
  "goalkeeper",
  "defender",
  "outside_defender",
  "central_defender",
  "midfielder",
  "wide_player",
  "forward",
];

function suitableFor(goal: AcademyGoal, scope: string): boolean {
  const scopes = Array.isArray(goal.suitableFor)
    ? goal.suitableFor
    : [goal.suitableFor];
  return scopes.includes(scope as never);
}

function table(headers: string[], rows: Array<Array<string | number>>): string {
  const heading = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  return [
    heading,
    separator,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export function summarizeGoalCatalog(
  catalog: AcademyGoalGraphCatalog,
): AcademyGoalGraphSummary {
  const relatedPairs = new Set<string>();
  for (const goal of catalog.goals) {
    for (const relatedId of goal.relatedGoalIds) {
      relatedPairs.add([goal.id, relatedId].sort().join("::"));
    }
  }
  return {
    domains: catalog.domains.length,
    goals: catalog.goals.length,
    prerequisiteLinks: catalog.goals.reduce(
      (sum, goal) => sum + goal.prerequisiteGoalIds.length,
      0,
    ),
    relatedLinks: relatedPairs.size,
    evidenceTags: catalog.evidenceTags.length,
    individualSuitableGoals: catalog.goals.filter((goal) =>
      suitableFor(goal, "individual"),
    ).length,
    filmObservableGoals: catalog.goals.filter(
      (goal) =>
        goal.individualLearningSupport.filmStudy &&
        goal.gameEvidenceTags.length > 0,
    ).length,
  };
}

export function serializeGoalGraphCatalog(
  catalog: AcademyGoalGraphCatalog,
): string {
  const built = buildGoalGraph(catalog.goals);
  // Reports are product-facing projections. Strip private provenance even when
  // the canonical catalog currently keeps empty sourceProvenance arrays.
  return `${JSON.stringify(
    stripSourceMetadata({
      catalogId: catalog.id,
      version: catalog.version,
      title: catalog.title,
      ageBand: catalog.ageBand,
      primaryFormat: catalog.primaryFormat,
      seasonWeeks: catalog.seasonWeeks,
      practicesPerWeek: catalog.practicesPerWeek,
      typicalRoster: catalog.typicalRoster,
      goalkeepers: catalog.goalkeepers,
      domains: catalog.domains,
      blocks: catalog.blocks,
      goals: catalog.goals,
      evidenceTags: catalog.evidenceTags,
      graph: built.graph,
    }),
    null,
    2,
  )}\n`;
}

export function goalGraphMarkdown(catalog: AcademyGoalGraphCatalog): string {
  const summary = summarizeGoalCatalog(catalog);
  const goalById = new Map(catalog.goals.map((goal) => [goal.id, goal]));
  const domainSections = catalog.domains.map((domain) => {
    const goals = catalog.goals.filter((goal) => goal.domainId === domain.id);
    return [
      `## ${domain.title}`,
      domain.description,
      "",
      ...goals.map((goal) => {
        const prerequisites = goal.prerequisiteGoalIds
          .map((id) => goalById.get(id)?.title ?? id)
          .join(", ");
        return `- **${goal.title}** (\`${goal.id}\`) — Prerequisites: ${
          prerequisites || "None"
        }`;
      }),
    ].join("\n");
  });
  return `# U11–U12 9v9 Development Goal Graph

Canonical graph: \`${catalog.id}\` v${catalog.version}

- Domains: ${summary.domains}
- Goals: ${summary.goals}
- Prerequisite links: ${summary.prerequisiteLinks}
- Related links (undirected): ${summary.relatedLinks}
- Evidence tags: ${summary.evidenceTags}

Related-goal links are retrieval relationships and are intentionally excluded
from the prerequisite visualization to keep the learning chains readable.

${domainSections.join("\n\n")}
`;
}

export function goalGraphMermaid(catalog: AcademyGoalGraphCatalog): string {
  const chainGroups: Array<[string, string[]]> = [
    ["Receiving chain", ["receiving-first-touch", "scanning-decision-making"]],
    ["Passing and support chain", ["passing-combination-play", "support-width-depth"]],
    ["1v1 defending chain", ["one-v-one-defending"]],
    ["Buildup chain", ["building-from-goalkeeper"]],
    ["Transition chain", ["transition-to-attack", "transition-to-defense", "team-defending"]],
    ["Finishing chain", ["creating-finishing-chances", "one-v-one-attacking"]],
    ["Goalkeeping chain", ["goalkeeping"]],
  ];
  const goalById = new Map(catalog.goals.map((goal) => [goal.id, goal]));
  const lines = ["flowchart LR"];
  chainGroups.forEach(([title, domainIds], groupIndex) => {
    const goals = catalog.goals.filter((goal) =>
      domainIds.includes(goal.domainId),
    );
    const goalIds = new Set(goals.map((goal) => goal.id));
    lines.push(`  subgraph chain${groupIndex}["${title}"]`);
    for (const goal of goals) {
      lines.push(
        `    ${goal.id.replaceAll("-", "_")}["${goal.title.replaceAll('"', "'")}"]`,
      );
    }
    for (const goal of goals) {
      for (const prerequisiteId of goal.prerequisiteGoalIds) {
        if (goalIds.has(prerequisiteId) && goalById.has(prerequisiteId)) {
          lines.push(
            `    ${prerequisiteId.replaceAll("-", "_")} --> ${goal.id.replaceAll("-", "_")}`,
          );
        }
      }
    }
    lines.push("  end");
  });
  return `${lines.join("\n")}\n`;
}

export function goalCoverageMarkdown(catalog: AcademyGoalGraphCatalog): string {
  const domainRows = catalog.domains.map((domain) => {
    const goals = catalog.goals.filter((goal) => goal.domainId === domain.id);
    return [
      domain.title,
      goals.length,
      goals.filter((goal) => goal.prerequisiteGoalIds.length === 0).length,
      goals.filter((goal) => goal.prerequisiteGoalIds.length >= 2).length,
      goals.filter((goal) => suitableFor(goal, "individual")).length,
      goals.filter((goal) => goal.individualLearningSupport.filmStudy).length,
    ];
  });
  const blockRows = catalog.blocks.map((block) => {
    const count = (role: "primary" | "supporting" | "reinforcement") =>
      catalog.goals.filter((goal) =>
        goal.seasonalPlacement.some(
          (placement) =>
            placement.blockId === block.id && placement.role === role,
        ),
      ).length;
    const primary = count("primary");
    return [
      block.title,
      primary,
      count("supporting"),
      count("reinforcement"),
      primary < 4 ? "Review primary-goal depth" : "None identified",
    ];
  });
  const positionRows = POSITION_GROUPS.map((position) => {
    const primary = catalog.goals.filter((goal) =>
      goal.positionRelevance.some(
        (item) =>
          item.positionGroup === position && item.relevance === "primary",
      ),
    ).length;
    const secondary = catalog.goals.filter((goal) =>
      goal.positionRelevance.some(
        (item) =>
          item.positionGroup === position && item.relevance === "secondary",
      ),
    ).length;
    return [
      position.replaceAll("_", " "),
      primary,
      secondary,
      primary === 0 ? "No primary goals" : "None identified",
    ];
  });
  const demandRows = catalog.goals.map((goal) => [
    goal.title,
    goal.recommendedLessonCount,
    goal.recommendedDrillCount,
    suitableFor(goal, "team") ? "Yes" : "No",
    suitableFor(goal, "individual") ? "Yes" : "No",
    goal.individualLearningSupport.quiz ? "Yes" : "No",
    goal.individualLearningSupport.filmStudy ? "Yes" : "No",
  ]);
  return `# U11–U12 Goal Coverage

## Domain coverage

${table(
  [
    "Domain",
    "Goals",
    "Foundational",
    "Advanced",
    "Individual",
    "Film-observable",
  ],
  domainRows,
)}

## Block coverage

${table(
  ["Block", "Primary", "Supporting", "Reinforcement", "Potential gaps"],
  blockRows,
)}

## Position coverage

${table(
  ["Position group", "Primary goals", "Secondary goals", "Potential gaps"],
  positionRows,
)}

## Content demand

${table(
  [
    "Goal",
    "Lessons",
    "Drills",
    "Team practice",
    "Individual assignment",
    "Quiz",
    "Film review",
  ],
  demandRows,
)}
`;
}

export function contentDemandMarkdown(catalog: AcademyGoalGraphCatalog): string {
  const sections = catalog.goals.map((goal) => {
    const individual = suitableFor(goal, "individual");
    return `## ${goal.title}

\`${goal.id}\`

- ${goal.recommendedLessonCount} tactical/technical lesson${goal.recommendedLessonCount === 1 ? "" : "s"}
- ${goal.recommendedDrillCount} approved drill${goal.recommendedDrillCount === 1 ? "" : "s"}, including opposed or game-based transfer where appropriate
- 1 small-sided or game-training reinforcement
- ${goal.individualLearningSupport.quiz ? 3 : 0} quiz questions
- ${individual ? 2 : 0} individual assignments
- ${goal.individualLearningSupport.filmStudy ? 2 : 0} coach-film observation prompts
- Resource topics: ${goal.recommendedResourceTopics.join(", ") || "None"}
`;
  });
  return `# U11–U12 Graph-first Content Demand Plan

This is the specification for later content phases. It does not contain lessons,
drills, practices, assignments, quizzes, or external resources.

${sections.join("\n")}
`;
}
