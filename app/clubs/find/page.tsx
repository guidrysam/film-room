"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  isClubMember,
  listMyClubs,
  searchDiscoverableClubs,
  type Club,
} from "@/lib/clubs";
import {
  listMyPendingClubJoinRequests,
  requestClubJoin,
  type ClubJoinRequest,
  type ClubJoinRequestRole,
} from "@/lib/club-join-requests";
import {
  extractClubInviteCode,
  getClubInvite,
  isClubInviteExpired,
  redeemClubInvite,
  type ClubInvite,
} from "@/lib/club-invites";
import { clubHubUrl } from "@/lib/club-routes";
import { pathAfterAuthOrWelcome } from "@/lib/onboarding-redirect";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

export default function FindClubPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Club[]>([]);
  const [inviteHit, setInviteHit] = useState<ClubInvite | null>(null);
  const [mine, setMine] = useState<Club[]>([]);
  const [pending, setPending] = useState<ClubJoinRequest[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refreshMine = useCallback(async () => {
    if (!user) return;
    const [clubs, reqs] = await Promise.all([
      listMyClubs(user.uid),
      listMyPendingClubJoinRequests(user.uid),
    ]);
    setMine(clubs);
    setPending(reqs);
  }, [user]);

  useEffect(() => {
    void refreshMine().catch(() => {});
  }, [refreshMine]);

  const runSearch = useCallback(async () => {
    if (!user) return;
    setSearching(true);
    setError(null);
    setNote(null);
    setInviteHit(null);
    try {
      const code = extractClubInviteCode(q);
      if (code) {
        const inv = await getClubInvite(code);
        if (inv && inv.active && !isClubInviteExpired(inv)) {
          setInviteHit(inv);
          setHits([]);
          return;
        }
      }
      const rows = await searchDiscoverableClubs(q);
      setHits(rows);
      if (rows.length === 0 && q.trim().length >= 2) {
        setNote(
          "No discoverable clubs matched. Ask an admin for an invite link, or paste the invite code here.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, [user, q]);

  const onRequest = async (club: Club, role: ClubJoinRequestRole) => {
    if (!user) return;
    setBusyId(`${club.id}:${role}`);
    setError(null);
    setNote(null);
    try {
      await requestClubJoin({ clubId: club.id, role });
      setNote(
        `Request sent to ${club.name} as ${role === "club_coach" ? "coach" : "parent"}. A club admin will approve it.`,
      );
      await refreshMine();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send request.");
    } finally {
      setBusyId(null);
    }
  };

  const onRedeemInvite = async () => {
    if (!user || !inviteHit) return;
    setJoiningInvite(true);
    setError(null);
    try {
      const { clubId, role } = await redeemClubInvite(inviteHit.code, user.uid);
      const preselected =
        role === "club_parent"
          ? "parent"
          : role === "club_admin"
            ? "club_operator"
            : ("coach" as const);
      const next = await pathAfterAuthOrWelcome(
        user.uid,
        clubHubUrl(clubId),
        preselected,
      );
      router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join club.");
      setJoiningInvite(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-zinc-50">
        <h1 className="mb-3 text-xl font-semibold">Find a club</h1>
        <p className="mb-6 max-w-sm text-center text-sm text-zinc-400">
          Sign in to search clubs, paste an invite, and request to join as a
          coach or parent.
        </p>
        <button
          type="button"
          className={primaryBtn}
          onClick={() => void signInWithGoogle().catch(() => {})}
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  const pendingIds = new Set(pending.map((p) => p.clubId));

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Clubs
          </p>
          <h1 className="text-xl font-semibold text-white">Find a club</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Search by club name, or paste a coach/admin invite link or code.
            Name-search requests still need a club admin to approve. Invite
            links join immediately.
          </p>
          <Link
            href="/app"
            className="mt-3 inline-block text-sm text-zinc-500 hover:text-zinc-200"
          >
            ← Dashboard
          </Link>
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-400/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
        {note ? (
          <p className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">
            {note}
          </p>
        ) : null}

        <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
          <label className="block text-xs text-zinc-500">
            Club name or invite
            <div className="mt-1 flex gap-2">
              <input
                className={inputClass}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Club name or invite link"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch();
                }}
              />
              <button
                type="button"
                className={primaryBtn}
                disabled={searching || q.trim().length < 2}
                onClick={() => void runSearch()}
              >
                {searching ? "…" : "Search"}
              </button>
            </div>
          </label>

          {inviteHit ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-zinc-100">{inviteHit.clubName}</p>
                <p className="text-[11px] text-zinc-500">
                  {inviteHit.role === "club_coach"
                    ? "Coach invite"
                    : inviteHit.role === "club_admin"
                      ? "Admin invite"
                      : "Parent invite"}
                </p>
              </div>
              {mine.some((c) => c.id === inviteHit.clubId) ? (
                <Link href={clubHubUrl(inviteHit.clubId)} className={ghostBtn}>
                  Open club
                </Link>
              ) : (
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={joiningInvite}
                  onClick={() => void onRedeemInvite()}
                >
                  {joiningInvite ? "Joining…" : "Join club"}
                </button>
              )}
            </div>
          ) : null}

          {hits.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {hits.map((club) => {
                const already = isClubMember(club, user.uid) ||
                  mine.some((c) => c.id === club.id);
                const waiting = pendingIds.has(club.id);
                return (
                  <li
                    key={club.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-100">{club.name}</p>
                      {club.sport ? (
                        <p className="text-[11px] text-zinc-500">{club.sport}</p>
                      ) : null}
                    </div>
                    {already ? (
                      <Link href={clubHubUrl(club.id)} className={ghostBtn}>
                        Open club
                      </Link>
                    ) : waiting ? (
                      <span className="text-xs text-amber-200/90">Pending</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={primaryBtn}
                          disabled={busyId !== null}
                          onClick={() => void onRequest(club, "club_coach")}
                        >
                          {busyId === `${club.id}:club_coach`
                            ? "Sending…"
                            : "Join as coach"}
                        </button>
                        <button
                          type="button"
                          className={ghostBtn}
                          disabled={busyId !== null}
                          onClick={() => void onRequest(club, "club_parent")}
                        >
                          {busyId === `${club.id}:club_parent`
                            ? "Sending…"
                            : "Join as parent"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        {pending.length > 0 ? (
          <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
            <h2 className="text-sm font-semibold text-white">Your pending requests</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-300">
              {pending.map((r) => (
                <li key={r.id}>
                  {r.clubName}{" "}
                  <span className="text-xs text-zinc-500">
                    · {r.role === "club_coach" ? "coach" : "parent"} · waiting
                    on admin
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {mine.length > 0 ? (
          <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
            <h2 className="text-sm font-semibold text-white">Your clubs</h2>
            <ul className="mt-3 space-y-2">
              {mine.map((c) => (
                <li key={c.id}>
                  <Link
                    href={clubHubUrl(c.id)}
                    className="text-sm text-blue-300 hover:underline"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="text-center text-[11px] text-zinc-600">
          Have an invite link? Paste it above, or open the full URL from
          Messages. Name search only lists clubs marked discoverable.
        </p>
      </div>
    </div>
  );
}
