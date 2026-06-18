import {
  getParentInviteTarget,
  markParentTargetInvited,
  type ParentInviteTarget,
} from "@/lib/parent-invite-targets";
import {
  createTeamInvite,
  getTeamInvite,
  isInviteExpired,
} from "@/lib/team-invites";
import type { Team } from "@/lib/teams";

/** Reuse an active parent invite or create one for a roster target. */
export async function ensureParentInviteForTarget(
  team: Team,
  target: ParentInviteTarget,
  createdBy: string,
): Promise<string> {
  if (target.inviteCode) {
    const existing = await getTeamInvite(target.inviteCode);
    if (existing?.active && !isInviteExpired(existing)) {
      return target.inviteCode;
    }
  }

  const code = await createTeamInvite(team, createdBy, "parent", {
    label: `Parent: ${target.parentName}`,
    expiresInDays: 60,
  });
  await markParentTargetInvited(team.id, target.id, code);
  return code;
}

export async function ensureParentInviteForTargetId(
  team: Team,
  targetId: string,
  createdBy: string,
): Promise<string> {
  const target = await getParentInviteTarget(team.id, targetId);
  if (!target) throw new Error("Parent invite target not found.");
  return ensureParentInviteForTarget(team, target, createdBy);
}
