import { requireAcademyEditor } from "../../lib/academy/editorial-auth";
import {
  persistEditorialCatalogState,
  publishOpenBodyPackage,
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
  const requestedVersion = Number(process.env.ACADEMY_CATALOG_VERSION);
  const catalogVersion =
    Number.isInteger(requestedVersion) && requestedVersion > 0
      ? requestedVersion
      : (current?.catalogVersion ?? 0) + 1;
  const result = publishOpenBodyPackage(records, {
    actor,
    at: new Date().toISOString(),
    catalogId: current?.catalogId ?? "film-room-academy",
    catalogVersion,
    note: "CLI package publish",
  });
  await persistEditorialCatalogState({
    records: result.records,
    auditEntries: result.auditEntries,
    publishedCatalog: result.publishedCatalog,
  });
  console.log(
    `Published open-body package into catalog v${result.publishedCatalog.catalogVersion} (${result.publishedCatalog.objects.length} objects).`,
  );
}

main().catch((error: unknown) => {
  console.error("Academy package publish failed.", error);
  process.exitCode = 1;
});
