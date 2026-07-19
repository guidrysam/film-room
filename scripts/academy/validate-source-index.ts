import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ACADEMY_SOURCE_DOCUMENTS_DIR,
  academyPageExtractPath,
  academyReportPath,
  academySourceItemsPath,
} from "../../lib/academy/paths";
import { assertSourceRecordsArePrivate } from "../../lib/academy/source-privacy";
import type { AcademySourceItem } from "../../lib/academy/types";
import {
  validateSourceCatalog,
  validateSourceItem,
} from "../../lib/academy/validation";
import {
  ensureAcademyDirectories,
  loadSourceDocuments,
  readJson,
  type PageExtract,
} from "./_shared";

async function main(): Promise<void> {
  await ensureAcademyDirectories();
  const errors: string[] = [];
  const warnings: string[] = [];
  const documents = await loadSourceDocuments();
  const catalogResult = validateSourceCatalog(documents);
  errors.push(...catalogResult.errors);
  warnings.push(...catalogResult.warnings);
  let pagesValidated = 0;
  let itemsValidated = 0;

  assertSourceRecordsArePrivate(documents);
  for (const document of documents) {
    try {
      await access(
        path.join(ACADEMY_SOURCE_DOCUMENTS_DIR, document.filename),
      );
    } catch {
      errors.push(`source:${document.id}: registered PDF does not exist`);
    }

    let extract: PageExtract;
    try {
      extract = await readJson<PageExtract>(
        academyPageExtractPath(document.id),
      );
    } catch {
      errors.push(`source:${document.id}: page extract is missing or invalid`);
      continue;
    }
    if (extract.sourceDocumentId !== document.id) {
      errors.push(`source:${document.id}: page extract references wrong source`);
    }
    if (
      !Number.isInteger(extract.pageCount) ||
      extract.pageCount < 1 ||
      !Array.isArray(extract.pages)
    ) {
      errors.push(`source:${document.id}: invalid page extract shape`);
      continue;
    }
    const pageNumbers = new Set<number>();
    for (const page of extract.pages) {
      pagesValidated += 1;
      if (
        !Number.isInteger(page.pageNumber) ||
        page.pageNumber < 1 ||
        page.pageNumber > extract.pageCount
      ) {
        errors.push(`source:${document.id}: invalid page number`);
      }
      if (pageNumbers.has(page.pageNumber)) {
        errors.push(
          `source:${document.id}: duplicate page ${page.pageNumber}`,
        );
      }
      pageNumbers.add(page.pageNumber);
      if (
        typeof page.text !== "string" ||
        page.charCount !== page.text.length
      ) {
        errors.push(
          `source:${document.id}: page ${page.pageNumber} charCount mismatch`,
        );
      }
    }

    let items: AcademySourceItem[];
    try {
      items = await readJson<AcademySourceItem[]>(
        academySourceItemsPath(document.id),
      );
    } catch {
      errors.push(`source:${document.id}: source items are missing or invalid`);
      continue;
    }
    assertSourceRecordsArePrivate(items);
    const itemIds = new Set<string>();
    for (const item of items) {
      itemsValidated += 1;
      const itemResult = validateSourceItem(item);
      errors.push(...itemResult.errors);
      warnings.push(...itemResult.warnings);
      if (itemIds.has(item.id)) {
        errors.push(`source:${document.id}: duplicate item id ${item.id}`);
      }
      itemIds.add(item.id);
      if (item.sourceDocumentId !== document.id) {
        errors.push(`${item.id}: references the wrong source document`);
      }
      if (
        item.sourcePageStart &&
        item.sourcePageStart > extract.pageCount
      ) {
        errors.push(`${item.id}: page reference exceeds document page count`);
      }
    }
  }

  const generatedAt = new Date().toISOString();
  const report = [
    "# Academy source validation",
    "",
    `Generated: ${generatedAt}`,
    "",
    `**Result: ${errors.length === 0 ? "PASS" : "FAIL"}**`,
    "",
    `- Documents validated: ${documents.length}`,
    `- Pages validated: ${pagesValidated}`,
    `- Source items validated: ${itemsValidated}`,
    `- Hard errors: ${errors.length}`,
    `- Warnings: ${warnings.length}`,
    "",
    "## Hard errors",
    "",
    ...(errors.length ? errors.map((error) => `- ${error}`) : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(warnings.length
      ? warnings.map((warning) => `- ${warning}`)
      : ["- None"]),
    "",
  ].join("\n");
  await writeFile(
    academyReportPath("validation-report.md"),
    report,
    "utf8",
  );
  console.log(
    `Academy source validation ${errors.length === 0 ? "passed" : "failed"}: ${documents.length} documents, ${pagesValidated} pages, ${itemsValidated} items, ${errors.length} errors, ${warnings.length} warnings.`,
  );
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Academy source validation failed.", error);
  process.exitCode = 1;
});
