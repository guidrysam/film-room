import path from "node:path";

export const ACADEMY_ROOT = path.resolve(process.cwd(), "data/academy");
export const ACADEMY_SOURCE_DOCUMENTS_DIR = path.resolve(
  process.cwd(),
  "docs/academy-sources",
);
export const ACADEMY_SOURCE_REGISTRY_DIR = path.join(ACADEMY_ROOT, "sources");
export const ACADEMY_SOURCE_INDEX_DIR = path.join(ACADEMY_ROOT, "source-index");
export const ACADEMY_EDITORIAL_QUEUE_DIR = path.join(
  ACADEMY_ROOT,
  "editorial-queue",
);
export const ACADEMY_KNOWLEDGE_CANDIDATES_DIR = path.join(
  ACADEMY_ROOT,
  "knowledge-candidates",
);
export const ACADEMY_CANONICAL_EDITORIAL_DIR = path.join(
  ACADEMY_ROOT,
  "catalog-editorial",
);
export const ACADEMY_PUBLISHED_CATALOG_DIR = path.join(
  ACADEMY_ROOT,
  "catalog-published",
);
export const ACADEMY_GOALS_DIR = path.join(ACADEMY_ROOT, "goals");
export const ACADEMY_DRILLS_DIR = path.join(ACADEMY_ROOT, "drills");
export const ACADEMY_TACTICAL_LESSONS_DIR = path.join(
  ACADEMY_ROOT,
  "tactical-lessons",
);
export const ACADEMY_PRACTICE_PLANS_DIR = path.join(
  ACADEMY_ROOT,
  "practice-plans",
);
export const ACADEMY_PRESETS_DIR = path.join(ACADEMY_ROOT, "presets");
export const ACADEMY_QUIZZES_DIR = path.join(ACADEMY_ROOT, "quizzes");
export const ACADEMY_ASSIGNMENTS_DIR = path.join(ACADEMY_ROOT, "assignments");
export const ACADEMY_REPORTS_DIR = path.resolve(
  process.cwd(),
  "reports/academy",
);

export function academySourceDocumentPath(id: string): string {
  return path.join(ACADEMY_SOURCE_REGISTRY_DIR, `${id}.json`);
}

export function academyPageExtractPath(id: string): string {
  return path.join(ACADEMY_SOURCE_INDEX_DIR, `${id}.pages.json`);
}

export function academySourceItemsPath(id: string): string {
  return path.join(ACADEMY_SOURCE_INDEX_DIR, `${id}.items.json`);
}

export function academyReportPath(filename: string): string {
  return path.join(ACADEMY_REPORTS_DIR, filename);
}

export function academyPublishedCatalogPath(): string {
  return path.join(ACADEMY_PUBLISHED_CATALOG_DIR, "catalog.json");
}

export function academyEditorialAuditPath(): string {
  return path.join(ACADEMY_CANONICAL_EDITORIAL_DIR, "audit.jsonl");
}

export function academyEditorialRecordPath(id: string): string {
  return path.join(ACADEMY_CANONICAL_EDITORIAL_DIR, `${id}.json`);
}
