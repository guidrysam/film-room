import { requireAcademyEditor } from "../../lib/academy/editorial-auth";
import {
  persistEditorialCatalogState,
  unpublishOpenBodyPackage,
} from "../../lib/academy/editorial-repository";
import { academyPublishedCatalogPath } from "../../lib/academy/paths";
import type { PublishedAcademyCatalog } from "../../lib/academy/types";
import {
  ensureAcademyDirectories,
  loadCanonicalRecords,
  readJsonIfExists,
} from "./_shared";

async function main(): Promise<void> {
  const actor = requireAcademyEditor();
  await ensureAcademyDirectories();
  const records = await loadCanonicalRecords();
  const current = await readJsonIfExists<PublishedAcademyCatalog>(
    academyPublishedCatalogPath(),
  );
  const catalogVersion = (current?.catalogVersion ?? 0) + 1;
  const result = unpublishOpenBodyPackage(records, {
    actor,
    at: new Date().toISOString(),
    catalogId: current?.catalogId ?? "film-room-academy",
    catalogVersion,
    note: "CLI package unpublish",
  });
  await persistEditorialCatalogState({
    records: result.records,
    auditEntries: result.auditEntries,
    publishedCatalog: result.publishedCatalog,
  });
  console.log(
    `Unpublished open-body package. Catalog v${result.publishedCatalog.catalogVersion} now has ${result.publishedCatalog.objects.length} objects.`,
  );
}

main().catch((error: unknown) => {
  console.error("Academy package unpublish failed.", error);
  process.exitCode = 1;
});
