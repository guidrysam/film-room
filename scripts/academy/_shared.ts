import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ACADEMY_EDITORIAL_QUEUE_DIR,
  ACADEMY_REPORTS_DIR,
  ACADEMY_SOURCE_INDEX_DIR,
  ACADEMY_SOURCE_REGISTRY_DIR,
} from "../../lib/academy/paths";
import type {
  AcademySourceDocument,
  AcademySourceItem,
} from "../../lib/academy/types";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  charCount: number;
  likelyHeading?: string;
  hasDiagramNote?: boolean;
};

export type PageExtract = {
  sourceDocumentId: string;
  extractedAt: string;
  pageCount: number;
  sourceSizeBytes?: number;
  sourceModifiedAt?: string;
  pages: ExtractedPage[];
  confidence: {
    level: "low" | "medium" | "high";
    averageCharactersPerPage: number;
    lowTextPageCount: number;
  };
};

export async function ensureAcademyDirectories(): Promise<void> {
  await Promise.all(
    [
      ACADEMY_SOURCE_REGISTRY_DIR,
      ACADEMY_SOURCE_INDEX_DIR,
      ACADEMY_EDITORIAL_QUEUE_DIR,
      ACADEMY_REPORTS_DIR,
    ].map((directory) => mkdir(directory, { recursive: true })),
  );
}

export async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

export async function readJsonIfExists<T>(
  filename: string,
): Promise<T | null> {
  try {
    return await readJson<T>(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeJson(
  filename: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory))
      .filter((filename) => filename.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b))
      .map((filename) => path.join(directory, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function loadSourceDocuments(): Promise<
  AcademySourceDocument[]
> {
  const files = (await listJsonFiles(ACADEMY_SOURCE_REGISTRY_DIR)).filter(
    (filename) => !filename.endsWith(".pages.json"),
  );
  return Promise.all(
    files.map((filename) => readJson<AcademySourceDocument>(filename)),
  );
}

export async function loadAllSourceItems(): Promise<AcademySourceItem[]> {
  const files = (await listJsonFiles(ACADEMY_SOURCE_INDEX_DIR)).filter(
    (filename) => filename.endsWith(".items.json"),
  );
  const catalogs = await Promise.all(
    files.map((filename) => readJson<AcademySourceItem[]>(filename)),
  );
  return catalogs.flat();
}
