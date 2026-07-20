import Link from "next/link";
import {
  ACADEMY_ACTIVITY_CATEGORY_LABELS,
  CANONICAL_ACTIVITY_LIBRARY,
  filterCanonicalActivities,
  type AcademyActivityLibraryFilters,
} from "@/lib/academy/activity-library";
import type {
  AcademyActivityCategory,
  AcademyEditorialStatus,
} from "@/lib/academy/types";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

export type ActivityLibraryQuery = {
  query?: string;
  category?: string;
  ageBand?: string;
  difficulty?: string;
  developmentGoalId?: string;
  editorialStatus?: string;
  selectedActivityId?: string;
};

const CATEGORIES = Object.entries(ACADEMY_ACTIVITY_CATEGORY_LABELS) as Array<
  [AcademyActivityCategory, string]
>;
const DIFFICULTIES = ["foundation", "developing", "advanced"] as const;
const EDITORIAL_STATUSES: AcademyEditorialStatus[] = [
  "draft",
  "needs_animation",
  "needs_revision",
  "needs_coach_review",
  "approved",
  "published",
  "archived",
  "rejected",
];

function selectedFilter<T extends string>(
  value: string | undefined,
  options: readonly T[],
): T | undefined {
  return options.includes(value as T) ? (value as T) : undefined;
}

function previewHref(
  query: ActivityLibraryQuery,
  activityId: string,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    activityQuery: query.query,
    activityType: query.category,
    activityAge: query.ageBand,
    activityDifficulty: query.difficulty,
    activityGoal: query.developmentGoalId,
    activityStatus: query.editorialStatus,
    academyActivityId: activityId,
  })) {
    if (value) params.set(key, value);
  }
  return `/admin/academy?${params.toString()}#activity-library`;
}

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
        <p className="mt-2 text-sm text-zinc-500">None linked.</p>
      )}
    </section>
  );
}

export default function ActivityLibrarySection({
  query,
}: {
  query: ActivityLibraryQuery;
}) {
  const categories = CATEGORIES.map(([value]) => value);
  const filters: AcademyActivityLibraryFilters = {
    query: query.query,
    category: selectedFilter(query.category, categories),
    ageBand: query.ageBand,
    difficulty: selectedFilter(query.difficulty, DIFFICULTIES),
    developmentGoalId: query.developmentGoalId,
    editorialStatus: selectedFilter(
      query.editorialStatus,
      EDITORIAL_STATUSES,
    ),
  };
  const activities = filterCanonicalActivities(filters);
  const selectedActivity =
    activities.find(
      (activity) => activity.id === query.selectedActivityId,
    ) ?? activities[0];
  const goalById = new Map(
    U12_ACADEMY_GOAL_CATALOG.goals.map((goal) => [goal.id, goal]),
  );
  const evidenceById = new Map(
    U12_ACADEMY_GOAL_CATALOG.evidenceTags.map((tag) => [tag.id, tag]),
  );
  const availableAgeBands = [
    ...new Set(CANONICAL_ACTIVITY_LIBRARY.flatMap((item) => item.ageBands)),
  ].sort();
  const availableGoalIds = [
    ...new Set(CANONICAL_ACTIVITY_LIBRARY.flatMap((item) => item.goalIds)),
  ];

  return (
    <section id="activity-library" className="mt-10 border-t border-white/10 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            Canonical content
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Activity Library
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            Browse reusable activities referenced by lessons and future
            practice templates. Editing a canonical activity updates every
            composition that references its stable ID.
          </p>
        </div>
        <span className="text-sm text-zinc-400">
          {activities.length} of {CANONICAL_ACTIVITY_LIBRARY.length} activities
        </span>
      </div>

      <form
        action="/admin/academy#activity-library"
        className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <label className="text-xs text-zinc-400 md:col-span-3 xl:col-span-2">
          Search
          <input
            type="search"
            name="activityQuery"
            defaultValue={query.query}
            placeholder="Title, cue, tag, or ID"
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
          />
        </label>
        <FilterSelect
          label="Activity type"
          name="activityType"
          value={query.category}
          options={CATEGORIES}
        />
        <FilterSelect
          label="Age group"
          name="activityAge"
          value={query.ageBand}
          options={availableAgeBands.map((ageBand) => [ageBand, ageBand])}
        />
        <FilterSelect
          label="Difficulty"
          name="activityDifficulty"
          value={query.difficulty}
          options={DIFFICULTIES.map((difficulty) => [
            difficulty,
            difficulty.replaceAll("_", " "),
          ])}
        />
        <FilterSelect
          label="Development goal"
          name="activityGoal"
          value={query.developmentGoalId}
          options={availableGoalIds.map((goalId) => [
            goalId,
            goalById.get(goalId)?.title ?? goalId,
          ])}
        />
        <FilterSelect
          label="Editorial status"
          name="activityStatus"
          value={query.editorialStatus}
          options={EDITORIAL_STATUSES.map((status) => [
            status,
            status.replaceAll("_", " "),
          ])}
        />
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-cyan-200"
          >
            Apply filters
          </button>
          <Link
            href="/admin/academy#activity-library"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
          >
            Clear
          </Link>
        </div>
      </form>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
        <div className="space-y-2">
          {activities.map((activity) => (
            <Link
              key={activity.id}
              href={previewHref(query, activity.id)}
              className={`block rounded-xl border p-4 ${
                selectedActivity?.id === activity.id
                  ? "border-cyan-400/50 bg-cyan-400/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-cyan-300">
                {ACADEMY_ACTIVITY_CATEGORY_LABELS[activity.category]}
              </p>
              <h3 className="mt-1 font-medium text-white">{activity.title}</h3>
              <p className="mt-1 text-xs text-zinc-500">
                {activity.ageBands.join(", ")} · {activity.difficulty} · v
                {activity.version}
              </p>
              <p className="mt-2 text-sm leading-5 text-zinc-400">
                {activity.summary}
              </p>
            </Link>
          ))}
          {!activities.length ? (
            <p className="rounded-xl border border-white/10 p-4 text-sm text-zinc-400">
              No canonical activities match these filters.
            </p>
          ) : null}
        </div>

        {selectedActivity ? (
          <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-cyan-300">
                  {ACADEMY_ACTIVITY_CATEGORY_LABELS[selectedActivity.category]}{" "}
                  · {selectedActivity.activityType.replaceAll("_", " ")}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-white">
                  {selectedActivity.title}
                </h3>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  {selectedActivity.id}
                </p>
              </div>
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100">
                {selectedActivity.editorial.status.replaceAll("_", " ")}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-300">
              {selectedActivity.description}
            </p>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Age", `${selectedActivity.ageRange.min}–${selectedActivity.ageRange.max}`],
                ["Difficulty", selectedActivity.difficulty],
                ["Duration", `${selectedActivity.durationMinutes.default} min`],
                [
                  "Players",
                  `${selectedActivity.playerCount.min}–${selectedActivity.playerCount.max}`,
                ],
                [
                  "Field",
                  `${selectedActivity.field.length} × ${selectedActivity.field.width} ${selectedActivity.field.unit}`,
                ],
                ["Version", String(selectedActivity.version)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-white/10 bg-zinc-950/50 p-3"
                >
                  <dt className="text-xs uppercase text-zinc-500">{label}</dt>
                  <dd className="mt-1 text-sm capitalize text-white">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <DetailList
                title="Setup"
                items={selectedActivity.setupInstructions}
              />
              <DetailList
                title="Organization"
                items={selectedActivity.organization}
              />
              <DetailList
                title="Instructions"
                items={selectedActivity.howItWorks}
              />
              <DetailList
                title="Coaching points"
                items={selectedActivity.coachingPoints}
              />
              <DetailList
                title="Common errors"
                items={selectedActivity.commonMistakes.map(
                  (item) => `${item.mistake} Correction: ${item.correction}`,
                )}
              />
              <DetailList
                title="Progressions"
                items={selectedActivity.progressions.map(
                  (item) => `${item.title}: ${item.description}`,
                )}
              />
              <DetailList
                title="Regressions"
                items={selectedActivity.regressions.map(
                  (item) => `${item.title}: ${item.description}`,
                )}
              />
              <DetailList
                title="Safety notes"
                items={selectedActivity.safetyNotes}
              />
              <DetailList
                title="Development goals"
                items={selectedActivity.goalIds.map(
                  (goalId) => goalById.get(goalId)?.title ?? goalId,
                )}
              />
              <DetailList
                title="Related evidence"
                items={selectedActivity.evidenceTagIds.map(
                  (tagId) => evidenceById.get(tagId)?.label ?? tagId,
                )}
              />
              <DetailList
                title="Related lessons"
                items={selectedActivity.relatedLessonIds}
              />
              <DetailList
                title="Equipment"
                items={selectedActivity.equipment}
              />
            </div>
          </article>
        ) : (
          <p className="text-sm text-zinc-400">
            Select an activity to preview it.
          </p>
        )}
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value?: string;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="text-xs text-zinc-400">
      {label}
      <select
        name={name}
        defaultValue={value ?? ""}
        className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm capitalize text-white"
      >
        <option value="">All</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

