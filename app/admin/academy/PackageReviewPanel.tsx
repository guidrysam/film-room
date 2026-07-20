import Link from "next/link";
import type { AcademyPackageReadiness } from "@/lib/academy/editorial-repository";
import { OPEN_BODY_PACKAGE_ID } from "@/lib/academy/open-body-package";
import type { AcademyCanonicalRecord } from "@/lib/academy/types";
import { workflowStatusFromLifecycle } from "@/lib/academy/editorial-transitions";

const TREE_LABELS: Record<string, string> = {
  [OPEN_BODY_PACKAGE_ID]: "Package",
  "academy-lesson-receive-open-body": "Lesson",
  "academy-warmup-open-body-gates": "Warmup",
  "academy-activity-open-body-diamond": "Technical Activity",
  "academy-ssg-open-body-end-zones": "Small-Sided Game",
  "academy-assignment-open-body-three-moments": "Assignment",
  "academy-quiz-receive-open-body": "Quiz",
};

export default function PackageReviewPanel({
  records,
  readiness,
  validationErrors,
}: {
  records: AcademyCanonicalRecord[];
  readiness: AcademyPackageReadiness;
  validationErrors: string[];
}) {
  const packageRecord = records.find(
    (record) => record.id === OPEN_BODY_PACKAGE_ID,
  );
  const members = records.filter((record) =>
    [
      "academy-lesson-receive-open-body",
      "academy-warmup-open-body-gates",
      "academy-activity-open-body-diamond",
      "academy-ssg-open-body-end-zones",
      "academy-assignment-open-body-three-moments",
      "academy-quiz-receive-open-body",
    ].includes(record.id),
  );

  return (
    <section id="package-review" className="mt-10 border-t border-white/10 pt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
            Package review
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Receive with an Open Body
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Package-level readiness for atomic CLI publish. Members must be
            approved before publication.
          </p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs capitalize text-zinc-100">
          {readiness.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-semibold text-white">Dependency tree</h3>
          <ul className="mt-3 space-y-2 font-mono text-sm text-zinc-300">
            <li>
              {TREE_LABELS[OPEN_BODY_PACKAGE_ID]} ·{" "}
              {packageRecord
                ? workflowStatusFromLifecycle(
                    packageRecord.lifecycle,
                  ).replaceAll("_", " ")
                : "missing"}
            </li>
            {members.map((member) => (
              <li key={member.id} className="pl-4">
                ├──{" "}
                <Link
                  href={`/admin/academy/review/${member.id}`}
                  className="text-cyan-200 hover:text-cyan-100"
                >
                  {TREE_LABELS[member.id] ?? member.title}
                </Link>{" "}
                ·{" "}
                {workflowStatusFromLifecycle(member.lifecycle).replaceAll(
                  "_",
                  " ",
                )}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-semibold text-white">CLI actions</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Browser writes are disabled. Use an allowlisted actor:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs leading-6 text-zinc-300">
{`export ACADEMY_EDITOR_ACTOR=you@example.com
export ACADEMY_EDITOR_ALLOWLIST=you@example.com
npm run academy:editorial:seed
npm run academy:editorial:approve-package
npm run academy:editorial:publish-package
npm run academy:editorial:unpublish-package`}
          </pre>
          {validationErrors.length ? (
            <ul className="mt-4 space-y-1.5 text-sm text-rose-300">
              {validationErrors.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-emerald-300">
              No package validation errors at the current readiness stage.
            </p>
          )}
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
                title="Use authorized CLI commands. Browser editorial writes are disabled."
                className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-500"
              >
                {label}
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
