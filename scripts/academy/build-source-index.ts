import { writeFile } from "node:fs/promises";
import {
  academyPageExtractPath,
  academyReportPath,
  academySourceItemsPath,
} from "../../lib/academy/paths";
import type { AcademySourceItem } from "../../lib/academy/types";
import {
  ensureAcademyDirectories,
  loadSourceDocuments,
  readJson,
  writeJson,
  type ExtractedPage,
  type PageExtract,
} from "./_shared";

const SKILL_TERMS = [
  "passing",
  "receiving",
  "first touch",
  "finishing",
  "shooting",
  "dribbling",
  "ball mastery",
  "heading",
];
const TACTICAL_TERMS = [
  "width",
  "depth",
  "pressure",
  "cover",
  "balance",
  "transition",
  "build up",
  "possession",
  "counterattack",
];
const EQUIPMENT_TERMS = [
  "ball",
  "cone",
  "bib",
  "pinnies",
  "goal",
  "pole",
  "ladder",
  "mannequin",
];

function uniqueMatches(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term));
}

function detectAgeTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(/\bU[\s-]?(\d{1,2})\b/gi)) {
    tags.add(`U${match[1]}`);
  }
  for (const match of text.matchAll(/\bages?\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/gi)) {
    tags.add(match[2] ? `${match[1]}-${match[2]}` : match[1]);
  }
  return [...tags].slice(0, 8);
}

function detectDuration(text: string): number | undefined {
  const match = text.match(/\b(\d{1,3})\s*(?:min|mins|minutes)\b/i);
  const value = match ? Number(match[1]) : undefined;
  return value && value <= 180 ? value : undefined;
}

function detectPlayerCount(
  text: string,
): Pick<AcademySourceItem, "playerCountMin" | "playerCountMax"> {
  const range = text.match(
    /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s+players?\b/i,
  );
  if (range) {
    return {
      playerCountMin: Number(range[1]),
      playerCountMax: Number(range[2]),
    };
  }
  const exact = text.match(/\b(\d{1,2})\s+players?\b/i);
  return exact
    ? {
        playerCountMin: Number(exact[1]),
        playerCountMax: Number(exact[1]),
      }
    : {};
}

function firstUsefulLine(page: ExtractedPage): string | undefined {
  return page.text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find((line) => line.length >= 3 && line.length <= 100);
}

function classify(
  text: string,
  title: string,
): AcademySourceItem["contentType"] {
  const sample = `${title} ${text}`.toLowerCase();
  if (/\b(drill|exercise|activity|game)\b/.test(sample)) return "drill";
  if (/\b(age|u\d{1,2}|youth|player development)\b/.test(sample)) {
    return "age_guidance";
  }
  if (/\b(season|curriculum|week|month|periodi[sz])\b/.test(sample)) {
    return "season_structure";
  }
  if (/\b(formation|transition|possession|defend|attack|width|depth)\b/.test(sample)) {
    return "tactical_concept";
  }
  if (/\b(session|practice|warm.?up|method)\b/.test(sample)) {
    return "session_methodology";
  }
  if (/\b(coach|cue|feedback|question)\b/.test(sample)) {
    return "coaching_guidance";
  }
  return "development_principle";
}

function makeItem(
  documentId: string,
  page: ExtractedPage,
): AcademySourceItem {
  const detectedLine = firstUsefulLine(page);
  const sourceTitle =
    page.likelyHeading ||
    (detectedLine && /\b(drill|exercise|activity|game|session)\b/i.test(detectedLine)
      ? detectedLine
      : `Page ${page.pageNumber} reference`);
  const ageTags = detectAgeTags(page.text);
  const skillTags = uniqueMatches(page.text, SKILL_TERMS);
  const tacticalTags = uniqueMatches(page.text, TACTICAL_TERMS);
  const equipmentMentions = uniqueMatches(page.text, EQUIPMENT_TERMS);
  const durationMinutes = detectDuration(page.text);
  const contentType = classify(page.text, sourceTitle);
  const signals = [
    ageTags.length ? `age guidance (${ageTags.join(", ")})` : "",
    durationMinutes ? `a ${durationMinutes}-minute duration` : "",
    equipmentMentions.length
      ? `equipment mentions (${equipmentMentions.join(", ")})`
      : "",
    skillTags.length ? `skill themes (${skillTags.join(", ")})` : "",
    tacticalTags.length
      ? `tactical themes (${tacticalTags.join(", ")})`
      : "",
  ].filter(Boolean);

  return {
    id: `${documentId}-page-${page.pageNumber}`,
    sourceDocumentId: documentId,
    sourcePageStart: page.pageNumber,
    sourcePageEnd: page.pageNumber,
    sourceTitle,
    contentType,
    internalSummary: `Internal reference page classified as ${contentType.replaceAll("_", " ")}${
      signals.length ? ` with ${signals.join("; ")}` : ""
    }. Rewrite from the underlying concept using original Film Room wording and a new diagram before any product use.`,
    ageTags,
    skillTags,
    tacticalTags,
    ...detectPlayerCount(page.text),
    ...(durationMinutes ? { durationMinutes } : {}),
    ...(equipmentMentions.length ? { equipmentMentions } : {}),
    editorialStatus: "extracted",
    publicationEligibility: "requires_original_rewrite",
  };
}

async function main(): Promise<void> {
  await ensureAcademyDirectories();
  const documents = await loadSourceDocuments();
  const reportDocuments: Array<{
    id: string;
    title: string;
    filename: string;
    licenseStatus: string;
    pageCount: number;
    indexedItemCount: number;
    confidence: string;
  }> = [];
  let totalPages = 0;
  let totalItems = 0;

  for (const document of documents) {
    const extract = await readJson<PageExtract>(
      academyPageExtractPath(document.id),
    );
    const items = extract.pages
      .filter((page) => page.charCount >= 40)
      .map((page) => makeItem(document.id, page));
    await writeJson(academySourceItemsPath(document.id), items);
    totalPages += extract.pageCount;
    totalItems += items.length;
    reportDocuments.push({
      id: document.id,
      title: document.title,
      filename: document.filename,
      licenseStatus: document.licenseStatus,
      pageCount: extract.pageCount,
      indexedItemCount: items.length,
      confidence: extract.confidence.level,
    });
  }

  const generatedAt = new Date().toISOString();
  await writeJson(academyReportPath("source-import.json"), {
    generatedAt,
    documentsDiscovered: documents.length,
    pagesProcessed: totalPages,
    sourceItemsIndexed: totalItems,
    documents: reportDocuments,
  });
  const summary = [
    "# Academy source index summary",
    "",
    `Generated: ${generatedAt}`,
    "",
    "> Private reference only. Extracted source records are not product content and require an original rewrite plus human review.",
    "",
    `- Documents: ${documents.length}`,
    `- Pages: ${totalPages}`,
    `- Internal source items: ${totalItems}`,
    "",
    "## Documents",
    "",
    ...reportDocuments.map(
      (document) =>
        `- **${document.title}** — ${document.pageCount} pages, ${document.indexedItemCount} items, ${document.confidence} extraction confidence`,
    ),
    "",
  ].join("\n");
  await writeFile(
    academyReportPath("source-index-summary.md"),
    summary,
    "utf8",
  );

  console.log(
    `Academy source index built: ${documents.length} documents, ${totalPages} pages, ${totalItems} internal items.`,
  );
}

main().catch((error: unknown) => {
  console.error("Academy source indexing failed.", error);
  process.exitCode = 1;
});
