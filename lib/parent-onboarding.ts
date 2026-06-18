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

export function parentInviteMessage(teamName: string, joinUrl: string): string {
  return `Join our Film Room team (${teamName}) here: ${joinUrl}`;
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
