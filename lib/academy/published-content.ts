import { PUBLISHED_ACADEMY_CATALOG } from "@/lib/academy/published-catalog";
import { stripSourceMetadata } from "@/lib/academy/source-privacy";
import type {
  AcademyActivity,
  AcademyAssignmentTemplate,
  AcademyQuiz,
  AcademyQuizQuestion,
  AcademyTacticalLesson,
  PublishedAcademyCatalog,
  PublishedAcademyObject,
} from "@/lib/academy/types";

function asPayload<T>(object: PublishedAcademyObject): T {
  return stripSourceMetadata(object.payload) as T;
}

export function listPublishedLessons(
  catalog: PublishedAcademyCatalog = PUBLISHED_ACADEMY_CATALOG,
): AcademyTacticalLesson[] {
  return catalog.objects
    .filter((object) => object.objectType === "lesson")
    .map((object) => asPayload<AcademyTacticalLesson>(object));
}

export function getPublishedLesson(
  lessonId: string,
  catalog: PublishedAcademyCatalog = PUBLISHED_ACADEMY_CATALOG,
): AcademyTacticalLesson | null {
  return (
    listPublishedLessons(catalog).find((lesson) => lesson.id === lessonId) ??
    null
  );
}

export function getPublishedActivitiesForLesson(
  lesson: AcademyTacticalLesson,
  catalog: PublishedAcademyCatalog = PUBLISHED_ACADEMY_CATALOG,
): AcademyActivity[] {
  const byId = new Map(
    catalog.objects
      .filter((object) =>
        [
          "activity",
          "warmup",
          "small_sided_game",
          "conditioned_game",
          "drill",
        ].includes(object.objectType),
      )
      .map((object) => [object.id, asPayload<AcademyActivity>(object)]),
  );
  return lesson.activityIds.flatMap((activityId) => {
    const activity = byId.get(activityId);
    return activity ? [activity] : [];
  });
}

export function getPublishedAssignment(
  assignmentId: string,
  catalog: PublishedAcademyCatalog = PUBLISHED_ACADEMY_CATALOG,
): AcademyAssignmentTemplate | null {
  const object = catalog.objects.find(
    (entry) =>
      entry.objectType === "assignment" && entry.id === assignmentId,
  );
  return object ? asPayload<AcademyAssignmentTemplate>(object) : null;
}

export function getPublishedQuizBundle(
  quizId: string,
  catalog: PublishedAcademyCatalog = PUBLISHED_ACADEMY_CATALOG,
): {
  quiz: AcademyQuiz;
  questions: AcademyQuizQuestion[];
} | null {
  const quizObject = catalog.objects.find(
    (entry) => entry.objectType === "quiz" && entry.id === quizId,
  );
  if (!quizObject) return null;
  const quiz = asPayload<AcademyQuiz>(quizObject);
  const questionsById = new Map(
    catalog.objects
      .filter((entry) => entry.objectType === "quiz_question")
      .map((entry) => [entry.id, asPayload<AcademyQuizQuestion>(entry)]),
  );
  const questions = quiz.questionIds.flatMap((questionId) => {
    const question = questionsById.get(questionId);
    return question ? [question] : [];
  });
  return { quiz, questions };
}

export type PublishedLessonPackageView = {
  lesson: AcademyTacticalLesson;
  activities: AcademyActivity[];
  assignment: AcademyAssignmentTemplate | null;
  quiz: AcademyQuiz | null;
  questions: AcademyQuizQuestion[];
};

export function getPublishedLessonPackageView(
  lessonId: string,
  catalog: PublishedAcademyCatalog = PUBLISHED_ACADEMY_CATALOG,
): PublishedLessonPackageView | null {
  const lesson = getPublishedLesson(lessonId, catalog);
  if (!lesson) return null;
  const activities = getPublishedActivitiesForLesson(lesson, catalog);
  const assignmentId = lesson.relatedAssignmentIds[0];
  const quizId = lesson.relatedQuizIds[0];
  const assignment = assignmentId
    ? getPublishedAssignment(assignmentId, catalog)
    : null;
  const quizBundle = quizId
    ? getPublishedQuizBundle(quizId, catalog)
    : null;
  return {
    lesson,
    activities,
    assignment,
    quiz: quizBundle?.quiz ?? null,
    questions: quizBundle?.questions ?? [],
  };
}
