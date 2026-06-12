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

const LABEL_SUGGESTIONS = [
  "Parent camera",
  "Assistant coach",
  "Players",
  "View only",
] as const;

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
  const [label, setLabel] = useState("");

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
        const trimmed = label.trim();
        await createGameInvite(game, currentUid, role, {
          label:
            trimmed || (role === "editor" ? "Editor link" : "Viewer link"),
        });
        setLabel("");
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create invite.");
      } finally {
        setCreating(null);
      }
    },
    [game, currentUid, label, refresh],
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
      <div className="mb-3 space-y-1.5">
        <p className="rounded-md border border-amber-500/30 bg-amber-950/25 px-2 py-1.5 text-[10px] leading-snug text-amber-200">
          <span className="font-semibold">Editor links</span> let anyone with
          the link add sources, marks, and perspectives. Share only with trusted
          contributors.
        </p>
        <p className="text-[10px] leading-snug text-zinc-500">
          <span className="font-semibold text-zinc-300">Viewer links</span> are
          watch-only.
        </p>
      </div>

      <label className="mb-1 block text-[10px] font-medium text-zinc-400">
        Label (optional)
      </label>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. Parent camera"
        maxLength={60}
        className="mb-1.5 w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50"
      />
      <div className="mb-3 flex flex-wrap gap-1">
        {LABEL_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setLabel(s)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-zinc-300 transition hover:bg-white/[0.09]"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
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

      <p className="mb-2 text-[10px] leading-snug text-zinc-500">
        Anyone with an active link can join. Deactivating a link only prevents
        future joins — anyone who already joined keeps their role (remove them
        in Contributors below).
      </p>

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
