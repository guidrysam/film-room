"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithPlayerUsernamePassword } from "@/lib/auth-player";
import { isPlayerAccount, loadUserProfile } from "@/lib/user-profile";

const inputClass =
  "w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-base text-white placeholder:text-zinc-500 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/30";

export default function PlayerSignInPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    void loadUserProfile(user.uid).then((profile) => {
      if (isPlayerAccount(profile)) {
        router.replace("/player");
        return;
      }
      router.replace("/app");
    });
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithPlayerUsernamePassword(username, password);
      router.replace("/player");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(59,130,246,0.12),_transparent_50%)]"
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
          Player sign in
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Film Room
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Use the username and password your parent set up. Your parent&apos;s
          email stays on the account for contact — you sign in with your
          username.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Username
            </span>
            <input
              className={inputClass}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="yourname"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Password
            </span>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>
          {error ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-cyan-400 py-3.5 text-base font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-zinc-500">
          Parent or coach?{" "}
          <Link href="/app/welcome" className="text-cyan-300 hover:text-cyan-200">
            Sign in with Google
          </Link>
        </p>
      </div>
    </div>
  );
}
