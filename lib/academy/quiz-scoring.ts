import type { AcademyQuizQuestion } from "@/lib/academy/types";

export type AcademyQuizAnswers = Record<string, string[]>;

export type AcademyQuizScore = {
  correctCount: number;
  questionCount: number;
  score: number;
  questionResults: Array<{
    questionId: string;
    correct: boolean;
    explanation?: string;
  }>;
};

function sameOptions(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((option) => rightSet.has(option));
}

export function scoreAcademyQuiz(
  questions: readonly AcademyQuizQuestion[],
  answers: AcademyQuizAnswers,
): AcademyQuizScore {
  if (!questions.length) throw new Error("Quiz questions are unavailable.");
  const questionResults = questions.map((question) => {
    const selected = answers[question.id] ?? [];
    const correctOptions = question.correctOptionIds ?? [];
    const correct =
      correctOptions.length > 0 && sameOptions(selected, correctOptions);
    return {
      questionId: question.id,
      correct,
      ...(question.explanation ? { explanation: question.explanation } : {}),
    };
  });
  const correctCount = questionResults.filter((result) => result.correct).length;
  return {
    correctCount,
    questionCount: questions.length,
    score: Math.round((correctCount / questions.length) * 100),
    questionResults,
  };
}
