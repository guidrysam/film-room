"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  getGameInvite,
  isInviteExpired,
  redeemGameInvite,
  type GameInvite,
} from "@/lib/game-invites";
import { getClubInvite } from "@/lib/club-invites";
import { clubJoinUrl } from "@/lib/club-routes";
import { getTeamInvite } from "@/lib/team-invites";
import { getStaffInvite } from "@/lib/staff-invites";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-6 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm";

const primaryBtn =
  "w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] disabled:cursor-not-allowed disabled:opacity-50";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm";

const ROLE_COPY: Record<
  GameInvite["role"],
  { title: string; blurb: string; badge: string }
> = {
  editor: {
    title: "Editor",
    blurb: "Add sources, Coach Marks, and Perspectives to this game.",
    badge: "border-emerald-600/45 bg-emerald-950/45 text-emerald-200",
  },
  viewer: {
    title: "Viewer",
    blurb: "Watch the game and its shared Perspectives.",
    badge: "border-zinc-600/50 bg-zinc-800/50 text-zinc-300",
  },
};

export default function JoinGamePage() {
  const params = useParams();
  const router = useRouter();
  const code = typeof params.code === "string" ? params.code : "";
  const { user, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<GameInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

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
        const inv = await getGameInvite(code);
        if (cancelled) return;
        if (!inv) {
          const [clubInv, teamInv, staffInv] = await Promise.all([
            getClubInvite(code),
            getTeamInvite(code),
            getStaffInvite(code),
          ]);
          if (cancelled) return;
          if (clubInv) {
            router.replace(clubJoinUrl(code));
            return;
          }
          if (teamInv) {
            router.replace(`/join/team/${code}`);
            return;
          }
          if (staffInv) {
            router.replace(`/join/staff/${code}`);
            return;
          }
          setLoadError("This invite link is not valid.");
        } else if (!inv.active) {
          setLoadError("This invite link has been deactivated by the owner.");
        } else if (isInviteExpired(inv)) {
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
  }, [code, router]);

  const handleJoin = useCallback(async () => {
    if (!user || !invite) return;
    setJoining(true);
    setJoinError(null);
    try {
      await redeemGameInvite(invite.code, user.uid, {
        displayName: user.displayName,
      });
      setJoined(true);
      const dest =
        invite.role === "viewer"
          ? `/game/${invite.gameId}/room?viewer=1`
          : `/game/${invite.gameId}`;
      setTimeout(() => router.push(dest), 900);
    } catch (e) {
      setJoinError(
        e instanceof Error ? e.message : "Could not join this game.",
      );
    } finally {
      setJoining(false);
    }
  }, [user, invite, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
      <div className="w-full max-w-md">
        <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
          Film Room Sports
        </p>
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight text-white">
          Game invite
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
          ) : invite ? (
            <div>
              <div className="mb-4 text-center">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  You&apos;re invited to join
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {invite.gameTitle}
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className="text-xs text-zinc-400">as</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_COPY[invite.role].badge}`}
                  >
                    {ROLE_COPY[invite.role].title}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  {ROLE_COPY[invite.role].blurb}
                </p>
              </div>

              {joined ? (
                <p className="text-center text-sm font-medium text-emerald-200">
                  You&apos;ve joined {invite.gameTitle}. Redirecting…
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
                    {joining ? "Joining…" : `Join ${invite.gameTitle}`}
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
