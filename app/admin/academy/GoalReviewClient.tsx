"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AcademyEditorialStatus,
  AcademyGameEvidenceTag,
  AcademyGoal,
  AcademyGoalDomain,
  AcademyPositionGroup,
  AcademySeasonBlockDefinition,
} from "@/lib/academy/types";

type GoalReviewClientProps = {
  goals: AcademyGoal[];
  domains: AcademyGoalDomain[];
  blocks: AcademySeasonBlockDefinition[];
  evidenceTags: AcademyGameEvidenceTag[];
};

type ReviewStatus = Extract<
  AcademyEditorialStatus,
  "needs_revision" | "needs_coach_review" | "approved" | "rejected"
>;

const REVIEW_STORAGE_KEY = "film-room-academy-u12-goal-reviews-v1";
const REVIEW_STATUSES: Array<{ value: ReviewStatus; label: string }> = [
  { value: "needs_revision", label: "Needs revision" },
  { value: "needs_coach_review", label: "Needs coach review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function titleForPosition(position: AcademyPositionGroup): string {
  return position.replaceAll("_", " ");
}

export default function GoalReviewClient({
  goals,
  domains,
  blocks,
  evidenceTags,
}: GoalReviewClientProps) {
  const [query, setQuery] = useState("");
  const [domainId, setDomainId] = useState("all");
  const [blockId, setBlockId] = useState("all");
  const [position, setPosition] = useState("all");
  const [selectedGoalId, setSelectedGoalId] = useState(goals[0]?.id ?? "");
  const [reviewStatuses, setReviewStatuses] = useState<
    Record<string, ReviewStatus>
  >({});

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(REVIEW_STORAGE_KEY);
      if (stored) {
        setReviewStatuses(JSON.parse(stored) as Record<string, ReviewStatus>);
      }
    } catch {
      // A blocked or malformed local review cache must not hide canonical goals.
    }
  }, []);

  const tagById = useMemo(
    () => new Map(evidenceTags.map((tag) => [tag.id, tag])),
    [evidenceTags],
  );
  const goalById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal])),
    [goals],
  );
  const filteredGoals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return goals.filter((goal) => {
      if (domainId !== "all" && goal.domainId !== domainId) return false;
      if (
        blockId !== "all" &&
        !goal.seasonalPlacement.some(
          (placement) => placement.blockId === blockId,
        )
      ) {
        return false;
      }
      if (
        position !== "all" &&
        !goal.positionRelevance.some(
          (item) => item.positionGroup === position,
        )
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      const evidenceText = goal.gameEvidenceTags
        .map((tagId) => {
          const tag = tagById.get(tagId);
          return `${tagId} ${tag?.label ?? ""}`;
        })
        .join(" ");
      return `${goal.title} ${goal.description} ${evidenceText}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [blockId, domainId, goals, position, query, tagById]);
  const selectedGoal =
    goalById.get(selectedGoalId) ?? filteredGoals[0] ?? goals[0];

  function updateReviewStatus(goalId: string, status: ReviewStatus): void {
    setReviewStatuses((current) => {
      const next = { ...current, [goalId]: status };
      window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <section className="mt-10 border-t border-white/10 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">U11–U12 goal review</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Review decisions are saved in this browser. Canonical goals remain
            unchanged until a reviewed status is committed to source control.
          </p>
        </div>
        <span className="text-sm text-zinc-400">
          {filteredGoals.length} of {goals.length} goals
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <label className="text-xs text-zinc-400 md:col-span-4">
          Search title or evidence tag
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
            placeholder="scan, successful delay, buildup turnover…"
          />
        </label>
        <label className="text-xs text-zinc-400">
          Domain
          <select
            value={domainId}
            onChange={(event) => setDomainId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            <option value="all">All domains</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Development block
          <select
            value={blockId}
            onChange={(event) => setBlockId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            <option value="all">All blocks</option>
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Position
          <select
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm capitalize text-white"
          >
            <option value="all">All positions</option>
            {[
              "goalkeeper",
              "defender",
              "outside_defender",
              "central_defender",
              "midfielder",
              "wide_player",
              "forward",
            ].map((item) => (
              <option key={item} value={item}>
                {titleForPosition(item as AcademyPositionGroup)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setDomainId("all");
            setBlockId("all");
            setPosition("all");
          }}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
        >
          Clear filters
        </button>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
          {filteredGoals.map((goal) => {
            const status = reviewStatuses[goal.id] ?? goal.editorial.status;
            return (
              <button
                type="button"
                key={goal.id}
                onClick={() => setSelectedGoalId(goal.id)}
                className={`w-full rounded-lg border p-3 text-left ${
                  selectedGoal?.id === goal.id
                    ? "border-cyan-400/50 bg-cyan-400/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <span className="block text-sm font-medium text-white">
                  {goal.title}
                </span>
                <span className="mt-1 block text-xs text-zinc-500">
                  {domains.find((domain) => domain.id === goal.domainId)?.title} ·{" "}
                  {status.replaceAll("_", " ")}
                </span>
              </button>
            );
          })}
        </div>

        {selectedGoal ? (
          <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-wide text-cyan-300">
              {selectedGoal.domainId.replaceAll("-", " ")}
            </p>
            <h3 className="mt-1 text-xl font-semibold">{selectedGoal.title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {selectedGoal.description}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {REVIEW_STATUSES.map((status) => (
                <button
                  type="button"
                  key={status.value}
                  onClick={() =>
                    updateReviewStatus(selectedGoal.id, status.value)
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    (reviewStatuses[selectedGoal.id] ??
                      selectedGoal.editorial.status) === status.value
                      ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
                      : "border-white/10 text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <GoalList
                title="Prerequisites"
                items={selectedGoal.prerequisiteGoalIds.map(
                  (id) => goalById.get(id)?.title ?? id,
                )}
              />
              <GoalList
                title="Related goals"
                items={selectedGoal.relatedGoalIds.map(
                  (id) => goalById.get(id)?.title ?? id,
                )}
              />
              <GoalList
                title="Observable indicators"
                items={selectedGoal.observableIndicators}
              />
              <GoalList
                title="Coach feedback"
                items={selectedGoal.coachFeedbackExamples}
              />
              <GoalList
                title="Common failure patterns"
                items={selectedGoal.commonFailurePatterns.map(
                  (pattern) => `${pattern.title}: ${pattern.description}`,
                )}
              />
              <GoalList
                title="Game evidence"
                items={selectedGoal.gameEvidenceTags.map((id) => {
                  const tag = tagById.get(id);
                  return `${tag?.category ?? "unknown"} · ${tag?.label ?? id}`;
                })}
              />
            </div>
          </article>
        ) : (
          <p className="text-sm text-zinc-400">No goal matches these filters.</p>
        )}
      </div>
    </section>
  );
}

function GoalList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-1.5 text-sm text-zinc-400">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">Foundational — none.</p>
      )}
    </section>
  );
}
