"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";
import SignupOnboarding from "@/components/SignupOnboarding";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import { isSignupRole, type SignupRole } from "@/lib/signup-roles";
import { loadUserProfile, userNeedsOnboarding } from "@/lib/user-profile";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm";

function WelcomePageInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialRoles = useMemo(() => {
    const raw = searchParams.getAll("role");
    const roles: SignupRole[] = [];
    for (const value of raw) {
      if (isSignupRole(value) && !roles.includes(value)) roles.push(value);
    }
    return roles;
  }, [searchParams]);

  useEffect(() => {
    if (loading || !user) return;
    void loadUserProfile(user.uid)
      .then((profile) => {
        if (!userNeedsOnboarding(profile)) {
          router.replace("/app");
        }
      })
      .catch((err) => {
        console.error("[welcome:profile]", err);
      });
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
        <div className="w-full max-w-md text-center">
          <h1 className="mb-3 text-2xl font-semibold text-white">
            Welcome to Film Room
          </h1>
          <p className="mb-8 text-sm text-zinc-400">
            Sign in to choose your roles and get started.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle().catch(() => {})}
            className="mb-4 w-full rounded-xl border border-white/10 bg-white py-3 text-sm font-semibold text-zinc-950"
          >
            Sign in with Google
          </button>
          <Link
            href="/player/sign-in"
            className="mb-6 block w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 py-3 text-center text-sm font-semibold text-cyan-100"
          >
            Player username sign-in
          </Link>
          <Link href="/" className={linkBack}>
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
      <div className="w-full max-w-lg">
        <SignupOnboarding
          uid={user.uid}
          email={user.email}
          displayName={user.displayName}
          initialRoles={initialRoles}
          onComplete={(path) => router.replace(path)}
        />
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-zinc-300">
          <p className="text-sm">Loading…</p>
        </div>
      }
    >
      <WelcomePageInner />
    </Suspense>
  );
}
