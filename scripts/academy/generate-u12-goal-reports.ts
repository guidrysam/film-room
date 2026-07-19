import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  contentDemandMarkdown,
  goalCoverageMarkdown,
  goalGraphMarkdown,
  goalGraphMermaid,
  serializeGoalGraphCatalog,
  summarizeGoalCatalog,
} from "@/lib/academy/goal-catalog-reporting";
import { validateAcademyGoalGraphCatalog } from "@/lib/academy/goal-catalog-validation";
import { ACADEMY_REPORTS_DIR } from "@/lib/academy/paths";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

async function main(): Promise<void> {
  const validation = validateAcademyGoalGraphCatalog(U12_ACADEMY_GOAL_CATALOG);
  if (!validation.valid) {
    console.error(validation.errors.join("\n"));
    process.exitCode = 1;
    return;
  }

  await mkdir(ACADEMY_REPORTS_DIR, { recursive: true });
  const outputs = new Map<string, string>([
    [
      "u12-goal-graph.json",
      serializeGoalGraphCatalog(U12_ACADEMY_GOAL_CATALOG),
    ],
    ["u12-goal-graph.md", goalGraphMarkdown(U12_ACADEMY_GOAL_CATALOG)],
    ["u12-goal-graph.mmd", goalGraphMermaid(U12_ACADEMY_GOAL_CATALOG)],
    ["u12-goal-coverage.md", goalCoverageMarkdown(U12_ACADEMY_GOAL_CATALOG)],
    [
      "u12-content-demand-plan.md",
      contentDemandMarkdown(U12_ACADEMY_GOAL_CATALOG),
    ],
  ]);
  await Promise.all(
    [...outputs].map(([filename, contents]) =>
      writeFile(path.join(ACADEMY_REPORTS_DIR, filename), contents, "utf8"),
    ),
  );
  const summary = summarizeGoalCatalog(U12_ACADEMY_GOAL_CATALOG);
  console.log(
    `U11-U12 goal graph valid: ${summary.domains} domains, ${summary.goals} goals, ` +
      `${summary.prerequisiteLinks} prerequisites, ${summary.relatedLinks} related links, ` +
      `${summary.evidenceTags} evidence tags.`,
  );
  if (validation.warnings.length) {
    console.warn(validation.warnings.join("\n"));
  }
}

void main();
