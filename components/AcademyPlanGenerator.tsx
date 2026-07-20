"use client";

import { useEffect, useMemo, useState } from "react";
import {
  generateDeterministicGamePlan,
  generateDeterministicPractice,
} from "@/lib/academy/plan-generation";
import type {
  GeneratedAcademyGamePlan,
  GeneratedAcademyPractice,
  PracticeGenerationRequest,
} from "@/lib/academy/types";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

const EQUIPMENT = ["balls", "cones", "pinnies", "mini goals", "goals"];
const DEFAULT_GOALS = [
  "u12-scan-before-receiving",
  "u12-support-angle-distance",
];

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-blue-500"
      />
      {label}
    </label>
  );
}

function PracticeResult({ practice }: { practice: GeneratedAcademyPractice }) {
  return (
    <section className="space-y-4" aria-label="Generated practice plan">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
          Deterministic practice
        </p>
        <h3 className="mt-1 text-xl font-semibold text-white">
          {practice.title}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          {practice.durationMinutes} minutes · {practice.rosterSize} players
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {practice.sections.map((section) => (
          <article
            key={section.id}
            className="rounded-xl border border-white/10 bg-black/20 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-medium text-white">{section.title}</h4>
              <span className="shrink-0 rounded bg-white/10 px-2 py-1 text-xs text-zinc-300">
                {section.durationMinutes} min
              </span>
            </div>
            {section.drillId ? (
              <p className="mt-2 text-xs text-blue-300">
                Drill: {section.drillId}
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-300">
                Coach-selected activity needed
              </p>
            )}
            <ul className="mt-3 space-y-1 text-sm text-zinc-300">
              {section.coachingPoints.slice(0, 3).map((point) => (
                <li key={point}>• {point}</li>
              ))}
            </ul>
            {section.reflectionPrompts?.length ? (
              <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm text-zinc-300">
                {section.reflectionPrompts.map((prompt) => (
                  <li key={prompt}>• {prompt}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
      {practice.recommendationWarnings.length ? (
        <details className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">
          <summary className="cursor-pointer font-medium">
            Content notes ({practice.recommendationWarnings.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {practice.recommendationWarnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function GamePlanResult({ plan }: { plan: GeneratedAcademyGamePlan }) {
  const groups = [
    ["Pregame objectives", plan.pregameObjectives],
    ["Today’s coaching focus", plan.coachingFocus],
    ["Key reminders", plan.keyReminders],
    ["Warm-up focus", plan.warmUpFocus],
    ["Formation notes", plan.formationNotes ?? []],
    ["Transition emphasis", plan.transitionEmphasis],
    ["Bench reminders", plan.benchReminders],
    ["Halftime discussion", plan.halftimeDiscussionPoints],
    ["Postgame reflection", plan.postgameReflectionPrompts],
  ] as const;
  return (
    <section className="space-y-4" aria-label="Generated game plan">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-violet-300">
          Deterministic game plan
        </p>
        <h3 className="mt-1 text-xl font-semibold text-white">{plan.title}</h3>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {groups
          .filter(([, items]) => items.length > 0)
          .map(([title, items]) => (
            <article
              key={title}
              className="rounded-xl border border-white/10 bg-black/20 p-4"
            >
              <h4 className="font-medium text-white">{title}</h4>
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </article>
          ))}
      </div>
      {plan.opponentNotes ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h4 className="text-sm font-medium text-white">Opponent notes</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
            {plan.opponentNotes}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export default function AcademyPlanGenerator() {
  const [selectedGoalIds, setSelectedGoalIds] =
    useState<string[]>(DEFAULT_GOALS);
  const [domainId, setDomainId] = useState("all");
  const [durationMinutes, setDurationMinutes] =
    useState<PracticeGenerationRequest["durationMinutes"]>(75);
  const [rosterSize, setRosterSize] = useState(14);
  const [goalkeeperCount, setGoalkeeperCount] = useState(1);
  const [fieldLength, setFieldLength] = useState(50);
  const [fieldWidth, setFieldWidth] = useState(35);
  const [equipment, setEquipment] = useState<string[]>(EQUIPMENT);
  const [opponentNotes, setOpponentNotes] = useState("");
  const [formationName, setFormationName] = useState("3-2-3");
  const [practice, setPractice] = useState<GeneratedAcademyPractice | null>(
    null,
  );
  const [gamePlan, setGamePlan] = useState<GeneratedAcademyGamePlan | null>(
    null,
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const goalParam = new URLSearchParams(window.location.search).get("goals");
      if (!goalParam) return;
      const validGoalIds = new Set(
        U12_ACADEMY_GOAL_CATALOG.goals.map((goal) => goal.id),
      );
      const confirmedGoalIds = goalParam
        .split(",")
        .filter((goalId) => validGoalIds.has(goalId));
      if (confirmedGoalIds.length) setSelectedGoalIds(confirmedGoalIds);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const visibleGoals = useMemo(
    () =>
      U12_ACADEMY_GOAL_CATALOG.goals.filter(
        (goal) => domainId === "all" || goal.domainId === domainId,
      ),
    [domainId],
  );

  function toggleGoal(goalId: string) {
    setSelectedGoalIds((current) =>
      current.includes(goalId)
        ? current.filter((id) => id !== goalId)
        : [...current, goalId],
    );
  }

  function generatePractice() {
    if (!selectedGoalIds.length) return;
    setPractice(
      generateDeterministicPractice(U12_ACADEMY_GOAL_CATALOG, {
        academyPresetId: U12_ACADEMY_GOAL_CATALOG.id,
        ageBand: "U11-U12",
        durationMinutes,
        playerCount: rosterSize,
        goalkeeperCount,
        primaryGoalIds: selectedGoalIds.slice(0, 3),
        supportingGoalIds: selectedGoalIds.slice(3),
        availableEquipment: equipment,
        fieldSize: {
          length: fieldLength,
          width: fieldWidth,
          unit: "yards",
        },
      }),
    );
  }

  function generateGamePlan() {
    if (!selectedGoalIds.length) return;
    setGamePlan(
      generateDeterministicGamePlan(U12_ACADEMY_GOAL_CATALOG, {
        ageBand: "U11-U12",
        selectedGoalIds,
        opponentNotes,
        formationName,
      }),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-300">
              Goal-first planning
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Practice & game plan generator
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Select confirmed Development Goals. Plans are assembled from the
              graph and existing drill metadata without AI.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
          >
            Print current plans
          </button>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Filter goals by domain
              <select
                value={domainId}
                onChange={(event) => setDomainId(event.target.value)}
                className="mt-2 block w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                <option value="all">All domains</option>
                {U12_ACADEMY_GOAL_CATALOG.domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {visibleGoals.map((goal) => (
                <Toggle
                  key={goal.id}
                  checked={selectedGoalIds.includes(goal.id)}
                  label={goal.title}
                  onChange={() => toggleGoal(goal.id)}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {selectedGoalIds.length} selected · first 3 are practice priorities
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-400">
              Practice duration
              <select
                value={durationMinutes}
                onChange={(event) =>
                  setDurationMinutes(
                    Number(event.target.value) as
                      PracticeGenerationRequest["durationMinutes"],
                  )
                }
                className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                {[45, 60, 75, 90].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Roster size
              <input
                type="number"
                min={4}
                max={24}
                value={rosterSize}
                onChange={(event) => setRosterSize(Number(event.target.value))}
                className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Goalkeepers
              <input
                type="number"
                min={0}
                max={3}
                value={goalkeeperCount}
                onChange={(event) =>
                  setGoalkeeperCount(Number(event.target.value))
                }
                className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Formation (optional)
              <input
                value={formationName}
                onChange={(event) => setFormationName(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Field length (yards)
              <input
                type="number"
                min={10}
                value={fieldLength}
                onChange={(event) => setFieldLength(Number(event.target.value))}
                className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Field width (yards)
              <input
                type="number"
                min={10}
                value={fieldWidth}
                onChange={(event) => setFieldWidth(Number(event.target.value))}
                className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Available equipment
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {EQUIPMENT.map((item) => (
              <Toggle
                key={item}
                checked={equipment.includes(item)}
                label={item}
                onChange={() =>
                  setEquipment((current) =>
                    current.includes(item)
                      ? current.filter((value) => value !== item)
                      : [...current, item],
                  )
                }
              />
            ))}
          </div>
        </fieldset>

        <label className="mt-5 block text-xs text-zinc-400">
          Opponent notes (optional)
          <textarea
            value={opponentNotes}
            onChange={(event) => setOpponentNotes(event.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
            placeholder="Observed tendencies only; notes do not create new Development Goals."
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!selectedGoalIds.length}
            onClick={generatePractice}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate practice
          </button>
          <button
            type="button"
            disabled={!selectedGoalIds.length}
            onClick={generateGamePlan}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate game plan
          </button>
        </div>
      </section>

      {practice ? <PracticeResult practice={practice} /> : null}
      {gamePlan ? <GamePlanResult plan={gamePlan} /> : null}
    </div>
  );
}

