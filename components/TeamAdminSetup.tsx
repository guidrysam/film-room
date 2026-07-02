"use client";

import { useState } from "react";
import TeamLogoUpload from "@/components/TeamLogoUpload";
import ParentInviteTargets from "@/components/ParentInviteTargets";
import BackfillEventPersons from "@/components/BackfillEventPersons";
import RosterImportResultSummary from "@/components/RosterImportResultSummary";
import TeamDeleteZone from "@/components/TeamDeleteZone";
import TeamInvites from "@/components/TeamInvites";
import TeamRosterImport from "@/components/TeamRosterImport";
import {
  clearTeamCreateImportSummary,
  readTeamCreateImportSummary,
  type TeamCreateImportSummary,
} from "@/lib/roster-import";
import { canCoachTeam, canManageTeam, type Team } from "@/lib/teams";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

export type TeamAdminSetupProps = {
  team: Team;
  currentUid: string;
};

/**
 * Team administration for operators (admins). Coaches use Games and Review;
 * roster import and invites stay with the person who maintains Film Room.
 */
export default function TeamAdminSetup({ team, currentUid }: TeamAdminSetupProps) {
  const [createSummary] = useState<TeamCreateImportSummary | null>(() => {
    const summary = readTeamCreateImportSummary();
    if (summary) clearTeamCreateImportSummary();
    return summary;
  });

  const isOperator = canManageTeam(team, currentUid);

  if (!canCoachTeam(team, currentUid)) {
    return (
      <div className={panelClass}>
        <p className="text-sm text-zinc-400">
          Team setup is available to coaches and admins only.
        </p>
      </div>
    );
  }

  if (!isOperator) {
    return (
      <div className={panelClass}>
        <p className="text-sm font-medium text-white">Film Room is ready</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Your club admin maintains rosters and invites. Open{" "}
          <strong className="font-medium text-zinc-200">Games</strong> to attach
          film, then use Game Review to tag plays and add coach marks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {createSummary ? (
        <RosterImportResultSummary
          result={createSummary}
          title={`${createSummary.teamName} created`}
          showTeamCreated
          description="Your roster and parent contacts are ready. Invite parents below to upload video and build highlights."
        />
      ) : null}

      <section className={panelClass}>
        <h2 className="mb-1 text-sm font-semibold text-white">Branding</h2>
        <p className="mb-3 text-xs leading-relaxed text-zinc-500">
          Team logo appears on highlight reel title screens.
        </p>
        <TeamLogoUpload team={team} />
      </section>

      <section
        className={`${panelClass} ring-2 ring-blue-500/20`}
        aria-labelledby="teamlinkt-import-heading"
      >
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/90">
          Start here
        </p>
        <h2
          id="teamlinkt-import-heading"
          className="mb-2 text-base font-semibold text-white"
        >
          Import from TeamLinkt CSV
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-zinc-400">
          Export your roster from TeamLinkt, then upload the CSV here to create
          players and parent invite targets. No emails are sent automatically.
        </p>
        <TeamRosterImport team={team} currentUid={currentUid} />
        <div className="mt-4">
          <BackfillEventPersons team={team} currentUid={currentUid} />
        </div>
      </section>

      <section className={panelClass}>
        <h2 className="mb-1 text-sm font-semibold text-white">
          Build Your Video Team
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-zinc-500">
          Invite parents to upload video, view games, and help build player
          highlights.
        </p>
        <ParentInviteTargets team={team} currentUid={currentUid} />
      </section>

      <section className={panelClass}>
        <h2 className="mb-3 text-sm font-semibold text-white">Team invites</h2>
        <TeamInvites team={team} currentUid={currentUid} />
      </section>

      <section className={`${panelClass} border-dashed border-white/10`}>
        <h2 className="mb-1 text-sm font-semibold text-zinc-300">Team YouTube</h2>
        <p className="text-xs text-zinc-500">
          Shared team channel configuration — coming soon.
        </p>
      </section>

      <TeamDeleteZone team={team} currentUid={currentUid} />
    </div>
  );
}
