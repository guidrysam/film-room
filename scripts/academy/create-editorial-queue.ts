import path from "node:path";
import {
  ACADEMY_EDITORIAL_QUEUE_DIR,
  academyReportPath,
} from "../../lib/academy/paths";
import {
  ensureAcademyDirectories,
  loadAllSourceItems,
  readJsonIfExists,
  writeJson,
} from "./_shared";

async function main(): Promise<void> {
  await ensureAcademyDirectories();
  const items = (await loadAllSourceItems()).filter(
    (item) =>
      item.publicationEligibility === "requires_original_rewrite" &&
      item.editorialStatus !== "reviewed" &&
      item.editorialStatus !== "rejected",
  );
  const queue = {
    generatedAt: new Date().toISOString(),
    policy: {
      sourceVisibility: "private_reference_only",
      autoApproval: false,
      requiredAction:
        "Create an original Film Room draft, then complete human editorial and safety review.",
    },
    count: items.length,
    items: items.map((item) => ({
      sourceItemId: item.id,
      sourceDocumentId: item.sourceDocumentId,
      sourcePageStart: item.sourcePageStart,
      sourcePageEnd: item.sourcePageEnd,
      contentType: item.contentType,
      editorialStatus: item.editorialStatus,
      publicationEligibility: item.publicationEligibility,
    })),
  };
  await writeJson(
    path.join(ACADEMY_EDITORIAL_QUEUE_DIR, "queue.json"),
    queue,
  );
  const importReport = await readJsonIfExists<Record<string, unknown>>(
    academyReportPath("source-import.json"),
  );
  if (importReport) {
    await writeJson(academyReportPath("source-import.json"), {
      ...importReport,
      editorialQueueSize: items.length,
    });
  }
  console.log(`Academy editorial queue created: ${items.length} items.`);
}

main().catch((error: unknown) => {
  console.error("Academy editorial queue creation failed.", error);
  process.exitCode = 1;
});
