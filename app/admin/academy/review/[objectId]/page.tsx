import Link from "next/link";
import { notFound } from "next/navigation";
import { validateCanonicalRecord } from "@/lib/academy/catalog-validation";
import { loadEditorialRecordsForAdmin } from "@/lib/academy/editorial-loader";
import { workflowStatusFromLifecycle } from "@/lib/academy/editorial-transitions";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

export const dynamic = "force-dynamic";

function DetailList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-1.5 text-sm leading-6 text-zinc-300">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">None.</p>
      )}
    </section>
  );
}

export default async function AcademyObjectReviewPage({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const enabled =
    process.env.NODE_ENV === "development" &&
    process.env.ACADEMY_ADMIN_ENABLED !== "false";
  if (!enabled) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-zinc-100">
        <h1 className="text-2xl font-semibold">Academy review</h1>
        <p className="mt-3 text-sm text-zinc-400">Not available.</p>
      </main>
    );
  }

  const { objectId } = await params;
  const records = await loadEditorialRecordsForAdmin();
  const record = records.find((item) => item.id === objectId);
  if (!record) notFound();

  const validation = validateCanonicalRecord(record);
  const payload = (record.payload ?? {}) as Record<string, unknown>;
  const goalIds = Array.isArray(payload.goalIds)
    ? payload.goalIds.filter((id): id is string => typeof id === "string")
    : typeof payload.primaryGoalId === "string"
      ? [payload.primaryGoalId]
      : [];
  const evidenceTagIds = Array.isArray(payload.evidenceTagIds)
    ? payload.evidenceTagIds.filter((id): id is string => typeof id === "string")
    : [];
  const referenced = [
    ...(Array.isArray(payload.activityIds) ? payload.activityIds : []),
    ...(Array.isArray(payload.relatedLessonIds) ? payload.relatedLessonIds : []),
    ...(Array.isArray(payload.relatedAssignmentIds)
      ? payload.relatedAssignmentIds
      : []),
    ...(Array.isArray(payload.relatedQuizIds) ? payload.relatedQuizIds : []),
    ...(Array.isArray(payload.questionIds) ? payload.questionIds : []),
    ...(Array.isArray(payload.memberIds) ? payload.memberIds : []),
  ].filter((id): id is string => typeof id === "string");
  const status = workflowStatusFromLifecycle(record.lifecycle);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 text-zinc-100">
      <Link
        href="/admin/academy#review-queue"
        className="text-sm text-cyan-300 hover:text-cyan-200"
      >
        ← Back to review queue
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-300">
            {record.objectType.replaceAll("_", " ")}
          </p>
          <h1 className="mt-1 text-3xl font-semibold">{record.title}</h1>
          <p className="mt-1 font-mono text-xs text-zinc-500">{record.id}</p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs capitalize text-amber-100">
          {status.replaceAll("_", " ")}
        </span>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Version", `v${record.version}`],
          ["Updated", record.updatedAt ?? "—"],
          ["Reviewed by", record.reviewedBy ?? "—"],
          ["Published at", record.publishedAt ?? "—"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <dt className="text-xs uppercase text-zinc-500">{label}</dt>
            <dd className="mt-1 text-sm text-white">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold text-white">Rendered preview</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            {typeof payload.summary === "string"
              ? payload.summary
              : typeof payload.description === "string"
                ? payload.description
                : typeof payload.prompt === "string"
                  ? payload.prompt
                  : record.title}
          </p>
          {typeof payload.learningObjective === "string" ? (
            <p className="mt-3 text-sm text-zinc-400">
              Objective: {payload.learningObjective}
            </p>
          ) : null}
        </article>
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold text-white">Validation</h2>
          {validation.valid ? (
            <p className="mt-3 text-sm text-emerald-300">Object schema is valid.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm text-rose-300">
              {validation.errors.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          )}
        </article>
        <DetailList
          title="Related goals"
          items={goalIds.map(
            (goalId) =>
              U12_ACADEMY_GOAL_CATALOG.goals.find((goal) => goal.id === goalId)
                ?.title ?? goalId,
          )}
        />
        <DetailList
          title="Related evidence tags"
          items={evidenceTagIds.map(
            (tagId) =>
              U12_ACADEMY_GOAL_CATALOG.evidenceTags.find(
                (tag) => tag.id === tagId,
              )?.label ?? tagId,
          )}
        />
        <DetailList title="Referenced objects" items={referenced} />
        <DetailList
          title="Editorial notes"
          items={record.editorialNotes.length ? record.editorialNotes : ["None"]}
        />
        <DetailList
          title="Version history"
          items={record.versionHistory.map(
            (entry) =>
              `v${entry.version} · ${entry.changedBy} · ${entry.summary}`,
          )}
        />
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold text-white">Actions</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Write actions are CLI-only and require allowlisted actors. Rejection
            requires <code>--reason</code>. Publish/unpublish require package
            confirmation via the package CLI commands.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "Send for review",
              "Approve",
              "Reject",
              "Publish",
              "Unpublish",
              "Return to draft",
            ].map((label) => (
              <button
                key={label}
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-500"
              >
                {label}
              </button>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
