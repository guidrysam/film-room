import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import {
  ACADEMY_SOURCE_DOCUMENTS_DIR,
  academyPageExtractPath,
} from "../../lib/academy/paths";
import {
  ensureAcademyDirectories,
  loadSourceDocuments,
  readJsonIfExists,
  writeJson,
  type PageExtract,
} from "./_shared";

function likelyHeading(text: string): string | undefined {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine || firstLine.length > 100 || firstLine.length < 3) {
    return undefined;
  }
  const wordCount = firstLine.split(/\s+/).length;
  if (
    wordCount <= 12 &&
    (firstLine === firstLine.toUpperCase() ||
      /^(session|practice|drill|chapter|part|phase|week|unit)\b/i.test(firstLine))
  ) {
    return firstLine;
  }
  return undefined;
}

async function main(): Promise<void> {
  await ensureAcademyDirectories();
  const documents = await loadSourceDocuments();
  let extracted = 0;
  let skipped = 0;
  let totalPages = 0;

  for (const document of documents) {
    const pdfPath = path.join(
      ACADEMY_SOURCE_DOCUMENTS_DIR,
      document.filename,
    );
    const pdfStats = await stat(pdfPath);
    const destination = academyPageExtractPath(document.id);
    const existing = await readJsonIfExists<PageExtract>(destination);
    if (
      existing?.sourceSizeBytes === pdfStats.size &&
      existing.sourceModifiedAt === pdfStats.mtime.toISOString()
    ) {
      skipped += 1;
      totalPages += existing.pageCount;
      console.log(
        `${document.id}: unchanged, keeping ${existing.pageCount} extracted pages.`,
      );
      continue;
    }

    const buffer = await readFile(pdfPath);
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      const textResult = await parser.getText();
      const pages = textResult.pages.map((page) => {
        const text = page.text.trim();
        const charCount = text.length;
        return {
          pageNumber: page.num,
          text,
          charCount,
          ...(likelyHeading(text)
            ? { likelyHeading: likelyHeading(text) }
            : {}),
          ...(charCount < 120 ? { hasDiagramNote: true } : {}),
        };
      });
      const lowTextPageCount = pages.filter(
        (page) => page.charCount < 120,
      ).length;
      const averageCharactersPerPage =
        pages.length === 0
          ? 0
          : Math.round(
              pages.reduce((sum, page) => sum + page.charCount, 0) /
                pages.length,
            );
      const density = averageCharactersPerPage;
      const confidence: PageExtract["confidence"] = {
        level: density >= 500 ? "high" : density >= 150 ? "medium" : "low",
        averageCharactersPerPage,
        lowTextPageCount,
      };
      const extract: PageExtract = {
        sourceDocumentId: document.id,
        extractedAt: new Date().toISOString(),
        pageCount: info.total || textResult.total || pages.length,
        sourceSizeBytes: pdfStats.size,
        sourceModifiedAt: pdfStats.mtime.toISOString(),
        pages,
        confidence,
      };
      await writeJson(destination, extract);
      extracted += 1;
      totalPages += extract.pageCount;
      console.log(
        `${document.id}: ${extract.pageCount} pages, ${confidence.level} text confidence, ${lowTextPageCount} low-text/image-heavy pages.`,
      );
    } finally {
      await parser.destroy();
    }
  }

  console.log(
    `Academy extraction complete: ${documents.length} documents, ${totalPages} pages (${extracted} extracted, ${skipped} unchanged).`,
  );
}

main().catch((error: unknown) => {
  console.error("Academy PDF extraction failed.", error);
  process.exitCode = 1;
});
