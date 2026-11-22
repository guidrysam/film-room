"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  getFilmShareInvite,
  isFilmShareInviteExpired,
  normalizeInviteEmail,
  type FilmShareInvite,
} from "@/lib/film-share-invites";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-6 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm";

const primaryBtn =
  "w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "w-full rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

export default function JoinFilmSharePage() {
  const params = useParams();
  const router = useRouter();
  const code = typeof params.code === "string" ? params.code : "";
  const { user, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<FilmShareInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    imported: number;
    ownerLabel: string;
  } | null>(null);

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
        const inv = await getFilmShareInvite(code);
        if (cancelled) return;
        if (!inv) {
          setLoadError("This invite link is not valid.");
        } else if (inv.status === "revoked") {
          setLoadError("This invite was revoked.");
        } else if (isFilmShareInviteExpired(inv)) {
          setLoadError("This invite has expired. Ask for a new one.");
        } else {
          setInvite(inv);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Could not load this invite. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleAccept = useCallback(async () => {
    if (!user || !invite) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/film-shares/accept", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: invite.code }),
      });
      const json = (await res.json().catch(() => null)) as {
        imported?: number;
        ownerLabel?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error || "Could not accept invite.");
      }
      setDone({
        imported: json?.imported ?? 0,
        ownerLabel: json?.ownerLabel || invite.ownerLabel,
      });
      window.setTimeout(() => {
        router.push("/app/film");
      }, 1600);
    } catch (e) {
      setAcceptError(
        e instanceof Error ? e.message : "Could not accept invite.",
      );
    } finally {
      setAccepting(false);
    }
  }, [user, invite, router]);

  const emailMismatch =
    Boolean(user?.email) &&
    Boolean(invite) &&
    normalizeInviteEmail(user!.email!) !== invite!.inviteeEmail;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
      <div className={`w-full max-w-md ${panelClass}`}>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
          Film Room
        </p>
        <h1 className="mt-2 text-xl font-semibold text-white">
          Film library invite
        </h1>

        {authLoading || loading ? (
          <p className="mt-4 text-sm text-zinc-400">Loading…</p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-rose-200">{loadError}</p>
        ) : done ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-emerald-200">
              You’re in — {done.ownerLabel}’s clips
              {done.imported > 0
                ? ` (${done.imported} imported)`
                : ""}{" "}
              are in your Film Room.
            </p>
            <p className="text-[11px] text-zinc-500">Opening My Film…</p>
          </div>
        ) : invite ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-zinc-300">
              <span className="font-medium text-white">
                {invite.ownerLabel}
              </span>{" "}
              shared their film library with{" "}
              <span className="font-mono text-zinc-200">
                {invite.inviteeEmail}
              </span>
              .
            </p>
            <p className="text-[11px] text-zinc-500">
              Accept to import their YouTube clips into your Film Room. You can
              build reels and study film there. Access stays until they revoke
              it; clips you already imported remain yours.
            </p>

            {!user ? (
              <button
                type="button"
                className={primaryBtn}
                onClick={() => void signInWithGoogle().catch(() => {})}
              >
                Sign in with Google
              </button>
            ) : (
              <>
                {emailMismatch ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100">
                    Signed in as {user.email}. This invite is for{" "}
                    {invite.inviteeEmail}. Switch Google accounts to accept.
                  </p>
                ) : null}
                {acceptError ? (
                  <p className="text-[11px] text-rose-200">{acceptError}</p>
                ) : null}
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={accepting || emailMismatch}
                  onClick={() => void handleAccept()}
                >
                  {accepting ? "Accepting…" : "Accept & import film"}
                </button>
              </>
            )}
          </div>
        ) : null}

        <div className="mt-6">
          <Link href="/app/film" className={ghostBtn + " block text-center"}>
            My Film
          </Link>
        </div>
      </div>
    </div>
  );
}
