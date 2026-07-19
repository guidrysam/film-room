import { readdir } from "node:fs/promises";
import {
  ACADEMY_SOURCE_DOCUMENTS_DIR,
  academySourceDocumentPath,
} from "../../lib/academy/paths";
import {
  sourceIdFromFilename,
  sourceTitleFromFilename,
} from "../../lib/academy/source-ids";
import type { AcademySourceDocument } from "../../lib/academy/types";
import {
  ensureAcademyDirectories,
  readJsonIfExists,
  writeJson,
} from "./_shared";

const RESTRICTIONS = [
  "Private reference only.",
  "No public exposure of source files or extracted source records.",
  "No verbatim republish of source wording.",
  "No reuse or export of source diagrams.",
  "Original Film Room wording and original board layouts required.",
  "Human editorial review required before publication.",
];

async function main(): Promise<void> {
  await ensureAcademyDirectories();
  const filenames = (await readdir(ACADEMY_SOURCE_DOCUMENTS_DIR))
    .filter((filename) => filename.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b));

  let created = 0;
  let updated = 0;
  for (const filename of filenames) {
    const id = sourceIdFromFilename(filename);
    const destination = academySourceDocumentPath(id);
    const existing =
      await readJsonIfExists<AcademySourceDocument>(destination);
    const document: AcademySourceDocument = {
      id,
      filename,
      title: existing?.title || sourceTitleFromFilename(filename),
      ...(existing?.author ? { author: existing.author } : {}),
      ...(existing?.publisher ? { publisher: existing.publisher } : {}),
      ...(existing?.year ? { year: existing.year } : {}),
      sourceType: "pdf",
      licenseStatus: "private_reference_only",
      usageRestrictions: RESTRICTIONS,
      importedAt: existing?.importedAt || new Date().toISOString(),
    };
    await writeJson(destination, document);
    if (existing) updated += 1;
    else created += 1;
  }

  console.log(
    `Academy sources registered: ${filenames.length} (${created} created, ${updated} refreshed).`,
  );
}

main().catch((error: unknown) => {
  console.error("Academy source registration failed.", error);
  process.exitCode = 1;
});
