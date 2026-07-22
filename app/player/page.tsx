"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signOutUser } from "@/lib/auth-google";
import {
  isPlayerAccount,
  loadUserProfile,
  type UserProfile,
} from "@/lib/user-profile";
import { listMyTeams, type Team } from "@/lib/teams";
import { teamAcademyUrl, teamRosterUrl } from "@/lib/team-routes";

export default function PlayerHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/player/sign-in");
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextProfile = await loadUserProfile(user.uid);
      if (cancelled) return;
      if (!isPlayerAccount(nextProfile)) {
        router.replace("/app");
        return;
      }
      setProfile(nextProfile);
      try {
        setTeams(await listMyTeams(user.uid));
      } catch {
        setTeams([]);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, router]);

  if (loading || !ready || !user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Player
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Hi, {profile.displayName || profile.username || "player"}
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Signed in as{" "}
              <span className="text-zinc-200">@{profile.username}</span>
              {profile.parentEmail ? (
                <>
                  {" "}
                  · parent contact{" "}
                  <span className="text-zinc-300">{profile.parentEmail}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOutUser().then(() => router.replace("/player/sign-in"))}
            className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.06]"
          >
            Sign out
          </button>
        </div>

        <section className="mb-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-5">
          <h2 className="text-lg font-semibold text-white">Your teams</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Open Academy lessons, quizzes, and team pages.
          </p>
          <div className="mt-4 space-y-2">
            {teams.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No teams linked yet. Ask your parent or coach to finish setup.
              </p>
            ) : (
              teams.map((team) => (
                <div
                  key={team.id}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="font-medium text-white">{team.name}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={teamAcademyUrl(team.id)}
                      className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-zinc-950"
                    >
                      Academy
                    </Link>
                    <Link
                      href={teamRosterUrl(team.id)}
                      className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-zinc-200"
                    >
                      Team
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <p className="text-center text-xs text-zinc-600">
          Forgot password? Ask your parent to reset it from My kids.
        </p>
      </div>
    </div>
  );
}
