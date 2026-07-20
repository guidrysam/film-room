import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { validateCanonicalRecord } from "@/lib/academy/catalog-validation";
import {
  evaluatePackageReadiness,
  type AcademyPackageReadiness,
} from "@/lib/academy/editorial-repository";
import { workflowStatusFromLifecycle } from "@/lib/academy/editorial-transitions";
import { buildOpenBodyEditorialRecords } from "@/lib/academy/open-body-package";
import { ACADEMY_CANONICAL_EDITORIAL_DIR } from "@/lib/academy/paths";
import type {
  AcademyCanonicalRecord,
  AcademyWorkflowStatus,
} from "@/lib/academy/types";

export type AcademyReviewQueueItem = {
  id: string;
  title: string;
  objectType: AcademyCanonicalRecord["objectType"];
  status: AcademyWorkflowStatus;
  version: number;
  relatedGoalIds: string[];
  updatedAt: string;
  validationValid: boolean;
  validationErrors: string[];
};

function relatedGoalIds(record: AcademyCanonicalRecord): string[] {
  const payload = record.payload;
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  if (Array.isArray(data.goalIds)) {
    return data.goalIds.filter((id): id is string => typeof id === "string");
  }
  if (typeof data.primaryGoalId === "string") return [data.primaryGoalId];
  return [];
}

export async function loadEditorialRecordsForAdmin(): Promise<
  AcademyCanonicalRecord[]
> {
  try {
    const filenames = (await readdir(ACADEMY_CANONICAL_EDITORIAL_DIR))
      .filter((filename) => filename.endsWith(".json"))
      .sort();
    if (!filenames.length) return buildOpenBodyEditorialRecords();
    const records = await Promise.all(
      filenames.map(async (filename) => {
        const raw = await readFile(
          path.join(ACADEMY_CANONICAL_EDITORIAL_DIR, filename),
          "utf8",
        );
        return JSON.parse(raw) as AcademyCanonicalRecord;
      }),
    );
    return records;
  } catch {
    return buildOpenBodyEditorialRecords();
  }
}

export function toReviewQueueItems(
  records: readonly AcademyCanonicalRecord[],
): AcademyReviewQueueItem[] {
  return records
    .filter((record) => record.objectType !== "lesson_package")
    .map((record) => {
      const validation = validateCanonicalRecord(record);
      return {
        id: record.id,
        title: record.title,
        objectType: record.objectType,
        status: workflowStatusFromLifecycle(record.lifecycle),
        version: record.version,
        relatedGoalIds: relatedGoalIds(record),
        updatedAt: record.updatedAt ?? record.createdAt ?? "",
        validationValid: validation.valid,
        validationErrors: validation.errors,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function packageReviewSummary(
  records: readonly AcademyCanonicalRecord[],
): {
  readiness: AcademyPackageReadiness;
  validationErrors: string[];
  statuses: Record<string, string>;
} {
  return evaluatePackageReadiness(records);
}
