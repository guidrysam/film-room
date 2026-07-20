import {
  buildPublishedAcademyCatalog,
  validateCanonicalCatalog,
} from "../../lib/academy/catalog-validation";
import {
  academyPublishedCatalogPath,
  academyReportPath,
} from "../../lib/academy/paths";
import type { PublishedAcademyCatalog } from "../../lib/academy/types";
import {
  ensureAcademyDirectories,
  loadCanonicalRecords,
  readJsonIfExists,
  writeJson,
} from "./_shared";

async function main(): Promise<void> {
  await ensureAcademyDirectories();
  const records = await loadCanonicalRecords();
  const validation = validateCanonicalCatalog(records);
  if (!validation.valid) {
    throw new Error(validation.errors.join("\n"));
  }
  const current = await readJsonIfExists<PublishedAcademyCatalog>(
    academyPublishedCatalogPath(),
  );
  const requestedVersion = Number(process.env.ACADEMY_CATALOG_VERSION);
  const catalogVersion =
    Number.isInteger(requestedVersion) && requestedVersion > 0
      ? requestedVersion
      : (current?.catalogVersion ?? 1);
  const published = buildPublishedAcademyCatalog(records, {
    catalogId: current?.catalogId ?? "film-room-academy",
    catalogVersion,
  });
  await writeJson(academyPublishedCatalogPath(), published);

  const counts = Object.fromEntries(
    [...new Set(published.objects.map((object) => object.objectType))]
      .sort()
      .map((objectType) => [
        objectType,
        published.objects.filter((object) => object.objectType === objectType)
          .length,
      ]),
  );
  await writeJson(academyReportPath("published-catalog-summary.json"), {
    schemaVersion: 1,
    catalogId: published.catalogId,
    catalogVersion: published.catalogVersion,
    publishedObjectCount: published.objects.length,
    counts,
    privateProvenanceIncluded: false,
    validationWarnings: validation.warnings,
  });
  console.log(
    `Canonical Academy catalog published: ${published.objects.length} objects, version ${published.catalogVersion}.`,
  );
}

main().catch((error: unknown) => {
  console.error("Canonical Academy publication failed.", error);
  process.exitCode = 1;
});

