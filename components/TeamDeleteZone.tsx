"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  canDeleteTeam,
  deleteTeam,
  listTeamGames,
  TEAM_DELETE_BLOCKED_GAMES_MSG,
  type Team,
} from "@/lib/teams";

export type TeamDeleteZoneProps = {
  team: Team;
  currentUid: string;
};

const inputClass =
  "w-full rounded-lg border border-rose-500/30 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-rose-500/50 focus:outline-none focus:ring-1 focus:ring-rose-500/40";

const dangerBtn =
  "rounded-lg border border-rose-500/40 bg-rose-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50";

export default function TeamDeleteZone({ team, currentUid }: TeamDeleteZoneProps) {
  const router = useRouter();
  const [gameCount, setGameCount] = useState<number | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = canDeleteTeam(team, currentUid);
  const nameMatches = confirmName.trim() === team.name;
  const blockedByGames = gameCount != null && gameCount > 0;

  useEffect(() => {
    if (!canDelete) return;
    void listTeamGames(currentUid, team.id)
      .then((games) => setGameCount(games.length))
      .catch(() => setGameCount(0));
  }, [canDelete, currentUid, team.id]);

  const handleDelete = useCallback(async () => {
    if (!nameMatches || blockedByGames) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteTeam(team.id, currentUid);
      router.push("/app");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete team.");
      setDeleting(false);
    }
  }, [team.id, currentUid, nameMatches, blockedByGames, router]);

  if (!canDelete) {
    return null;
  }

  return (
    <section
      className="rounded-xl border border-rose-500/25 bg-rose-950/15 p-5 shadow-lg shadow-black/35 ring-1 ring-rose-500/15"
      aria-labelledby="team-delete-heading"
    >
      <h2 id="team-delete-heading" className="mb-1 text-sm font-semibold text-rose-100">
        Danger zone
      </h2>
      <p className="mb-4 text-xs leading-relaxed text-rose-200/80">
        This removes the roster, parent contacts, and team invites. Games and
        videos will not be deleted.
      </p>

      {gameCount === null ? (
        <p className="text-xs text-zinc-500">Checking for linked games…</p>
      ) : blockedByGames ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2.5 text-xs text-amber-100">
          {TEAM_DELETE_BLOCKED_GAMES_MSG}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs text-zinc-400">
            Type <span className="font-medium text-zinc-200">{team.name}</span> to
            confirm
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={team.name}
              className={`${inputClass} mt-1.5`}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting || !nameMatches}
            className={dangerBtn}
          >
            {deleting ? "Deleting team…" : "Delete team"}
          </button>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-xs text-rose-300">{error}</p>
      ) : null}
    </section>
  );
}
