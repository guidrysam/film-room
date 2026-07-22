"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import AcademyPlanGenerator from "@/components/AcademyPlanGenerator";
import AcademyPublishedLesson from "@/components/AcademyPublishedLesson";
import AcademyEvidenceRecommendations, {
  AcademyPublishedQuiz,
} from "@/components/AcademyEvidenceRecommendations";
import TeamPageShell from "@/components/TeamPageShell";
import TeamSkillsLadderCoach from "@/components/TeamSkillsLadderCoach";
import {
  getPublishedLessonPackageView,
  listPublishedLessons,
  type PublishedLessonPackageView,
} from "@/lib/academy/published-content";
import { U12_DEVELOPMENT_CURRICULUM_SHELL } from "@/lib/academy/u12-curriculum-shell";
import { canCoachTeam } from "@/lib/teams";

const SECTIONS = [
  "Overview",
  "Curriculum",
  "Skills Ladder",
  "Practice Plans",
  "Drill Library",
  "Tactical Lessons",
  "Player Assignments",
  "Quizzes",
  "Progress",
] as const;

type AcademySection = (typeof SECTIONS)[number];

const CURRICULUM_LESSON_ORDER = U12_DEVELOPMENT_CURRICULUM_SHELL.trainingBlocks
  .flatMap((block) =>
    block.learningSequences.flatMap((sequence) =>
      sequence.slots
        .filter((slot) => slot.kind === "core_lesson" && slot.lessonId)
        .map((slot) => ({
          lessonId: slot.lessonId!,
          title: slot.title,
          blockTitle: block.title,
          blockOrder: block.order,
          slotOrder: slot.order,
          packageId: slot.lessonPackageId,
        })),
    ),
  );

function sortPublishedLessons(
  lessons: ReturnType<typeof listPublishedLessons>,
) {
  const order = new Map(
    CURRICULUM_LESSON_ORDER.map((entry, index) => [entry.lessonId, index]),
  );
  return [...lessons].sort((left, right) => {
    const leftRank = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.title.localeCompare(right.title);
  });
}

function LessonPicker({
  lessons,
  selectedId,
  onSelect,
}: {
  lessons: ReturnType<typeof listPublishedLessons>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-6 grid gap-2 sm:grid-cols-2">
      {lessons.map((lesson) => {
        const active = lesson.id === selectedId;
        return (
          <button
            key={lesson.id}
            type="button"
            onClick={() => onSelect(lesson.id)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              active
                ? "border-blue-500/50 bg-blue-600/20 text-white"
                : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/25"
            }`}
          >
            <p className="text-sm font-medium">{lesson.title}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {lesson.ageBands.join(", ")} · {lesson.difficulty}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function PublishedLessonPanel({
  view,
  teamId,
}: {
  view: PublishedLessonPackageView;
  teamId: string;
}) {
  return (
    <>
      <AcademyPublishedLesson view={view} />
      <div className="my-8">
        <AcademyPublishedQuiz lessonView={view} teamId={teamId} />
      </div>
    </>
  );
}

export default function TeamAcademyPage() {
  const params = useParams();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const { user, loading } = useAuth();
  const enabled =
    process.env.NEXT_PUBLIC_ACADEMY_ENABLED === "true" ||
    process.env.NODE_ENV === "development";
  const [section, setSection] = useState<AcademySection>("Overview");
  const publishedLessons = useMemo(
    () => sortPublishedLessons(listPublishedLessons()),
    [],
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(
    publishedLessons[0]?.id ?? null,
  );
  const selectedView = selectedLessonId
    ? getPublishedLessonPackageView(selectedLessonId)
    : null;

  const block1 = U12_DEVELOPMENT_CURRICULUM_SHELL.trainingBlocks[0];
  const publishedIds = new Set(publishedLessons.map((lesson) => lesson.id));
  const publishedActivities = useMemo(() => {
    const views = publishedLessons
      .map((lesson) => getPublishedLessonPackageView(lesson.id))
      .filter((view): view is PublishedLessonPackageView => Boolean(view));
    const byId = new Map(
      views.flatMap((view) =>
        view.activities.map((activity) => [activity.id, activity] as const),
      ),
    );
    return [...byId.values()];
  }, [publishedLessons]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        Loading…
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-center text-sm text-zinc-300">
        Sign in to view Academy.
      </div>
    );
  }
  if (!teamId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-rose-200">
        Missing team.
      </div>
    );
  }
  if (!enabled) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-center text-sm text-zinc-300">
        Academy is not enabled for this environment.
      </div>
    );
  }

  return (
    <TeamPageShell teamId={teamId} currentUid={user.uid} active="academy">
      {(team) => (
        <>
          <nav
            aria-label="Academy sections"
            className="mb-6 flex flex-wrap gap-2"
          >
            {SECTIONS.map((item) => {
              const active = item === section;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSection(item)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                    active
                      ? "border-blue-500/40 bg-blue-600/20 text-white"
                      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </nav>

          {section === "Overview" ? (
            <>
              <AcademyEvidenceRecommendations
                teamId={teamId}
                currentUid={user.uid}
                canCoach={canCoachTeam(team, user.uid)}
              />
              {publishedLessons.length ? (
                <>
                  <p className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
                    Featured published lesson
                  </p>
                  <LessonPicker
                    lessons={publishedLessons}
                    selectedId={selectedLessonId}
                    onSelect={setSelectedLessonId}
                  />
                  {selectedView ? (
                    <PublishedLessonPanel view={selectedView} teamId={teamId} />
                  ) : null}
                </>
              ) : (
                <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-400">
                  No published Academy lessons are available yet.
                </div>
              )}
            </>
          ) : null}

          {section === "Curriculum" ? (
            <section className="space-y-6">
              <header className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-wide text-cyan-300">
                  U12 Player Development Pathway
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {U12_DEVELOPMENT_CURRICULUM_SHELL.title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  {U12_DEVELOPMENT_CURRICULUM_SHELL.shortDescription}
                </p>
              </header>

              {block1 ? (
                <article className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
                  <p className="text-xs uppercase tracking-wide text-emerald-300">
                    Block {block1.order} · published
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    {block1.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {block1.objective}
                  </p>
                  <ul className="mt-4 space-y-1.5 text-sm text-zinc-300">
                    {block1.playerOutcomes.map((outcome) => (
                      <li key={outcome}>• {outcome}</li>
                    ))}
                  </ul>
                  <div className="mt-5 space-y-2">
                    {block1.learningSequences[0]?.slots.map((slot) => {
                      const ready =
                        Boolean(slot.lessonId) &&
                        publishedIds.has(slot.lessonId!);
                      return (
                        <button
                          key={`${slot.order}-${slot.lessonId ?? slot.title}`}
                          type="button"
                          disabled={!ready}
                          onClick={() => {
                            if (!slot.lessonId || !ready) return;
                            setSelectedLessonId(slot.lessonId);
                            setSection("Tactical Lessons");
                          }}
                          className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm ${
                            ready
                              ? "border-white/15 bg-black/20 text-white hover:border-cyan-400/40"
                              : "cursor-not-allowed border-white/5 bg-black/10 text-zinc-500"
                          }`}
                        >
                          <span>
                            Lesson {slot.order}: {slot.title}
                          </span>
                          <span className="text-xs uppercase tracking-wide">
                            {ready ? "Open" : "Coming later"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </article>
              ) : null}

              <p className="text-sm text-zinc-500">
                Later blocks stay in the pathway map until they are authored and
                published. Open a Block 1 lesson to view practice, assignment,
                and quiz.
              </p>
            </section>
          ) : null}

          {section === "Skills Ladder" ? (
            canCoachTeam(team, user.uid) ? (
              <TeamSkillsLadderCoach teamId={teamId} />
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-400">
                Only coaches and admins can choose Ball Mastery teaching videos.
                Players watch the selected videos in their Skills ladder.
              </div>
            )
          ) : null}

          {section === "Practice Plans" ? (
            <AcademyPlanGenerator
              teamId={teamId}
              currentUid={user.uid}
              canCoach={canCoachTeam(team, user.uid)}
              displayName={user.displayName}
            />
          ) : null}

          {section === "Drill Library" ? (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                Published activities
              </h2>
              <p className="text-sm text-zinc-400">
                Canonical activities from published lesson packages.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {publishedActivities.map((activity) => (
                  <article
                    key={activity.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {activity.category.replaceAll("_", " ")}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-white">
                      {activity.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      {activity.summary}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {section === "Tactical Lessons" ? (
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                Published lessons
              </h2>
              <LessonPicker
                lessons={publishedLessons}
                selectedId={selectedLessonId}
                onSelect={setSelectedLessonId}
              />
              {selectedView ? (
                <PublishedLessonPanel view={selectedView} teamId={teamId} />
              ) : (
                <p className="text-sm text-zinc-400">
                  Select a published lesson to open it.
                </p>
              )}
            </section>
          ) : null}

          {section === "Player Assignments" ? (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                Published assignments
              </h2>
              {publishedLessons.map((lesson) => {
                const view = getPublishedLessonPackageView(lesson.id);
                if (!view?.assignment) return null;
                return (
                  <article
                    key={view.assignment.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {lesson.title}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-white">
                      {view.assignment.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      {view.assignment.description}
                    </p>
                    {view.assignment.estimatedMinutes ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        ~{view.assignment.estimatedMinutes} minutes
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : null}

          {section === "Quizzes" ? (
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                Lesson quizzes
              </h2>
              <LessonPicker
                lessons={publishedLessons}
                selectedId={selectedLessonId}
                onSelect={setSelectedLessonId}
              />
              {selectedView ? (
                <AcademyPublishedQuiz
                  lessonView={selectedView}
                  teamId={teamId}
                />
              ) : (
                <p className="text-sm text-zinc-400">
                  Select a lesson to take its quiz.
                </p>
              )}
            </section>
          ) : null}

          {section === "Progress" ? (
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-xl font-semibold text-white">
                Pathway progress
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Block 1 assessment: can the player keep the ball available while
                moving and name one nearby pressure or teammate?
              </p>
              <p className="mt-4 text-sm text-zinc-500">
                Individual progress tracking will expand here. For now, use
                observational notes from Block 1 practices and quiz results.
              </p>
            </section>
          ) : null}
        </>
      )}
    </TeamPageShell>
  );
}
