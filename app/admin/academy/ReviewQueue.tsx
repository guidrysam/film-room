import Link from "next/link";
import type { AcademyReviewQueueItem } from "@/lib/academy/editorial-loader";
import type { AcademyWorkflowStatus } from "@/lib/academy/types";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

export type ReviewQueueQuery = {
  objectType?: string;
  status?: string;
  developmentGoalId?: string;
  validation?: string;
};

const OBJECT_TYPES = [
  "lesson",
  "activity",
  "warmup",
  "small_sided_game",
  "assignment",
  "quiz",
  "quiz_question",
] as const;

const STATUSES: AcademyWorkflowStatus[] = [
  "draft",
  "needs_coach_review",
  "approved",
  "published",
  "rejected",
];

export default function ReviewQueue({
  items,
  query,
}: {
  items: AcademyReviewQueueItem[];
  query: ReviewQueueQuery;
}) {
  const goalById = new Map(
    U12_ACADEMY_GOAL_CATALOG.goals.map((goal) => [goal.id, goal.title]),
  );
  const filtered = items.filter((item) => {
    if (query.objectType && item.objectType !== query.objectType) return false;
    if (query.status && item.status !== query.status) return false;
    if (
      query.developmentGoalId &&
      !item.relatedGoalIds.includes(query.developmentGoalId)
    ) {
      return false;
    }
    if (query.validation === "errors" && item.validationValid) return false;
    if (query.validation === "valid" && !item.validationValid) return false;
    return true;
  });
  const goalOptions = [
    ...new Set(items.flatMap((item) => item.relatedGoalIds)),
  ];

  return (
    <section id="review-queue" className="mt-10 border-t border-white/10 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-300">
            Editorial workflow
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Review queue</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            Read-only review surface. Approve, reject, publish, and unpublish
            through authorized CLI commands using{" "}
            <code className="text-zinc-300">ACADEMY_EDITOR_ACTOR</code> and{" "}
            <code className="text-zinc-300">ACADEMY_EDITOR_ALLOWLIST</code>.
          </p>
        </div>
        <span className="text-sm text-zinc-400">
          {filtered.length} of {items.length} objects
        </span>
      </div>

      <form
        action="/admin/academy#review-queue"
        className="mt-5 grid gap-3 md:grid-cols-4"
      >
        <label className="text-xs text-zinc-400">
          Object type
          <select
            name="reviewType"
            defaultValue={query.objectType ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All types</option>
            {OBJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Editorial status
          <select
            name="reviewStatus"
            defaultValue={query.status ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Development goal
          <select
            name="reviewGoal"
            defaultValue={query.developmentGoalId ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All goals</option>
            {goalOptions.map((goalId) => (
              <option key={goalId} value={goalId}>
                {goalById.get(goalId) ?? goalId}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Validation
          <select
            name="reviewValidation"
            defaultValue={query.validation ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All</option>
            <option value="valid">Valid only</option>
            <option value="errors">Validation errors</option>
          </select>
        </label>
        <div className="flex items-end gap-2 md:col-span-4">
          <button
            type="submit"
            className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-200"
          >
            Apply filters
          </button>
          <Link
            href="/admin/academy#review-queue"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
          >
            Clear
          </Link>
        </div>
      </form>

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Goal</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Validation</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/academy/review/${item.id}`}
                    className="font-medium text-cyan-200 hover:text-cyan-100"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-zinc-500">
                    {item.id}
                  </p>
                </td>
                <td className="px-4 py-3 capitalize text-zinc-300">
                  {item.objectType.replaceAll("_", " ")}
                </td>
                <td className="px-4 py-3 capitalize text-zinc-300">
                  {item.status.replaceAll("_", " ")}
                </td>
                <td className="px-4 py-3 text-zinc-300">v{item.version}</td>
                <td className="px-4 py-3 text-zinc-300">
                  {item.relatedGoalIds
                    .map((goalId) => goalById.get(goalId) ?? goalId)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {item.updatedAt
                    ? new Date(item.updatedAt).toLocaleString()
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      item.validationValid
                        ? "text-emerald-300"
                        : "text-rose-300"
                    }
                  >
                    {item.validationValid
                      ? "Valid"
                      : `${item.validationErrors.length} errors`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
