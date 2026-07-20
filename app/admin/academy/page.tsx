import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  ACADEMY_SOURCE_REGISTRY_DIR,
  academyReportPath,
} from "@/lib/academy/paths";
import type { AcademySourceDocument } from "@/lib/academy/types";
import {
  loadEditorialRecordsForAdmin,
  packageReviewSummary,
  toReviewQueueItems,
} from "@/lib/academy/editorial-loader";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";
import ActivityLibrarySection from "./ActivityLibrarySection";
import GoalReviewClient from "./GoalReviewClient";
import LessonReviewPreview from "./LessonReviewPreview";
import PackageReviewPanel from "./PackageReviewPanel";
import ReviewQueue from "./ReviewQueue";

export const dynamic = "force-dynamic";

type ImportReport = {
  documentsDiscovered?: number;
  pagesProcessed?: number;
  sourceItemsIndexed?: number;
  editorialQueueSize?: number;
  documents?: Array<{
    id: string;
    pageCount: number;
    indexedItemCount: number;
    confidence: string;
  }>;
};

type AcademyAdminSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function readJson<T>(filename: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filename, "utf8")) as T;
  } catch {
    return null;
  }
}

async function loadDocuments(): Promise<AcademySourceDocument[]> {
  try {
    const filenames = (await readdir(ACADEMY_SOURCE_REGISTRY_DIR))
      .filter((filename) => filename.endsWith(".json"))
      .sort();
    const records = await Promise.all(
      filenames.map((filename) =>
        readJson<AcademySourceDocument>(
          path.join(ACADEMY_SOURCE_REGISTRY_DIR, filename),
        ),
      ),
    );
    return records.filter(
      (record): record is AcademySourceDocument => record !== null,
    );
  } catch {
    return [];
  }
}

export default async function AcademyAdminPage({
  searchParams,
}: {
  searchParams: AcademyAdminSearchParams;
}) {
  // Source records are filesystem-only private references. Keep this route
  // development-only until server-verified product-admin auth is available.
  const enabled =
    process.env.NODE_ENV === "development" &&
    process.env.ACADEMY_ADMIN_ENABLED !== "false";
  if (!enabled) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-zinc-100">
        <h1 className="text-2xl font-semibold">Academy admin</h1>
        <p className="mt-3 text-sm text-zinc-400">Not available.</p>
      </main>
    );
  }

  const [documents, report, params, editorialRecords] = await Promise.all([
    loadDocuments(),
    readJson<ImportReport>(academyReportPath("source-import.json")),
    searchParams,
    loadEditorialRecordsForAdmin(),
  ]);
  const reportById = new Map(
    report?.documents?.map((document) => [document.id, document]) ?? [],
  );
  const reviewItems = toReviewQueueItems(editorialRecords);
  const packageSummary = packageReviewSummary(editorialRecords);

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 text-zinc-100">
      <h1 className="text-2xl font-semibold">Film Room Academy editorial</h1>
      <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
        <strong>Private reference only.</strong> Never expose source files,
        extracted wording, or source diagrams publicly. Every product draft
        requires original wording, a new board layout, and human review.
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Documents", documents.length],
          ["Pages indexed", report?.pagesProcessed ?? "—"],
          ["Editorial queue", report?.editorialQueueSize ?? "—"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              {label}
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-white">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Private source registry</h2>
        {documents.length ? (
          <ul className="mt-3 space-y-3">
            {documents.map((document) => {
              const details = reportById.get(document.id);
              return (
                <li
                  key={document.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium text-white">{document.title}</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        {document.filename}
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-400/25 px-2.5 py-1 text-xs text-amber-200">
                      {document.licenseStatus.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-zinc-400">
                    {details
                      ? `${details.pageCount} pages · ${details.indexedItemCount} internal items · ${details.confidence} extraction confidence`
                      : "Not indexed yet"}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">
            No registered Academy sources.
          </p>
        )}
      </section>
      <ReviewQueue
        items={reviewItems}
        query={{
          objectType: firstParam(params.reviewType),
          status: firstParam(params.reviewStatus),
          developmentGoalId: firstParam(params.reviewGoal),
          validation: firstParam(params.reviewValidation),
        }}
      />
      <PackageReviewPanel
        records={editorialRecords}
        readiness={packageSummary.readiness}
        validationErrors={packageSummary.validationErrors}
      />
      <GoalReviewClient
        goals={U12_ACADEMY_GOAL_CATALOG.goals}
        domains={U12_ACADEMY_GOAL_CATALOG.domains}
        blocks={U12_ACADEMY_GOAL_CATALOG.blocks}
        evidenceTags={U12_ACADEMY_GOAL_CATALOG.evidenceTags}
      />
      <ActivityLibrarySection
        query={{
          query: firstParam(params.activityQuery),
          category: firstParam(params.activityType),
          ageBand: firstParam(params.activityAge),
          difficulty: firstParam(params.activityDifficulty),
          developmentGoalId: firstParam(params.activityGoal),
          editorialStatus: firstParam(params.activityStatus),
          selectedActivityId: firstParam(params.academyActivityId),
        }}
      />
      <LessonReviewPreview />
    </main>
  );
}
