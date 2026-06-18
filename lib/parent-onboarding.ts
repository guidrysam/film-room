import { normalizeEmail } from "@/lib/roster-csv";
import type { ParentInviteTarget } from "@/lib/parent-invite-targets";

export type ParentInviteTargetStatus =
  | "not_invited"
  | "invited"
  | "joined"
  | "ignored";

/** Whether a user may read a parent invite target (mirrors Firestore rules). */
export function canReadParentInviteTarget(
  uid: string,
  isCoach: boolean,
  target: Pick<ParentInviteTarget, "joinedUid">,
): boolean {
  if (isCoach) return true;
  return target.joinedUid === uid;
}

/** Find roster targets matching a parent's Google email and/or invite code. */
export function findParentTargetsToLink(
  targets: ParentInviteTarget[],
  email: string | undefined,
  inviteCode?: string,
): ParentInviteTarget[] {
  const normalized = email ? normalizeEmail(email) : undefined;
  const out: ParentInviteTarget[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    if (target.status === "ignored") continue;
    if (target.status === "joined" && target.joinedUid) continue;

    const byCode =
      inviteCode &&
      target.inviteCode &&
      target.inviteCode === inviteCode.trim();
    const byEmail =
      normalized && normalizeEmail(target.email) === normalized;

    if (byCode || byEmail) {
      if (!seen.has(target.id)) {
        seen.add(target.id);
        out.push(target);
      }
    }
  }

  return out;
}

export function parentInviteMessage(
  parentName: string,
  teamName: string,
  joinUrl: string,
): string {
  return `Hi ${parentName}, you've been invited to join ${teamName} on Film Room.

Film Room lets parents and coaches upload game video, sync multiple angles, review coach marks, and build player highlights.

Join here:
${joinUrl}

After joining, open Game Cap to upload video from your phone.`;
}

export function combineParentInviteMessages(messages: string[]): string {
  return messages.filter((message) => message.trim()).join("\n\n---\n\n");
}

export function parentInviteMailtoUrl(
  email: string,
  parentName: string,
  teamName: string,
  joinUrl: string,
): string {
  const subject = encodeURIComponent(`Join ${teamName} on Film Room`);
  const body = encodeURIComponent(parentInviteMessage(parentName, teamName, joinUrl));
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

export type ParentVideoTeamSummary = {
  playersImported: number;
  parentContactsImported: number;
  parentsInvited: number;
  parentsJoined: number;
  videoContributors: number;
};

export function summarizeParentVideoTeam(
  playerCount: number,
  targets: ParentInviteTarget[],
  teamMembers: Record<string, string>,
): ParentVideoTeamSummary {
  return {
    playersImported: playerCount,
    parentContactsImported: targets.length,
    parentsInvited: targets.filter((target) => target.status === "invited").length,
    parentsJoined: targets.filter((target) => target.status === "joined").length,
    videoContributors: Object.values(teamMembers).filter((role) => role === "parent")
      .length,
  };
}

export function parentTargetsEligibleForInvite(
  targets: ParentInviteTarget[],
): ParentInviteTarget[] {
  return targets.filter(
    (target) => target.status !== "joined" && target.status !== "ignored",
  );
}

export function parentInviteStatusLabel(
  status: ParentInviteTargetStatus | undefined,
): string {
  switch (status) {
    case "invited":
      return "Invited";
    case "joined":
      return "Joined";
    case "ignored":
      return "Ignored";
    default:
      return "Not invited";
  }
}
