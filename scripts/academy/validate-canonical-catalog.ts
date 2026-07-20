import { validateCanonicalCatalog } from "../../lib/academy/catalog-validation";
import {
  ensureAcademyDirectories,
  loadCanonicalRecords,
} from "./_shared";

async function main(): Promise<void> {
  await ensureAcademyDirectories();
  const records = await loadCanonicalRecords();
  const validation = validateCanonicalCatalog(records);
  if (!validation.valid) {
    console.error(validation.errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  const publishedCount = records.filter(
    (record) => record.lifecycle === "published",
  ).length;
  console.log(
    `Canonical Academy catalog valid: ${records.length} editorial records, ${publishedCount} publishable objects, ${validation.warnings.length} warnings.`,
  );
}

main().catch((error: unknown) => {
  console.error("Canonical Academy catalog validation failed.", error);
  process.exitCode = 1;
});

