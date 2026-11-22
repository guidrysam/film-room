"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  listFilmSharesForOwner,
  listPendingFilmShareInvitesForOwner,
  type FilmShareGrant,
  type FilmShareInvite,
} from "@/lib/film-share-invites";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600";

type Props = {
  onMessage?: (note: string | null) => void;
  onError?: (message: string | null) => void;
};

export default function InviteCoachToFilm({ onMessage, onError }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [grants, setGrants] = useState<FilmShareGrant[]>([]);
  const [pending, setPending] = useState<FilmShareInvite[]>([]);
  const [lastJoinUrl, setLastJoinUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [g, p] = await Promise.all([
        listFilmSharesForOwner(user.uid),
        listPendingFilmShareInvitesForOwner(user.uid),
      ]);
      setGrants(g);
      setPending(p);
    } catch {
      /* non-fatal */
    }
  }, [user]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const sendInvite = async () => {
    if (!user) return;
    setBusy(true);
    onError?.(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/film-shares/invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          ownerLabel: user.displayName || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        joinUrl?: string;
        emailSent?: boolean;
        emailError?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error || "Could not send invite.");
      }
      setLastJoinUrl(json?.joinUrl ?? null);
      setEmail("");
      if (json?.emailSent) {
        onMessage?.(
          "Invite emailed. They’ll get your film in their Film Room after accepting.",
        );
      } else {
        onMessage?.(
          json?.emailError
            ? `Invite created — ${json.emailError} Copy the link below.`
            : "Invite created. Copy the link below and send it to the coach.",
        );
      }
      await refresh();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not send invite.");
    } finally {
      setBusy(false);
    }
  };

  const revokeGrant = async (coachUid: string) => {
    if (!user) return;
    setBusy(true);
    onError?.(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/film-shares/revoke", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ coachUid }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(json?.error || "Could not revoke.");
      onMessage?.(
        "Access revoked. Clips they already imported stay in their Film Room.",
      );
      await refresh();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not revoke.");
    } finally {
      setBusy(false);
    }
  };

  const revokePending = async (code: string) => {
    if (!user) return;
    setBusy(true);
    onError?.(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/film-shares/revoke", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(json?.error || "Could not revoke.");
      onMessage?.("Pending invite cancelled.");
      await refresh();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not revoke.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className={ghostBtn}
        onClick={() => setOpen(true)}
      >
        Invite coach to my film
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-zinc-200">
            Invite coach to my film
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            They get ongoing access to your YouTube film library in{" "}
            <em>their</em> Film Room. Revoke anytime — imported clips stay
            theirs.
          </p>
        </div>
        <button
          type="button"
          className={ghostBtn}
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          className={`${inputClass} min-w-[12rem] flex-1`}
          placeholder="coach@club.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className={primaryBtn}
          disabled={busy || !email.trim()}
          onClick={() => void sendInvite()}
        >
          {busy ? "Sending…" : "Send invite"}
        </button>
      </div>

      {lastJoinUrl ? (
        <p className="mt-2 break-all text-[11px] text-zinc-400">
          Link:{" "}
          <a
            href={lastJoinUrl}
            className="text-blue-300 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {lastJoinUrl}
          </a>
        </p>
      ) : null}

      {grants.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Active access
          </p>
          <ul className="space-y-1">
            {grants.map((g) => (
              <li
                key={g.coachUid}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-black/20 px-2 py-1.5"
              >
                <span className="text-[11px] text-zinc-200">
                  {g.coachEmail || g.coachUid}
                </span>
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={busy}
                  onClick={() => void revokeGrant(g.coachUid)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Pending invites
          </p>
          <ul className="space-y-1">
            {pending.map((p) => (
              <li
                key={p.code}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-black/20 px-2 py-1.5"
              >
                <span className="text-[11px] text-zinc-200">
                  {p.inviteeEmail}
                </span>
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={busy}
                  onClick={() => void revokePending(p.code)}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
