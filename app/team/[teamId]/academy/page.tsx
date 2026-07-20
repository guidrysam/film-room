"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import AcademyPlanGenerator from "@/components/AcademyPlanGenerator";
import AcademyPublishedLesson from "@/components/AcademyPublishedLesson";
import AcademyEvidenceRecommendations, {
  AcademyPublishedQuiz,
} from "@/components/AcademyEvidenceRecommendations";
import TeamPageShell from "@/components/TeamPageShell";
import {
  getPublishedLessonPackageView,
  listPublishedLessons,
} from "@/lib/academy/published-content";
import { canCoachTeam } from "@/lib/teams";

const sections = [
  "Overview",
  "Curriculum",
  "Practice Plans",
  "Drill Library",
  "Tactical Lessons",
  "Player Assignments",
  "Quizzes",
  "Progress",
];

export default function TeamAcademyPage() {
  const params = useParams();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const { user, loading } = useAuth();
  const enabled =
    process.env.NEXT_PUBLIC_ACADEMY_ENABLED === "true" ||
    process.env.NODE_ENV === "development";
  const publishedLessons = listPublishedLessons();
  const primaryLessonView =
    publishedLessons[0]
      ? getPublishedLessonPackageView(publishedLessons[0].id)
      : null;

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
            {sections.map((section, index) => (
              <span
                key={section}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  index === 0
                    ? "border-blue-500/40 bg-blue-600/20 text-white"
                    : "border-white/10 bg-white/[0.03] text-zinc-500"
                }`}
              >
                {section}
              </span>
            ))}
          </nav>

          <AcademyEvidenceRecommendations
            teamId={teamId}
            currentUid={user.uid}
            canCoach={canCoachTeam(team, user.uid)}
          />

          {primaryLessonView ? (
            <>
              <AcademyPublishedLesson view={primaryLessonView} />
              <div className="my-8">
                <AcademyPublishedQuiz
                  lessonView={primaryLessonView}
                  teamId={teamId}
                />
              </div>
            </>
          ) : (
            <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-400">
              No published Academy lessons are available yet. Curriculum content
              appears here only after authorized package publication.
            </div>
          )}

          <AcademyPlanGenerator
            teamId={teamId}
            currentUid={user.uid}
            canCoach={canCoachTeam(team, user.uid)}
            displayName={user.displayName}
          />
        </>
      )}
    </TeamPageShell>
  );
}
