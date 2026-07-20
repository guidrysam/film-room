"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { PUBLISHED_ACADEMY_CATALOG } from "@/lib/academy/published-catalog";
import {
  resolveRecommendationsFromAttachments,
  type PublishedLessonRecommendation,
} from "@/lib/academy/evidence-recommendations";
import {
  listAcademyQuizSubmissions,
  listConfirmedFilmEvidence,
  savePublishedAssignment,
  savePublishedPackagePractice,
  saveRecommendationDecision,
} from "@/lib/academy/workflow-store";
import type { AcademyQuizSubmissionRecord } from "@/lib/academy/types";
import type { PublishedLessonPackageView } from "@/lib/academy/published-content";
import { listTeamPlayers, type Player } from "@/lib/teams";

type ActionState = {
  recommendationId: string;
  message: string;
} | null;

function gameClock(seconds?: number): string {
  if (seconds === undefined) return "saved moment";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function AcademyPublishedQuiz({
  lessonView,
  teamId,
  onSubmitted,
}: {
  lessonView: PublishedLessonPackageView;
  teamId: string;
  onSubmitted?: () => void;
}) {
  const quiz = lessonView.quiz;
  const questions = lessonView.questions;
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    correctCount: number;
    questionCount: number;
    interpretation: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!quiz) return null;

  async function submit(): Promise<void> {
    const user = auth.currentUser;
    if (!user || !quiz) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/academy/quiz/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId,
          lessonId: lessonView.lesson.id,
          quizId: quiz.id,
          answers,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        score?: number;
        correctCount?: number;
        questionCount?: number;
        interpretation?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Quiz submission failed.");
      setResult({
        score: payload.score ?? 0,
        correctCount: payload.correctCount ?? 0,
        questionCount: payload.questionCount ?? questions.length,
        interpretation:
          payload.interpretation ??
          "This knowledge check does not prove on-field mastery.",
      });
      onSubmitted?.();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not score quiz.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <details
      id="academy-quiz"
      className="scroll-mt-6 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4"
    >
      <summary className="cursor-pointer text-sm font-semibold text-cyan-100">
        Open published quiz · {questions.length} questions
      </summary>
      <p className="mt-3 text-xs leading-5 text-zinc-400">
        Read the concept article above first. This knowledge check measures
        understanding of that idea — not on-field mastery.
      </p>
      <ol className="mt-4 space-y-5">
        {questions.map((question, index) => (
          <li key={question.id}>
            <p className="text-sm font-medium text-white">
              {index + 1}. {question.prompt}
            </p>
            <div className="mt-2 space-y-1.5">
              {question.options?.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer gap-2 text-sm text-zinc-300"
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id]?.includes(option.id) ?? false}
                    onChange={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: [option.id],
                      }))
                    }
                    className="accent-cyan-500"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={
          submitting ||
          questions.some((question) => !answers[question.id]?.length)
        }
        onClick={() => void submit()}
        className="mt-5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
      >
        {submitting ? "Scoring securely…" : "Submit knowledge check"}
      </button>
      {error ? <p className="mt-2 text-xs text-rose-200">{error}</p> : null}
      {result ? (
        <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-3 text-sm text-emerald-100">
          <p>
            {result.correctCount}/{result.questionCount} correct · {result.score}%
          </p>
          <p className="mt-1 text-xs text-zinc-400">{result.interpretation}</p>
        </div>
      ) : null}
    </details>
  );
}

export default function AcademyEvidenceRecommendations({
  teamId,
  currentUid,
  canCoach,
}: {
  teamId: string;
  currentUid: string;
  canCoach: boolean;
}) {
  const [recommendations, setRecommendations] = useState<
    PublishedLessonRecommendation[]
  >([]);
  const [unmatchedGoalTitles, setUnmatchedGoalTitles] = useState<string[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [quizSubmissions, setQuizSubmissions] = useState<
    AcademyQuizSubmissionRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ActionState>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listConfirmedFilmEvidence(teamId),
      canCoach ? listTeamPlayers(teamId) : Promise.resolve([]),
      canCoach ? listAcademyQuizSubmissions(teamId) : Promise.resolve([]),
    ])
      .then(([attachments, teamPlayers, submissions]) => {
        if (!active) return;
        const resolution = resolveRecommendationsFromAttachments({
          teamId,
          attachments,
          publishedCatalog: PUBLISHED_ACADEMY_CATALOG,
        });
        setRecommendations(resolution.recommendations);
        setUnmatchedGoalTitles(
          resolution.resolvedGoalsWithoutPublishedLesson.map(
            (goal) => goal.title,
          ),
        );
        setPlayers(teamPlayers);
        setQuizSubmissions(submissions);
      })
      .catch(() => {
        if (!active) return;
        setRecommendations([]);
        setUnmatchedGoalTitles([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canCoach, teamId]);

  const visibleRecommendations = useMemo(
    () =>
      recommendations.filter(
        (recommendation) => !hidden.includes(recommendation.id),
      ),
    [hidden, recommendations],
  );

  async function runAction(
    recommendation: PublishedLessonRecommendation,
    operation: () => Promise<void>,
    message: string,
  ): Promise<void> {
    setBusy(true);
    setAction(null);
    try {
      await operation();
      setAction({ recommendationId: recommendation.id, message });
    } catch {
      setAction({
        recommendationId: recommendation.id,
        message: "That action could not be saved.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="mb-8 text-sm text-zinc-400">Loading teaching opportunities…</p>;
  }

  return (
    <section className="mb-10 space-y-4" aria-labelledby="teaching-opportunities">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
          Develop
        </p>
        <h2 id="teaching-opportunities" className="mt-1 text-xl font-semibold text-white">
          Teaching opportunities from confirmed game evidence
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Every recommendation below begins with a coach-confirmed moment and follows
          the Development Goal graph to published Academy content.
        </p>
      </div>

      {!visibleRecommendations.length ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
          No published lesson recommendation currently has a complete confirmed
          evidence chain.
        </div>
      ) : null}

      {visibleRecommendations.map((recommendation) => (
        <article
          key={recommendation.id}
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100">
                {recommendation.strength}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-white">
                Focus: {recommendation.goal.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-300">
                {recommendation.lesson.lesson.title}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Supported by {recommendation.confirmedMomentCount} confirmed moment
                {recommendation.confirmedMomentCount === 1 ? "" : "s"}.
              </p>
            </div>
            <Link
              href="#published-lesson"
              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/[0.05]"
            >
              View lesson
            </Link>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
            <h4 className="text-sm font-semibold text-white">Why this lesson</h4>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-300">
              {recommendation.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </div>

          <div className="mt-4">
            <h4 className="text-sm font-semibold text-white">Evidence trace</h4>
            <div className="mt-2 space-y-2">
              {recommendation.traces.map((trace) => (
                <div
                  key={`${trace.evidenceId}:${trace.evidenceTagId}`}
                  className="rounded-lg border border-white/[0.08] bg-black/20 p-3 text-xs text-zinc-300"
                >
                  <Link
                    href={`/game/${trace.filmReference.gameId}/review`}
                    className="font-medium text-blue-300 hover:text-blue-200"
                  >
                    Confirmed event · {gameClock(trace.filmReference.gameTimeSec)}
                  </Link>
                  <p className="mt-1">
                    {trace.evidenceTagId} → {trace.developmentGoalId} →{" "}
                    {trace.lessonTitle}
                  </p>
                  {trace.note ? (
                    <p className="mt-1 text-zinc-500">Coach note: {trace.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {recommendation.lesson.activities.map((activity, index) => (
              <div
                key={activity.id}
                className="rounded-lg border border-white/[0.08] bg-black/20 p-3"
              >
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {index + 1} · {activity.durationMinutes.default} min
                </p>
                <p className="mt-1 text-sm font-medium text-white">{activity.title}</p>
              </div>
            ))}
          </div>

          {canCoach ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
              <h4 className="text-sm font-semibold text-white">Coach actions</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      recommendation,
                      async () => {
                        await savePublishedPackagePractice({
                          recommendation,
                          createdBy: currentUid,
                        });
                      },
                      "Draft practice saved with canonical activity references.",
                    )
                  }
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Add to practice
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedPlayerIds.length}
                  onClick={() =>
                    void runAction(
                      recommendation,
                      async () => {
                        await savePublishedAssignment({
                          recommendation,
                          assignedBy: currentUid,
                          assignedPlayerIds: selectedPlayerIds,
                        });
                      },
                      "Published assignment sent to selected players.",
                    )
                  }
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Assign to selected
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      recommendation,
                      async () => {
                        await savePublishedAssignment({
                          recommendation,
                          assignedBy: currentUid,
                          entireTeam: true,
                        });
                      },
                      "Published assignment sent to the team.",
                    )
                  }
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Assign to team
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      recommendation,
                      () =>
                        saveRecommendationDecision({
                          teamId,
                          recommendationId: recommendation.id,
                          goalId: recommendation.goal.id,
                          lessonId: recommendation.lesson.lesson.id,
                          actor: currentUid,
                          decision: "current_focus",
                        }),
                      "Marked as the current focus.",
                    )
                  }
                  className="rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
                >
                  Mark as current focus
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      recommendation,
                      async () => {
                        await saveRecommendationDecision({
                          teamId,
                          recommendationId: recommendation.id,
                          goalId: recommendation.goal.id,
                          lessonId: recommendation.lesson.lesson.id,
                          actor: currentUid,
                          decision: "dismissed",
                        });
                        setHidden((current) => [...current, recommendation.id]);
                      },
                      "Recommendation dismissed.",
                    )
                  }
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 disabled:opacity-50"
                >
                  Dismiss recommendation
                </button>
              </div>
              {players.length ? (
                <fieldset className="mt-4">
                  <legend className="text-xs text-zinc-400">
                    Select one or more players
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {players.map((player) => (
                      <label
                        key={player.id}
                        className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1 text-xs text-zinc-300"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPlayerIds.includes(player.id)}
                          onChange={() =>
                            setSelectedPlayerIds((current) =>
                              current.includes(player.id)
                                ? current.filter((id) => id !== player.id)
                                : [...current, player.id],
                            )
                          }
                          className="accent-blue-500"
                        />
                        {player.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {action?.recommendationId === recommendation.id ? (
                <p className="mt-3 text-xs text-zinc-300">{action.message}</p>
              ) : null}
            </div>
          ) : null}

          {recommendation.lesson.quiz ? (
            <Link
              href="#academy-quiz"
              className="mt-4 inline-block text-xs font-semibold text-cyan-200 hover:text-cyan-100"
            >
              Open the published knowledge check
            </Link>
          ) : null}
        </article>
      ))}

      {unmatchedGoalTitles.length ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold text-white">
            Confirmed goals without a published lesson
          </h3>
          <ul className="mt-2 text-sm text-zinc-400">
            {unmatchedGoalTitles.map((title) => (
              <li key={title}>• {title}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {canCoach && quizSubmissions.length ? (
        <details className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white">
            Quiz completion review · {quizSubmissions.length}
          </summary>
          <ul className="mt-3 space-y-2 text-xs text-zinc-300">
            {quizSubmissions.map((submission) => (
              <li key={submission.id}>
                {submission.submittedBy} · {submission.correctCount}/
                {submission.questionCount} ({submission.score}%) · knowledge check
                only
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
