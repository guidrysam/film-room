"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import TeamCreateFromCsv from "@/components/TeamCreateFromCsv";
import TeamCreateManual from "@/components/TeamCreateManual";
import { signInWithGoogle } from "@/lib/auth-google";

type CreateMode = "choose" | "manual" | "csv";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] transition hover:border-white/12";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

export default function NewTeamPage() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<CreateMode>("choose");

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
      <div className="mx-auto max-w-lg">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Team
          </p>
          <h1 className="text-xl font-semibold text-white">Create team</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Create manually or import a TeamLinkt roster CSV to set up your team
            and roster together.
          </p>
        </div>

        {mode === "choose" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`${panelClass} text-left`}
            >
              <p className="text-sm font-semibold text-white">Create manually</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Enter team name, sport, and season. Import your roster later from
                Team Setup.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode("csv")}
              className={`${panelClass} text-left ring-2 ring-blue-500/20`}
            >
              <p className="text-sm font-semibold text-white">
                Import TeamLinkt CSV
              </p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Upload a roster export to create or update one or more teams and
                import players and parent contacts in one step.
              </p>
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setMode("choose")}
              className={`${ghostBtn} mb-4`}
            >
              ← Back to options
            </button>
            {mode === "manual" ? (
              <TeamCreateManual uid={user.uid} />
            ) : (
              <TeamCreateFromCsv uid={user.uid} />
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/app" className={ghostBtn}>
            ← Dashboard
          </Link>
          <Link href="/game-cap" className={ghostBtn}>
            Add video
          </Link>
        </div>
      </div>
    </div>
  );
}
