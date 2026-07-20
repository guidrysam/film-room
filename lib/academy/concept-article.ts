import type { AcademyTacticalLesson } from "@/lib/academy/types";

export type AcademyConceptArticle = {
  title: string;
  dek: string;
  sections: Array<{ heading: string; body: string }>;
};

/**
 * Deterministic concept brief from published lesson fields.
 * No AI — coaches get a short article that illustrates the teaching idea.
 */
export function buildLessonConceptArticle(
  lesson: Pick<
    AcademyTacticalLesson,
    | "title"
    | "summary"
    | "learningObjective"
    | "successCriteria"
    | "coachingPoints"
    | "commonErrors"
    | "observableEvidence"
    | "progression"
  >,
): AcademyConceptArticle {
  const errorLines = lesson.commonErrors
    .slice(0, 3)
    .map(
      (error) =>
        `${error.title}: ${error.description} Correction: ${error.correction}`,
    )
    .join(" ");
  return {
    title: `Concept brief: ${lesson.title.replace(/^See the Next Play:\s*/i, "")}`,
    dek: lesson.summary,
    sections: [
      {
        heading: "What we are teaching",
        body: lesson.learningObjective,
      },
      {
        heading: "What success looks like",
        body: lesson.successCriteria.join(" "),
      },
      {
        heading: "How to coach it",
        body: lesson.coachingPoints.slice(0, 4).join(" "),
      },
      {
        heading: "What to watch for",
        body:
          lesson.observableEvidence.slice(0, 3).join(" ") ||
          errorLines ||
          lesson.progression,
      },
      {
        heading: "Common picture to fix",
        body: errorLines || lesson.progression,
      },
    ].filter((section) => section.body.trim().length > 0),
  };
}
