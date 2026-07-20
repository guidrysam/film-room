import { requireAcademyEditor } from "../../lib/academy/editorial-auth";
import {
  approveLessonPackage,
  persistEditorialCatalogState,
} from "../../lib/academy/editorial-repository";
import { OPEN_BODY_PACKAGE_ID } from "../../lib/academy/open-body-package";
import { BLOCK1_PACKAGE_IDS } from "../../lib/academy/block1-packages";
import {
  ensureAcademyDirectories,
  loadCanonicalRecords,
} from "./_shared";

function resolvePackageIds(): string[] {
  const idFlags: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--id" && process.argv[i + 1]) {
      idFlags.push(process.argv[i + 1]!);
    }
  }
  if (process.argv.includes("--block1")) {
    return [...BLOCK1_PACKAGE_IDS];
  }
  if (idFlags.length) return idFlags;
  return [OPEN_BODY_PACKAGE_ID];
}

async function main(): Promise<void> {
  const actor = requireAcademyEditor();
  await ensureAcademyDirectories();
  let records = await loadCanonicalRecords();
  const packageIds = resolvePackageIds();
  const allAudit = [];
  for (const packageId of packageIds) {
    const result = approveLessonPackage(records, packageId, {
      actor,
      at: new Date().toISOString(),
      note: `CLI package approval (${packageId})`,
    });
    records = result.records;
    allAudit.push(...result.auditEntries);
    console.log(
      `Approved ${packageId} (${result.auditEntries.length} transitions).`,
    );
  }
  await persistEditorialCatalogState({
    records,
    auditEntries: allAudit,
  });
}

main().catch((error: unknown) => {
  console.error("Academy package approval failed.", error);
  process.exitCode = 1;
});
