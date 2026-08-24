"use client";

import Link from "next/link";
import {
  teamAcademyUrl,
  teamGamesUrl,
  teamRosterUrl,
  teamSetupUrl,
  teamStatsUrl,
  teamTacticsUrl,
} from "@/lib/team-routes";
import {
  canManageTeam,
  type Team,
  type TeamClubContext,
} from "@/lib/teams";
import { isSoccerCurriculumSport, sportLabel } from "@/lib/sports";

export type TeamNavTab =
  | "roster"
  | "setup"
  | "games"
  | "stats"
  | "tactics"
  | "academy";

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
  club?: TeamClubContext | null;
  /** Omit on sub-pages (e.g. player profile) when no tab is active. */
  active?: TeamNavTab;
};

/**
 * Team hub navigation organized around the team's lifecycle:
 * Roster, Games, Tactics, Season, plus a Settings gear for admins.
 */
export default function TeamNav({
  team,
  currentUid,
  club,
  active,
}: TeamNavProps) {
  const showSettings = canManageTeam(team, currentUid, club);
  const showSoccerCurriculum = isSoccerCurriculumSport(team.sport);
  const showAcademy =
    showSoccerCurriculum &&
    (process.env.NEXT_PUBLIC_ACADEMY_ENABLED === "true" ||
      process.env.NODE_ENV === "development");
  const base = teamRosterUrl(team.id);

  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-white/[0.06] pb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Team
            {team.sport ? ` · ${sportLabel(team.sport)}` : ""}
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
        {showSoccerCurriculum ? (
          <Link
            href={teamTacticsUrl(team.id)}
            className={tabClass(active === "tactics")}
          >
            Tactics
          </Link>
        ) : null}
        {showAcademy ? (
          <Link
            href={teamAcademyUrl(team.id)}
            className={tabClass(active === "academy")}
          >
            Academy
          </Link>
        ) : null}
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
