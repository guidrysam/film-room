"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import { createTeam } from "@/lib/teams";
import { teamSetupUrl } from "@/lib/team-routes";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

export default function NewTeamPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!user) return;
    if (!name.trim()) {
      setError("Give the team a name.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const id = await createTeam(user.uid, {
        name,
        ...(sport.trim() ? { sport } : {}),
      });
      router.push(teamSetupUrl(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create team.");
      setCreating(false);
    }
  }, [user, name, sport, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
        <button
          type="button"
          onClick={() => void signInWithGoogle().catch(() => {})}
          className="mb-6 rounded-xl border border-white/10 bg-white px-6 py-3 text-sm font-semibold text-zinc-950"
        >
          Sign in with Google
        </button>
        <Link href="/app" className="text-sm text-zinc-400 hover:text-zinc-100">
          ← Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-md">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Team
          </p>
          <h1 className="text-xl font-semibold text-white">Create team</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Set up a new team, then import your roster and invite parents from
            Team Setup.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]">
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name (e.g. U14 Central Michigan)"
              className={inputClass}
            />
            <input
              type="text"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              placeholder="Sport (optional)"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className={`${primaryBtn} w-full`}
            >
              {creating ? "Creating…" : "Create team"}
            </button>
            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/app" className={ghostBtn}>
            ← Dashboard
          </Link>
          <Link href="/game-cap" className={ghostBtn}>
            Game Cap
          </Link>
        </div>
      </div>
    </div>
  );
}
