"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import ScheduleCsvImport from "@/components/ScheduleCsvImport";
import { signInWithGoogle } from "@/lib/auth-google";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

export default function ScheduleImportPage() {
  const { user, loading } = useAuth();

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
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Schedule
          </p>
          <h1 className="text-xl font-semibold text-white">Import games</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Upload a schedule CSV to create games for your teams. Re-uploading an
            updated schedule only adds new games or updates changed ones — it
            never removes existing games, sources, or coach marks.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Games are matched to your Film Room teams by the Team column, and
            de-duplicated by match number so repeat imports stay clean. Rows
            without a clear opponent fall back to “Team — Game N”.
          </p>
        </div>

        <ScheduleCsvImport uid={user.uid} />

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/app" className={ghostBtn}>
            ← Dashboard
          </Link>
          <Link href="/team/new" className={ghostBtn}>
            Create team
          </Link>
          <Link href="/stream" className={ghostBtn}>
            Stream
          </Link>
        </div>
      </div>
    </div>
  );
}
