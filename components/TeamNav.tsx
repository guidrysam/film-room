"use client";

import Link from "next/link";
import { canCoachTeam, type Team } from "@/lib/teams";

export type TeamNavTab = "roster" | "setup" | "games";

const tabClass = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
    active
      ? "border-blue-500/45 bg-blue-600/25 text-white"
      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/15 hover:text-zinc-200"
  }`;

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

export type TeamNavProps = {
  team: Team;
  currentUid: string;
  active: TeamNavTab;
};

/**
 * Team hub navigation: Roster, Setup (coaches/admins), Games, plus Game Cap.
 */
export default function TeamNav({ team, currentUid, active }: TeamNavProps) {
  const showSetup = canCoachTeam(team, currentUid);
  const base = `/team/${team.id}`;

  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-white/[0.06] pb-5">
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
          Team
        </p>
        <h1 className="text-xl font-semibold text-white">{team.name}</h1>
      </div>
      <nav className="flex flex-wrap items-center gap-2" aria-label="Team sections">
        <Link href={base} className={tabClass(active === "roster")}>
          Roster
        </Link>
        {showSetup ? (
          <Link href={`${base}/setup`} className={tabClass(active === "setup")}>
            Setup
          </Link>
        ) : null}
        <Link href={`${base}/games`} className={tabClass(active === "games")}>
          Games
        </Link>
        <Link
          href={`/game-cap?teamId=${team.id}`}
          className={ghostBtn}
        >
          Game Cap
        </Link>
      </nav>
      <div className="flex flex-wrap gap-2">
        <Link href="/app" className={ghostBtn}>
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}
