"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import TeamPageShell from "@/components/TeamPageShell";

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
      {() => (
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
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-300">
              Phase 1
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Academy coming soon
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Source indexing is in progress. Curriculum, practice planning,
              animated lessons, assignments, and quizzes will appear here
              after editorial review.
            </p>
          </section>
        </>
      )}
    </TeamPageShell>
  );
}
