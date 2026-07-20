import AcademyActivityBoardPlayer from "@/components/AcademyActivityBoardPlayer";
import AcademyActivityYouTubeSuggestions from "@/components/AcademyActivityYouTubeSuggestions";
import { buildLessonConceptArticle } from "@/lib/academy/concept-article";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";
import type { PublishedLessonPackageView } from "@/lib/academy/published-content";

function DetailList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-zinc-300">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function AcademyPublishedLesson({
  view,
}: {
  view: PublishedLessonPackageView;
}) {
  const { lesson, activities, assignment, quiz, questions } = view;
  const conceptArticle = buildLessonConceptArticle(lesson);
  const relatedGoals = lesson.relatedGoalIds.map(
    (goalId) =>
      U12_ACADEMY_GOAL_CATALOG.goals.find((goal) => goal.id === goalId)
        ?.title ?? goalId,
  );

  return (
    <section id="published-lesson" className="scroll-mt-6 space-y-8">
      <header className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs uppercase tracking-wide text-cyan-300">
          Published lesson
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          {lesson.title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
          {lesson.summary}
        </p>
        <p className="mt-4 text-sm text-zinc-400">
          {lesson.ageBands.join(", ")} · {lesson.difficulty} ·{" "}
          {lesson.estimatedMinutes} minutes
        </p>
      </header>

      <div className="grid gap-5 rounded-xl border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold text-white">
            Learning objective
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {lesson.learningObjective}
          </p>
          <div className="mt-4">
            <DetailList
              title="Success criteria"
              items={lesson.successCriteria}
            />
          </div>
        </section>
        <DetailList title="Coaching points" items={lesson.coachingPoints} />
      </div>

      <article className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
        <p className="text-xs uppercase tracking-wide text-cyan-300">
          Concept article
        </p>
        <h3 className="mt-2 text-xl font-semibold text-white">
          {conceptArticle.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          {conceptArticle.dek}
        </p>
        <div className="mt-4 space-y-4">
          {conceptArticle.sections.map((section) => (
            <section key={section.heading}>
              <h4 className="text-sm font-semibold text-white">
                {section.heading}
              </h4>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </article>

      {lesson.steps.some((step) => step.objects?.length) ? (
        <section>
          <h3 className="mb-3 text-lg font-semibold text-white">
            Lesson walkthrough
          </h3>
          <AcademyActivityBoardPlayer
            title={lesson.title}
            steps={lesson.steps}
          />
        </section>
      ) : null}

      <section>
        <h3 className="mb-3 text-lg font-semibold text-white">Activities</h3>
        <div className="space-y-4">
          {activities.map((activity) => (
            <article
              key={activity.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
            >
              <p className="text-xs uppercase tracking-wide text-cyan-300">
                {activity.category.replaceAll("_", " ")}
              </p>
              <h4 className="mt-1 font-semibold text-white">{activity.title}</h4>
              <p className="mt-1 text-sm text-zinc-400">{activity.summary}</p>
              <AcademyActivityBoardPlayer
                title={activity.title}
                steps={activity.steps}
              />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <DetailList title="Setup" items={activity.setupInstructions} />
                <DetailList title="Instructions" items={activity.howItWorks} />
                <DetailList
                  title="Coaching points"
                  items={activity.coachingPoints}
                />
                <DetailList title="Equipment" items={activity.equipment} />
              </div>
              <AcademyActivityYouTubeSuggestions
                key={activity.id}
                activity={activity}
              />
            </article>
          ))}
        </div>
      </section>

      {assignment ? (
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-lg font-semibold text-white">Assignment</h3>
          <h4 className="mt-2 text-sm font-medium text-emerald-200">
            {assignment.title}
          </h4>
          <p className="mt-1 text-sm text-zinc-400">{assignment.description}</p>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
            {assignment.instructions.map((instruction, index) => (
              <li key={instruction}>
                {index + 1}. {instruction}
              </li>
            ))}
          </ol>
        </article>
      ) : null}

      {quiz ? (
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-lg font-semibold text-white">Quiz</h3>
          <h4 className="mt-2 text-sm font-medium text-cyan-200">{quiz.title}</h4>
          <p className="mt-1 text-sm text-zinc-400">{quiz.description}</p>
          <ol className="mt-4 space-y-4">
            {questions.map((question, index) => (
              <li key={question.id}>
                <p className="text-sm font-medium text-white">
                  {index + 1}. {question.prompt}
                </p>
                <ul className="mt-1 space-y-1 text-sm text-zinc-400">
                  {question.options?.map((option) => (
                    <li key={option.id}>○ {option.label}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </article>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <DetailList title="Related development goals" items={relatedGoals} />
      </div>
    </section>
  );
}
