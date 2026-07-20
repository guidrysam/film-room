import { requireAcademyEditor } from "../../lib/academy/editorial-auth";
import {
  persistEditorialCatalogState,
  transitionEditorialObject,
} from "../../lib/academy/editorial-repository";
import type { AcademyWorkflowStatus } from "../../lib/academy/types";
import {
  ensureAcademyDirectories,
  loadCanonicalRecords,
} from "./_shared";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const actor = requireAcademyEditor();
  const objectId = argValue("--id");
  const to = argValue("--to") as AcademyWorkflowStatus | undefined;
  const reason = argValue("--reason");
  const note = argValue("--note");
  if (!objectId || !to) {
    throw new Error(
      "Usage: academy:editorial:transition --id <id> --to <status> [--reason <text>] [--note <text>]",
    );
  }
  await ensureAcademyDirectories();
  const records = await loadCanonicalRecords();
  const result = transitionEditorialObject(records, {
    objectId,
    to,
    actor,
    at: new Date().toISOString(),
    reason,
    note,
  });
  await persistEditorialCatalogState({
    records: result.records,
    auditEntries: [result.auditEntry],
  });
  console.log(
    `Transitioned ${objectId}: ${result.auditEntry.previousStatus} -> ${result.auditEntry.newStatus}`,
  );
}

main().catch((error: unknown) => {
  console.error("Academy editorial transition failed.", error);
  process.exitCode = 1;
});
