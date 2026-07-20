import { NextResponse } from "next/server";
import { getPublishedLessonPackageView } from "@/lib/academy/published-content";
import { PUBLISHED_ACADEMY_CATALOG } from "@/lib/academy/published-catalog";
import {
  scoreAcademyQuiz,
  type AcademyQuizAnswers,
} from "@/lib/academy/quiz-scoring";
import { verifyFirebaseIdTokenRest } from "@/lib/firebase-id-token";
import { OPEN_BODY_QUIZ_QUESTIONS } from "@/lib/academy/receive-open-body-content";

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

function readBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubmissionBody;
    if (
      typeof body.teamId !== "string" ||
      !body.teamId.trim() ||
      typeof body.lessonId !== "string" ||
      typeof body.quizId !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid quiz submission." },
        { status: 400 },
      );
    }
    const answers = parseAnswers(body.answers);
    if (!answers) {
      return NextResponse.json(
        { error: "Invalid quiz answers." },
        { status: 400 },
      );
    }

    const token = readBearerToken(request);
    const actor = await verifyFirebaseIdTokenRest(token);

    const lesson = getPublishedLessonPackageView(body.lessonId);
    if (!lesson?.quiz || lesson.quiz.id !== body.quizId) {
      return NextResponse.json(
        { error: "Published quiz is unavailable." },
        { status: 404 },
      );
    }

    const score = scoreAcademyQuiz(OPEN_BODY_QUIZ_QUESTIONS, answers);
    const responseBody = {
      ...score,
      interpretation:
        "This knowledge check shows lesson understanding, not on-field mastery.",
    };

    // Persistence needs Admin credentials. Scoring must still succeed without them.
    let submissionId: string | null = null;
    let persisted = false;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
      try {
        const { FieldValue } = await import("firebase-admin/firestore");
        const { adminFirestore } = await import("@/lib/firebase-admin");
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
        submissionId = reference.id;
        persisted = true;
      } catch {
        persisted = false;
      }
    }

    return NextResponse.json({
      ...responseBody,
      submissionId,
      persisted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      {
        error:
          status === 401
            ? "Sign in again to submit the knowledge check."
            : "Could not score quiz.",
      },
      { status },
    );
  }
}
