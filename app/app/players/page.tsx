"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import { listPersons, type Person } from "@/lib/persons";
import { personProfileUrl } from "@/lib/team-routes";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

export default function PlayersListPage() {
  const { user, loading } = useAuth();
  const [persons, setPersons] = useState<Person[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    try {
      setPersons(await listPersons(user.uid));
    } catch {
      setPersons([]);
    } finally {
      setListLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        <div className="mb-6 flex items-end justify-between gap-3 border-b border-white/[0.06] pb-5">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
              Film Room
            </p>
            <h1 className="text-xl font-semibold text-white">Your players</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Cross-event stats and film moments for everyone on your rosters.
            </p>
          </div>
          <Link href="/app" className={ghostBtn}>
            Dashboard
          </Link>
        </div>

        <section className={panelClass}>
          {listLoading ? (
            <p className="text-sm text-zinc-400">Loading players…</p>
          ) : persons.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No players linked yet. Import a TeamLinkt roster to create player
              records that persist across events.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {persons.map((person) => (
                <li key={person.id}>
                  <Link
                    href={personProfileUrl(person.id)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2.5 transition hover:bg-white/[0.04]"
                  >
                    <span className="truncate text-sm font-medium text-white">
                      {person.name}
                    </span>
                    <span className="shrink-0 text-zinc-500" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
