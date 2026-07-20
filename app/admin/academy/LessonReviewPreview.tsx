import { getCanonicalActivity } from "@/lib/academy/activity-library";
import {
  OPEN_BODY_ASSIGNMENT,
  OPEN_BODY_QUIZ,
  OPEN_BODY_QUIZ_QUESTIONS,
  RECEIVE_OPEN_BODY_LESSON,
} from "@/lib/academy/receive-open-body-content";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

function ReviewList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-zinc-300">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function LessonReviewPreview() {
  const lesson = RECEIVE_OPEN_BODY_LESSON;
  const activities = lesson.activityIds.flatMap((activityId) => {
    const activity = getCanonicalActivity(activityId);
    return activity ? [activity] : [];
  });
  const relatedGoals = lesson.relatedGoalIds.map(
    (goalId) =>
      U12_ACADEMY_GOAL_CATALOG.goals.find((goal) => goal.id === goalId)
        ?.title ?? goalId,
  );
  const evidenceTags = lesson.evidenceTagIds.map(
    (tagId) =>
      U12_ACADEMY_GOAL_CATALOG.evidenceTags.find((tag) => tag.id === tagId) ??
      null,
  );

  return (
    <section className="mt-10 border-t border-white/10 pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
            Editorial lesson preview
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {lesson.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            {lesson.summary}
          </p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100">
          Needs coach review
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Age", lesson.ageBands.join(", ")],
          ["Difficulty", lesson.difficulty],
          ["Lesson time", `${lesson.estimatedMinutes} minutes`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {label}
            </p>
            <p className="mt-1 text-sm capitalize text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 rounded-xl border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-2">
        <section>
          <h3 className="font-semibold text-white">Overview</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {lesson.learningObjective}
          </p>
          <ReviewList title="Success criteria" items={lesson.successCriteria} />
        </section>
        <ReviewList title="Coaching points" items={lesson.coachingPoints} />
        <ReviewList
          title="Observable evidence"
          items={lesson.observableEvidence}
        />
        <section>
          <h4 className="text-sm font-semibold text-white">Common errors</h4>
          <ul className="mt-2 space-y-3 text-sm text-zinc-300">
            {lesson.commonErrors.map((error) => (
              <li key={error.title}>
                <strong className="text-white">{error.title}:</strong>{" "}
                {error.description}{" "}
                <span className="text-emerald-200">
                  Correction: {error.correction}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-8">
        <h3 className="text-lg font-semibold text-white">Activities</h3>
        <div className="mt-3 space-y-4">
          {activities.map((activity) => (
            <article
              key={activity.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-cyan-300">
                    {activity.activityRole.replaceAll("_", " ")}
                  </p>
                  <h4 className="mt-1 font-semibold text-white">
                    {activity.title}
                  </h4>
                  <p className="mt-1 text-sm text-zinc-400">
                    {activity.summary}
                  </p>
                </div>
                <span className="text-xs text-zinc-400">
                  {activity.durationMinutes.default} min ·{" "}
                  {activity.playerCount.min}–{activity.playerCount.max} players
                </span>
              </div>
              <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <ReviewList
                  title="Setup & organization"
                  items={[
                    `${activity.field.length} × ${activity.field.width} ${activity.field.unit}`,
                    ...activity.setupInstructions,
                  ]}
                />
                <ReviewList title="Instructions" items={activity.howItWorks} />
                <ReviewList
                  title="Coaching interventions"
                  items={activity.coachingPoints}
                />
                <ReviewList
                  title="Equipment"
                  items={activity.equipment}
                />
                <ReviewList
                  title="Progressions"
                  items={activity.progressions.map(
                    (item) => `${item.title}: ${item.description}`,
                  )}
                />
                <ReviewList
                  title="Regressions"
                  items={activity.regressions.map(
                    (item) => `${item.title}: ${item.description}`,
                  )}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-semibold text-white">Assignment</h3>
          <h4 className="mt-2 text-sm font-medium text-emerald-200">
            {OPEN_BODY_ASSIGNMENT.title}
          </h4>
          <p className="mt-1 text-sm text-zinc-400">
            {OPEN_BODY_ASSIGNMENT.description}
          </p>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
            {OPEN_BODY_ASSIGNMENT.instructions.map((instruction, index) => (
              <li key={instruction}>
                {index + 1}. {instruction}
              </li>
            ))}
          </ol>
        </article>

        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-semibold text-white">Quiz</h3>
          <h4 className="mt-2 text-sm font-medium text-cyan-200">
            {OPEN_BODY_QUIZ.title}
          </h4>
          <ol className="mt-3 space-y-5">
            {OPEN_BODY_QUIZ_QUESTIONS.map((question, index) => (
              <li key={question.id}>
                <p className="text-sm font-medium text-white">
                  {index + 1}. {question.prompt}
                </p>
                <ul className="mt-1 space-y-1 text-sm text-zinc-400">
                  {question.options?.map((option) => (
                    <li key={option.id}>
                      {question.correctOptionIds?.includes(option.id)
                        ? "✓ "
                        : "○ "}
                      {option.label}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {question.explanation}
                </p>
              </li>
            ))}
          </ol>
        </article>
      </div>

      <div className="mt-8 grid gap-5 rounded-xl border border-white/10 bg-white/[0.03] p-5 md:grid-cols-2">
        <ReviewList title="Related goals" items={relatedGoals} />
        <ReviewList
          title="Evidence mapping"
          items={evidenceTags.flatMap((tag) =>
            tag
              ? [`${tag.category.replaceAll("_", " ")} · ${tag.label}`]
              : [],
          )}
        />
      </div>
    </section>
  );
}

