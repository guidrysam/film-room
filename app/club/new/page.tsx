"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  createClub,
  normalizeCreateClubInput,
} from "@/lib/clubs";
import { clubHubUrl } from "@/lib/club-routes";
import SportSelect from "@/components/SportSelect";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

export default function NewClubPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!user) return;
    const normalized = normalizeCreateClubInput({ name, sport });
    if ("error" in normalized) {
      setError(normalized.error);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const id = await createClub(user.uid, normalized);
      router.push(clubHubUrl(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create club.");
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
      <div className="mx-auto max-w-lg">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Club
          </p>
          <h1 className="text-xl font-semibold text-white">Create your club</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Clubs hold your teams. You become club admin, then import rosters or
            add teams and invite coaches.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Club name (e.g. Central Michigan FC)"
            className={inputClass}
          />
          <SportSelect value={sport} onChange={setSport} />
          {error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className={`${primaryBtn} w-full`}
          >
            {creating ? "Creating…" : "Create club"}
          </button>
        </div>

        <p className="mt-4 text-center text-sm text-zinc-500">
          Need a single team only?{" "}
          <Link href="/team/new" className="text-blue-300 hover:underline">
            Create a team without a club
          </Link>
        </p>
      </div>
    </div>
  );
}
