import path from "node:path";
import { linkPotentialDuplicateCandidates } from "../../lib/academy/catalog-deduplication";
import { validateKnowledgeCandidate } from "../../lib/academy/catalog-validation";
import { extractKnowledgeCandidates } from "../../lib/academy/knowledge-extraction";
import {
  ACADEMY_KNOWLEDGE_CANDIDATES_DIR,
  academyReportPath,
} from "../../lib/academy/paths";
import {
  ensureAcademyDirectories,
  loadAllSourceItems,
  writeJson,
} from "./_shared";

async function main(): Promise<void> {
  await ensureAcademyDirectories();
  const sourceItems = await loadAllSourceItems();
  const candidates = linkPotentialDuplicateCandidates(
    extractKnowledgeCandidates(sourceItems),
  );
  const errors = candidates.flatMap(
    (candidate) => validateKnowledgeCandidate(candidate).errors,
  );
  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
  await writeJson(
    path.join(ACADEMY_KNOWLEDGE_CANDIDATES_DIR, "candidates.json"),
    {
      schemaVersion: 1,
      visibility: "private_editorial_only",
      autoApproval: false,
      count: candidates.length,
      candidates,
    },
  );
  const duplicateCandidateCount = candidates.filter(
    (candidate) => candidate.potentialDuplicateCandidateIds.length > 0,
  ).length;
  await writeJson(academyReportPath("catalog-candidate-summary.json"), {
    schemaVersion: 1,
    candidateCount: candidates.length,
    duplicateCandidateCount,
    confidence: {
      high: candidates.filter((candidate) => candidate.confidence === "high")
        .length,
      medium: candidates.filter(
        (candidate) => candidate.confidence === "medium",
      ).length,
      low: candidates.filter((candidate) => candidate.confidence === "low")
        .length,
    },
    policy: {
      privateResearchOnly: true,
      createsPublishedObjects: false,
      humanReviewRequired: true,
    },
  });
  console.log(
    `Academy knowledge candidates built: ${candidates.length} private candidates, ${duplicateCandidateCount} with potential duplicate matches.`,
  );
}

main().catch((error: unknown) => {
  console.error("Academy knowledge candidate generation failed.", error);
  process.exitCode = 1;
});

