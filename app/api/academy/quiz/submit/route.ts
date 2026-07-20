import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  getPublishedLessonPackageView,
} from "@/lib/academy/published-content";
import { PUBLISHED_ACADEMY_CATALOG } from "@/lib/academy/published-catalog";
import { scoreAcademyQuiz, type AcademyQuizAnswers } from "@/lib/academy/quiz-scoring";
import {
  adminFirestore,
  requireVerifiedTeamActor,
} from "@/lib/firebase-admin";

type SubmissionBody = {
  teamId?: unknown;
  lessonId?: unknown;
  quizId?: unknown;
  answers?: unknown;
};

function parseAnswers(value: unknown): AcademyQuizAnswers | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const answers: AcademyQuizAnswers = {};
  for (const [questionId, selected] of Object.entries(value)) {
    if (
      !questionId.trim() ||
      !Array.isArray(selected) ||
      !selected.every((option) => typeof option === "string")
    ) {
      return null;
    }
    answers[questionId] = selected;
  }
  return answers;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubmissionBody;
    if (
      typeof body.teamId !== "string" ||
      typeof body.lessonId !== "string" ||
      typeof body.quizId !== "string"
    ) {
      return NextResponse.json({ error: "Invalid quiz submission." }, { status: 400 });
    }
    const answers = parseAnswers(body.answers);
    if (!answers) {
      return NextResponse.json({ error: "Invalid quiz answers." }, { status: 400 });
    }
    const actor = await requireVerifiedTeamActor(request, body.teamId);
    const lesson = getPublishedLessonPackageView(body.lessonId);
    if (!lesson?.quiz || lesson.quiz.id !== body.quizId) {
      return NextResponse.json(
        { error: "Published quiz is unavailable." },
        { status: 404 },
      );
    }
    const score = scoreAcademyQuiz(
      // This route is server-only. Published player payloads omit answer keys,
      // so use the authored keys only after confirming the release is published.
      (
        await import("@/lib/academy/receive-open-body-content")
      ).OPEN_BODY_QUIZ_QUESTIONS,
      answers,
    );
    const reference = adminFirestore
      .collection("teams")
      .doc(body.teamId)
      .collection("academyQuizAssignments")
      .doc();
    await reference.set({
      id: reference.id,
      teamId: body.teamId,
      quizId: lesson.quiz.id,
      quizVersion: lesson.quiz.version,
      lessonId: lesson.lesson.id,
      developmentGoalId: lesson.lesson.goalIds[0],
      submittedBy: actor.uid,
      submittedAt: FieldValue.serverTimestamp(),
      score: score.score,
      correctCount: score.correctCount,
      questionCount: score.questionCount,
      status: "completed",
      interpretation: "knowledge_check_only",
      publishedRelease: {
        catalogId: PUBLISHED_ACADEMY_CATALOG.catalogId,
        catalogVersion: PUBLISHED_ACADEMY_CATALOG.catalogVersion,
      },
    });
    return NextResponse.json({
      submissionId: reference.id,
      ...score,
      interpretation:
        "This knowledge check shows lesson understanding, not on-field mastery.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status =
      message === "AUTH_REQUIRED"
        ? 401
        : message === "TEAM_ACCESS_DENIED"
          ? 403
          : message === "TEAM_NOT_FOUND"
            ? 404
            : 500;
    return NextResponse.json(
      { error: status === 500 ? "Could not score quiz." : message },
      { status },
    );
  }
}
