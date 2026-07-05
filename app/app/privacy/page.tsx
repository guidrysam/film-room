"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import PrivacySettingsForm from "@/components/PrivacySettingsForm";
import { signInWithGoogle } from "@/lib/auth-google";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm";

export default function PrivacySettingsPage() {
  const { user, loading } = useAuth();

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
            Privacy settings
          </h1>
          <p className="mb-8 text-sm text-zinc-400">
            Sign in to control who can access your team film and how long links
            stay active.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle().catch(() => {})}
            className="mb-6 w-full rounded-xl border border-white/10 bg-white py-3 text-sm font-semibold text-zinc-950"
          >
            Sign in with Google
          </button>
          <Link href="/app" className={linkBack}>
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 border-b border-white/[0.06] pb-6">
          <Link href="/app" className={`${linkBack} mb-4 inline-block`}>
            ← Dashboard
          </Link>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Account
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Privacy settings
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
            Film Room stays open — video lives on YouTube. These settings control
            who can get into your teams and games, and when invite and watch
            links stop working.
          </p>
        </div>
        <PrivacySettingsForm uid={user.uid} />
      </div>
    </div>
  );
}
