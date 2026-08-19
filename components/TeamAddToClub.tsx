"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  attachTeamToClub,
  canAttachTeamToClub,
  listMyClubs,
  type Club,
} from "@/lib/clubs";
import { clubHubUrl, clubsFindUrl } from "@/lib/club-routes";
import type { Team } from "@/lib/teams";
import { canManageTeam } from "@/lib/teams";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const selectClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white";

type Props = {
  team: Team;
  uid: string;
  onAttached: (clubId: string) => void;
};

/**
 * Team admin: connect a standalone team (often created as a parent) to a club.
 */
export default function TeamAddToClub({ team, uid, onAttached }: Props) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = (await listMyClubs(uid)).filter((club) =>
        canAttachTeamToClub(club, team, uid),
      );
      setClubs(rows);
      if (rows.length === 1) setClubId(rows[0]!.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load clubs.");
      setClubs([]);
    } finally {
      setLoading(false);
    }
  }, [uid, team]);

  useEffect(() => {
    if (!canManageTeam(team, uid) || team.clubId?.trim()) return;
    void load();
  }, [load, team, uid]);

  if (!canManageTeam(team, uid)) return null;
  if (team.clubId?.trim()) {
    return (
      <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
        <h2 className="text-sm font-semibold text-white">Club</h2>
        <p className="mt-1 text-xs text-zinc-400">This team is in a club.</p>
        <Link
          href={clubHubUrl(team.clubId.trim())}
          className={`${ghostBtn} mt-3 inline-block`}
        >
          Open club
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-5">
      <h2 className="text-sm font-semibold text-white">Add to a club</h2>
      <p className="mt-1 text-xs text-zinc-400">
        This team isn’t under a club yet. Connect it so coaches and parents in
        the club can share film onto it.
      </p>
      {error ? (
        <p className="mt-2 text-xs text-rose-200">{error}</p>
      ) : null}
      {loading ? (
        <p className="mt-3 text-xs text-zinc-500">Loading clubs…</p>
      ) : clubs.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-400">
          Join a club first, then come back here.{" "}
          <Link href={clubsFindUrl()} className="text-blue-300 hover:underline">
            Find a club
          </Link>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[10rem] flex-1 text-[11px] text-zinc-500">
            Club
            <select
              className={selectClass}
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
            >
              <option value="">Select…</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={primaryBtn}
            disabled={busy || !clubId}
            onClick={() => {
              if (!clubId) return;
              setBusy(true);
              setError(null);
              void attachTeamToClub({
                actorUid: uid,
                clubId,
                teamId: team.id,
              })
                .then(() => onAttached(clubId))
                .catch((e) => {
                  setError(
                    e instanceof Error ? e.message : "Could not add to club.",
                  );
                })
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Connecting…" : "Connect to club"}
          </button>
        </div>
      )}
    </section>
  );
}
