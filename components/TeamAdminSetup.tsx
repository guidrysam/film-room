"use client";

import ParentInviteTargets from "@/components/ParentInviteTargets";
import TeamInvites from "@/components/TeamInvites";
import TeamRosterImport from "@/components/TeamRosterImport";
import { canCoachTeam, type Team } from "@/lib/teams";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

export type TeamAdminSetupProps = {
  team: Team;
  currentUid: string;
};

/**
 * Coach/admin team administration: roster import, parent targets, invite links.
 */
export default function TeamAdminSetup({ team, currentUid }: TeamAdminSetupProps) {
  if (!canCoachTeam(team, currentUid)) {
    return (
      <div className={panelClass}>
        <p className="text-sm text-zinc-400">
          Team setup is available to coaches and admins only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <h2 className="mb-3 text-sm font-semibold text-white">Roster import</h2>
        <TeamRosterImport team={team} currentUid={currentUid} />
      </section>
      <section className={panelClass}>
        <h2 className="mb-3 text-sm font-semibold text-white">Parent onboarding</h2>
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
    </div>
  );
}
