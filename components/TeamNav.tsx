"use client";

import Link from "next/link";
import {
  teamGamesUrl,
  teamRosterUrl,
  teamSetupUrl,
  teamStatsUrl,
} from "@/lib/team-routes";
import { canManageTeam, type Team } from "@/lib/teams";

export type TeamNavTab = "roster" | "setup" | "games" | "stats";

const tabClass = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
    active
      ? "border-blue-500/45 bg-blue-600/25 text-white"
      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/15 hover:text-zinc-200"
  }`;

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

const iconBtn =
  "inline-flex items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

export type TeamNavProps = {
  team: Team;
  currentUid: string;
  /** Omit on sub-pages (e.g. player profile) when no tab is active. */
  active?: TeamNavTab;
};

/**
 * Team hub navigation organized around the team's lifecycle:
 * Roster, Games, Season, plus a Settings gear for coaches.
 */
export default function TeamNav({ team, currentUid, active }: TeamNavProps) {
  const showSettings = canManageTeam(team, currentUid);
  const base = teamRosterUrl(team.id);

  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-white/[0.06] pb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Team
          </p>
          <h1 className="text-xl font-semibold text-white">{team.name}</h1>
        </div>
        {showSettings ? (
          <Link
            href={teamSetupUrl(team.id)}
            className={`${iconBtn} ${active === "setup" ? "border-blue-500/45 bg-blue-600/25 text-white" : ""}`}
            aria-label="Team settings"
            title="Team settings"
          >
            <span aria-hidden className="text-sm leading-none">
              ⚙
            </span>
          </Link>
        ) : null}
      </div>
      <nav className="flex flex-wrap items-center gap-2" aria-label="Team sections">
        <Link href={base} className={tabClass(active === "roster")}>
          Roster
        </Link>
        <Link href={teamGamesUrl(team.id)} className={tabClass(active === "games")}>
          Games
        </Link>
        <Link href={teamStatsUrl(team.id)} className={tabClass(active === "stats")}>
          Season
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
