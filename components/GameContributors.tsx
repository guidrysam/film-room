"use client";

import { useCallback, useEffect, useState } from "react";
import {
  canManageGame,
  getGameContributors,
  removeGameContributor,
  updateGameContributor,
  type Game,
  type GameContributorEntry,
  type GameRole,
} from "@/lib/games";

export type GameContributorsProps = {
  game: Game;
  /** Current viewer uid (controls owner-only management UI). */
  currentUid: string;
  /** Called after the contributor set changes (so parents can refresh). */
  onChanged?: () => void;
};

const ROLE_BADGE: Record<GameRole, string> = {
  owner: "border-amber-600/45 bg-amber-950/45 text-amber-200",
  editor: "border-emerald-600/45 bg-emerald-950/45 text-emerald-200",
  viewer: "border-zinc-600/50 bg-zinc-800/50 text-zinc-300",
};

/**
 * Phase: Contributor Management. Lists a Game's contributors and lets an owner
 * add people (by uid), change roles, and remove them. Non-owners see a
 * read-only list. There is no email/invite directory yet, so people are added
 * by uid; names beyond the current user are not resolvable client-side.
 */
export default function GameContributors({
  game,
  currentUid,
  onChanged,
}: GameContributorsProps) {
  const [entries, setEntries] = useState<GameContributorEntry[]>(() =>
    Object.entries(game.contributors)
      .map(([uid, role]) => ({ uid, role }))
      .sort((a, b) => a.uid.localeCompare(b.uid)),
  );
  const [addUid, setAddUid] = useState("");
  const [addRole, setAddRole] = useState<Exclude<GameRole, "owner">>("editor");
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = canManageGame(game, currentUid);
  const ownerCount = entries.filter((e) => e.role === "owner").length;

  const reload = useCallback(async () => {
    try {
      setEntries(await getGameContributors(game.id));
    } catch {
      /* Leave current list on failure. */
    }
  }, [game.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = useCallback(async () => {
    const uid = addUid.trim();
    if (!uid) {
      setError("Enter a user id to add.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await updateGameContributor(game.id, uid, addRole);
      setAddUid("");
      await reload();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add contributor.");
    } finally {
      setAdding(false);
    }
  }, [addUid, addRole, game.id, reload, onChanged]);

  const handleRole = useCallback(
    async (uid: string, role: GameRole) => {
      const current = entries.find((e) => e.uid === uid);
      if (!current || current.role === role) return;
      if (current.role === "owner" && role !== "owner" && ownerCount <= 1) {
        setError("Cannot demote the only owner.");
        return;
      }
      setBusyUid(uid);
      setError(null);
      try {
        await updateGameContributor(game.id, uid, role);
        await reload();
        onChanged?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change role.");
      } finally {
        setBusyUid(null);
      }
    },
    [entries, ownerCount, game.id, reload, onChanged],
  );

  const handleRemove = useCallback(
    async (uid: string) => {
      setBusyUid(uid);
      setError(null);
      try {
        await removeGameContributor(game.id, uid);
        await reload();
        onChanged?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not remove contributor.");
      } finally {
        setBusyUid(null);
      }
    },
    [game.id, reload, onChanged],
  );

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Contributors
      </p>

      <ul className="space-y-1.5">
        {entries.map((e) => {
          const isYou = e.uid === currentUid;
          const canEditRow = isOwner && !(e.role === "owner" && ownerCount <= 1);
          return (
            <li
              key={e.uid}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] text-zinc-200">
                  {e.uid}
                  {isYou ? (
                    <span className="ml-1 text-[10px] text-blue-300">(you)</span>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {isOwner ? (
                  <select
                    value={e.role}
                    disabled={busyUid === e.uid || !canEditRow}
                    onChange={(ev) =>
                      void handleRole(e.uid, ev.target.value as GameRole)
                    }
                    className="rounded-md border border-white/12 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-200 disabled:opacity-40"
                  >
                    <option value="owner">owner</option>
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                ) : (
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${ROLE_BADGE[e.role]}`}
                  >
                    {e.role}
                  </span>
                )}
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => void handleRemove(e.uid)}
                    disabled={busyUid === e.uid || !canEditRow}
                    className="rounded-md border border-red-500/35 bg-red-950/35 px-1.5 py-0.5 text-[10px] font-semibold text-red-200 transition hover:bg-red-900/45 disabled:opacity-40"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {isOwner ? (
        <div className="mt-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Add contributor
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={addUid}
              onChange={(ev) => setAddUid(ev.target.value)}
              placeholder="User id (uid)"
              className="min-w-0 flex-1 rounded-md border border-white/12 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            />
            <select
              value={addRole}
              onChange={(ev) =>
                setAddRole(ev.target.value as Exclude<GameRole, "owner">)
              }
              className="rounded-md border border-white/12 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-200"
            >
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding}
              className="rounded-md border border-blue-500/40 bg-blue-950/50 px-2.5 py-1 text-[11px] font-semibold text-blue-100 transition hover:bg-blue-900/55 disabled:opacity-40"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          <p className="mt-1.5 text-[9px] leading-snug text-zinc-500">
            Email invites aren&apos;t supported yet — add by Firebase uid. Editors
            can add sources, marks, and perspectives; viewers can only watch.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-[10px] leading-snug text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
