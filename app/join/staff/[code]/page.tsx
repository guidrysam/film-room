"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  getStaffInvite,
  isStaffInviteExpired,
  redeemStaffInvite,
  type StaffInvite,
} from "@/lib/staff-invites";
import { pathAfterAuthOrWelcome, signupRoleFromInviteRole } from "@/lib/onboarding-redirect";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-6 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm";

const primaryBtn =
  "w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] disabled:cursor-not-allowed disabled:opacity-50";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm";

const ROLE_COPY: Record<
  StaffInvite["role"],
  { title: string; blurb: string; badge: string }
> = {
  coach: {
    title: "Coach",
    blurb:
      "Review film, tag plays, and add coach marks for every team in this event.",
    badge: "border-emerald-600/45 bg-emerald-950/45 text-emerald-200",
  },
  parent: {
    title: "Parent",
    blurb: "Upload video and view games for every team in this event.",
    badge: "border-amber-500/40 bg-amber-950/40 text-amber-200",
  },
  player: {
    title: "Player",
    blurb: "View team games across this event.",
    badge: "border-blue-500/40 bg-blue-950/40 text-blue-200",
  },
  viewer: {
    title: "Viewer",
    blurb: "Watch games across this event.",
    badge: "border-zinc-600/50 bg-zinc-800/50 text-zinc-300",
  },
};

export default function JoinStaffPage() {
  const params = useParams();
  const router = useRouter();
  const code = typeof params.code === "string" ? params.code : "";
  const { user, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<StaffInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [joinSummary, setJoinSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setLoadError("This invite link is missing a code.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const inv = await getStaffInvite(code);
        if (cancelled) return;
        if (!inv) {
          setLoadError("This invite link is not valid.");
        } else if (!inv.active) {
          setLoadError("This invite link has been deactivated.");
        } else if (isStaffInviteExpired(inv)) {
          setLoadError("This invite link has expired.");
        } else {
          setInvite(inv);
        }
      } catch {
        if (!cancelled)
          setLoadError("Could not load this invite link. Please try again.");
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
      const { joined: joinedCount, skipped } = await redeemStaffInvite(
        invite.code,
        user.uid,
        { email: user.email },
      );
      if (joinedCount === 0 && skipped === invite.teamIds.length) {
        setJoinError("You are already on all teams in this event.");
        return;
      }
      setJoinSummary(
        joinedCount > 0
          ? `Joined ${joinedCount} team${joinedCount === 1 ? "" : "s"}.`
          : "Already a member of these teams.",
      );
      setJoined(true);
      const defaultDest =
        invite.role === "parent" ? "/game-cap" : "/app";
      const dest = await pathAfterAuthOrWelcome(
        user.uid,
        defaultDest,
        signupRoleFromInviteRole(invite.role),
      );
      setTimeout(() => router.push(dest), 1200);
    } catch (e) {
      setJoinError(
        e instanceof Error ? e.message : "Could not accept this invite.",
      );
    } finally {
      setJoining(false);
    }
  }, [user, invite, router]);

  const roleCopy = invite ? ROLE_COPY[invite.role] : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
      <div className="w-full max-w-md">
        <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
          Film Room Sports
        </p>
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight text-white">
          Event access
        </h1>

        <div className={panelClass}>
          {loading || authLoading ? (
            <p className="text-center text-sm text-zinc-300">Loading invite…</p>
          ) : loadError ? (
            <div className="text-center">
              <p className="text-sm text-rose-200">{loadError}</p>
              <Link href="/app" className={`${linkBack} mt-4 inline-block`}>
                Go to dashboard
              </Link>
            </div>
          ) : invite && roleCopy ? (
            <div>
              <div className="mb-4 text-center">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  You&apos;re invited to
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {invite.eventLabel}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {invite.teamIds.length} team
                  {invite.teamIds.length === 1 ? "" : "s"}
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className="text-xs text-zinc-400">as</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${roleCopy.badge}`}
                  >
                    {roleCopy.title}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  {roleCopy.blurb}
                </p>
              </div>

              {joined ? (
                <p className="text-center text-sm font-medium text-emerald-200">
                  {joinSummary ?? "Done."} Redirecting to dashboard…
                </p>
              ) : !user ? (
                <div className="text-center">
                  <p className="mb-3 text-xs text-zinc-400">
                    Sign in to accept this invite.
                  </p>
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle().catch(() => {})}
                    className="w-full rounded-xl border border-white/10 bg-white py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/30 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    Sign in with Google
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => void handleJoin()}
                    disabled={joining}
                    className={primaryBtn}
                  >
                    {joining ? "Joining…" : "Accept invite"}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-zinc-500">
                    Signed in as {user.email}
                  </p>
                  {joinError ? (
                    <p className="mt-3 text-center text-xs text-rose-200">
                      {joinError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className={linkBack}>
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
