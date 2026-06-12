"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createGameInvite,
  isInviteExpired,
  listGameInvites,
  setGameInviteActive,
  type GameInvite,
  type GameInviteRole,
} from "@/lib/game-invites";
import { canManageGame, type Game } from "@/lib/games";

export type GameInvitesProps = {
  game: Game;
  /** Current viewer uid (controls owner-only management UI). */
  currentUid: string;
};

const ROLE_BADGE: Record<GameInviteRole, string> = {
  editor: "border-emerald-600/45 bg-emerald-950/45 text-emerald-200",
  viewer: "border-zinc-600/50 bg-zinc-800/50 text-zinc-300",
};

/**
 * Owner-only invite-link manager. Generates editor/viewer join links, lists
 * existing invites, copies the join URL, and activates/deactivates (revokes)
 * them. Non-owners see a short read-only note.
 */
export default function GameInvites({ game, currentUid }: GameInvitesProps) {
  const [invites, setInvites] = useState<GameInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<GameInviteRole | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const isOwner = canManageGame(game, currentUid);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const refresh = useCallback(async () => {
    if (!isOwner) return;
    setLoading(true);
    try {
      setInvites(await listGameInvites(game.id));
    } catch {
      /* Leave current list on failure. */
    } finally {
      setLoading(false);
    }
  }, [game.id, isOwner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const joinUrl = useCallback(
    (code: string) => `${origin || ""}/join/${code}`,
    [origin],
  );

  const handleCreate = useCallback(
    async (role: GameInviteRole) => {
      setCreating(role);
      setError(null);
      try {
        await createGameInvite(game, currentUid, role, {
          label: role === "editor" ? "Editor link" : "Viewer link",
        });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create invite.");
      } finally {
        setCreating(null);
      }
    },
    [game, currentUid, refresh],
  );

  const handleToggle = useCallback(
    async (invite: GameInvite) => {
      setBusyCode(invite.code);
      setError(null);
      try {
        await setGameInviteActive(invite.code, !invite.active);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update invite.");
      } finally {
        setBusyCode(null);
      }
    },
    [refresh],
  );

  const handleCopy = useCallback(
    async (code: string) => {
      const url = joinUrl(code);
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          window.prompt("Copy this join link", url);
        }
        setCopiedCode(code);
        setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
      } catch {
        window.prompt("Copy this join link", url);
      }
    },
    [joinUrl],
  );

  if (!isOwner) {
    return (
      <p className="text-[10px] leading-snug text-zinc-500">
        Invite links are managed by the game owner.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Invite links
      </p>
      <p className="mb-2 text-[10px] leading-snug text-zinc-500">
        Editor link = contributors can add sources, marks &amp; perspectives.
        Viewer link = watch-only. Anyone with a link can join — deactivate to
        revoke.
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => void handleCreate("editor")}
          disabled={creating !== null}
          className="rounded-md border border-emerald-500/40 bg-emerald-950/45 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-900/55 disabled:opacity-40"
        >
          {creating === "editor" ? "Creating…" : "Generate editor link"}
        </button>
        <button
          type="button"
          onClick={() => void handleCreate("viewer")}
          disabled={creating !== null}
          className="rounded-md border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-zinc-100 transition hover:bg-white/[0.10] disabled:opacity-40"
        >
          {creating === "viewer" ? "Creating…" : "Generate viewer link"}
        </button>
      </div>

      {loading ? (
        <p className="text-[11px] text-zinc-500">Loading invites…</p>
      ) : invites.length === 0 ? (
        <p className="text-[10px] leading-snug text-zinc-500">
          No invite links yet. Generate one above and share it.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {invites.map((inv) => {
            const expired = isInviteExpired(inv);
            return (
              <li
                key={inv.code}
                className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${ROLE_BADGE[inv.role]}`}
                    >
                      {inv.role}
                    </span>
                    {inv.label ? (
                      <span className="text-[11px] text-zinc-300">
                        {inv.label}
                      </span>
                    ) : null}
                    <span
                      className={`text-[9px] font-semibold uppercase tracking-wide ${
                        expired
                          ? "text-amber-300"
                          : inv.active
                            ? "text-emerald-300"
                            : "text-zinc-500"
                      }`}
                    >
                      {expired ? "expired" : inv.active ? "active" : "inactive"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggle(inv)}
                    disabled={busyCode === inv.code}
                    className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40"
                  >
                    {inv.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    readOnly
                    value={joinUrl(inv.code)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopy(inv.code)}
                    className="shrink-0 rounded-md border border-blue-500/40 bg-blue-950/50 px-2 py-1 text-[10px] font-semibold text-blue-100 transition hover:bg-blue-900/55"
                  >
                    {copiedCode === inv.code ? "Copied" : "Copy"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p className="mt-2 text-[10px] leading-snug text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
