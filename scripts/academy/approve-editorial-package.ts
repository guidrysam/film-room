import { requireAcademyEditor } from "../../lib/academy/editorial-auth";
import {
  approveOpenBodyPackage,
  persistEditorialCatalogState,
} from "../../lib/academy/editorial-repository";
import {
  ensureAcademyDirectories,
  loadCanonicalRecords,
} from "./_shared";

async function main(): Promise<void> {
  const actor = requireAcademyEditor();
  await ensureAcademyDirectories();
  const records = await loadCanonicalRecords();
  const result = approveOpenBodyPackage(records, {
    actor,
    at: new Date().toISOString(),
    note: "CLI package approval",
  });
  await persistEditorialCatalogState({
    records: result.records,
    auditEntries: result.auditEntries,
  });
  console.log(
    `Approved open-body package (${result.auditEntries.length} transitions).`,
  );
}

main().catch((error: unknown) => {
  console.error("Academy package approval failed.", error);
  process.exitCode = 1;
});
