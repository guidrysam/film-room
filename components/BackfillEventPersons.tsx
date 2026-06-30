"use client";

import { useCallback, useState } from "react";
import { backfillTeamEventPersonIds } from "@/lib/backfill-event-persons";
import { canCoachTeam, type Team } from "@/lib/teams";

export type BackfillEventPersonsProps = {
  team: Team;
  currentUid: string;
};

const primaryBtn =
  "rounded-md border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

export default function BackfillEventPersons({
  team,
  currentUid,
}: BackfillEventPersonsProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBackfill = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await backfillTeamEventPersonIds(team.id, currentUid);
      if (result.linkedPlayers === 0) {
        setMessage(
          "No roster players are linked to cross-event player records yet. Re-import the roster or import through a new event batch first.",
        );
        return;
      }
      if (result.patched === 0) {
        setMessage(
          `Checked ${result.games} game${result.games === 1 ? "" : "s"} — all tagged plays already link to player records.`,
        );
        return;
      }
      setMessage(
        `Linked ${result.patched} tagged play${result.patched === 1 ? "" : "s"} across ${result.games} game${result.games === 1 ? "" : "s"} to cross-event player records.`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not link past tags to players.",
      );
    } finally {
      setBusy(false);
    }
  }, [team.id, currentUid]);

  if (!canCoachTeam(team, currentUid)) return null;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3">
      <p className="text-xs font-semibold text-zinc-200">
        Link past tags to player records
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        If you tagged plays before roster import linked players, run this once to
        attach cross-event player ids to older stats and coach marks.
      </p>
      <button
        type="button"
        onClick={() => void handleBackfill()}
        disabled={busy}
        className={`${primaryBtn} mt-3`}
      >
        {busy ? "Linking…" : "Link past tags"}
      </button>
      {message ? (
        <p className="mt-2 text-[11px] text-emerald-200/90">{message}</p>
      ) : null}
      {error ? <p className="mt-2 text-[11px] text-rose-300">{error}</p> : null}
    </div>
  );
}
