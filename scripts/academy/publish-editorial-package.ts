import { requireAcademyEditor } from "../../lib/academy/editorial-auth";
import {
  persistEditorialCatalogState,
  publishLessonPackage,
} from "../../lib/academy/editorial-repository";
import { BLOCK1_PACKAGE_IDS } from "../../lib/academy/block1-packages";
import { OPEN_BODY_PACKAGE_ID } from "../../lib/academy/open-body-package";
import { academyPublishedCatalogPath } from "../../lib/academy/paths";
import type { PublishedAcademyCatalog } from "../../lib/academy/types";
import {
  ensureAcademyDirectories,
  loadCanonicalRecords,
  readJsonIfExists,
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
  const current = await readJsonIfExists<PublishedAcademyCatalog>(
    academyPublishedCatalogPath(),
  );
  const requestedVersion = Number(process.env.ACADEMY_CATALOG_VERSION);
  let catalogVersion =
    Number.isInteger(requestedVersion) && requestedVersion > 0
      ? requestedVersion
      : (current?.catalogVersion ?? 0) + 1;
  const packageIds = resolvePackageIds();
  let publishedCatalog: PublishedAcademyCatalog | undefined;
  const allAudit = [];
  for (const packageId of packageIds) {
    const result = publishLessonPackage(records, packageId, {
      actor,
      at: new Date().toISOString(),
      catalogId: current?.catalogId ?? "film-room-academy",
      catalogVersion,
      note: `CLI package publish (${packageId})`,
    });
    records = result.records;
    allAudit.push(...result.auditEntries);
    publishedCatalog = result.publishedCatalog;
    console.log(
      `Published ${packageId} into catalog v${publishedCatalog.catalogVersion} (${publishedCatalog.objects.length} objects).`,
    );
    catalogVersion += 1;
  }
  await persistEditorialCatalogState({
    records,
    auditEntries: allAudit,
    publishedCatalog,
  });
}

main().catch((error: unknown) => {
  console.error("Academy package publish failed.", error);
  process.exitCode = 1;
});
