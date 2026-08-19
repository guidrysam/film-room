"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  getClubInvite,
  isClubInviteExpired,
  normalizeClubInviteCode,
  redeemClubInvite,
  type ClubInvite,
} from "@/lib/club-invites";
import { clubHubUrl } from "@/lib/club-routes";
import { pathAfterAuthOrWelcome } from "@/lib/onboarding-redirect";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-6 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";
const primaryBtn =
  "w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const ROLE_COPY: Record<
  ClubInvite["role"],
  { title: string; blurb: string }
> = {
  club_admin: {
    title: "Club admin",
    blurb:
      "Help run this club: manage teams, import rosters, and invite coaches and parents.",
  },
  club_coach: {
    title: "Club coach",
    blurb:
      "Join this club. A club admin will assign you to the teams you coach.",
  },
  club_parent: {
    title: "Club parent",
    blurb:
      "Join this club to follow your kids across its teams once you are linked on a roster.",
  },
};

export default function JoinClubPage() {
  const params = useParams();
  const router = useRouter();
  const code = typeof params.code === "string"
    ? normalizeClubInviteCode(params.code)
    : "";
  const { user, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<ClubInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setLoadError("This invite link is missing a code.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const inv = await getClubInvite(code);
        if (cancelled) return;
        if (!inv) setLoadError("This invite link is not valid.");
        else if (!inv.active) setLoadError("This invite has been deactivated.");
        else if (isClubInviteExpired(inv))
          setLoadError("This invite link has expired.");
        else setInvite(inv);
      } catch {
        if (!cancelled) setLoadError("Could not load this invite.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleJoin = useCallback(async () => {
    if (!user || !invite) return;
    setJoining(true);
    setJoinError(null);
    try {
      const { clubId, role } = await redeemClubInvite(code, user.uid);
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
      setJoinError(e instanceof Error ? e.message : "Could not join club.");
      setJoining(false);
    }
  }, [user, invite, code, router]);

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Loading invite…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
      <div className={`${panelClass} w-full max-w-md`}>
        {loadError || !invite ? (
          <>
            <p className="text-sm text-rose-200">{loadError ?? "Invalid invite."}</p>
            <Link href="/app" className="mt-4 inline-block text-sm text-zinc-400">
              ← Dashboard
            </Link>
          </>
        ) : (
          <>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
              Join club
            </p>
            <h1 className="mt-2 text-xl font-semibold text-white">
              {invite.clubName}
            </h1>
            <p className="mt-1 text-sm font-medium text-emerald-200">
              {ROLE_COPY[invite.role].title}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              {ROLE_COPY[invite.role].blurb}
            </p>
            {joinError ? (
              <p className="mt-3 text-sm text-rose-300">{joinError}</p>
            ) : null}
            {!user ? (
              <button
                type="button"
                className={`${primaryBtn} mt-5`}
                onClick={() => void signInWithGoogle().catch(() => {})}
              >
                Sign in with Google to join
              </button>
            ) : (
              <button
                type="button"
                className={`${primaryBtn} mt-5`}
                disabled={joining}
                onClick={() => void handleJoin()}
              >
                {joining ? "Joining…" : "Join club"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
