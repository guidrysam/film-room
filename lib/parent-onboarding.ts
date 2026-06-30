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

/** Shorter copy for SMS (keep under ~320 chars when possible). */
export function parentInviteSmsMessage(
  parentName: string,
  teamName: string,
  joinUrl: string,
): string {
  return `Hi ${parentName} — join ${teamName} on Film Room to upload game video and view coach marks: ${joinUrl}`;
}

export function eventInviteSmsMessage(
  eventLabel: string,
  joinUrl: string,
  role: "coach" | "parent",
): string {
  if (role === "coach") {
    return `You're invited as coach for ${eventLabel} on Film Room. Review film and add coach marks: ${joinUrl}`;
  }
  return `Join ${eventLabel} on Film Room as a parent — upload game video from your phone: ${joinUrl}`;
}

export function eventInviteEmailMessage(
  eventLabel: string,
  joinUrl: string,
  role: "coach" | "parent",
): string {
  if (role === "coach") {
    return `You've been invited as a coach for ${eventLabel} on Film Room.

Film Room is where your club reviews game film, tags plays, and adds coach marks.

Accept the invite (one link for all teams in this event):
${joinUrl}

Sign in with Google, accept the invite, then open your dashboard to see every team and game.`;
  }
  return `You've been invited as a parent for ${eventLabel} on Film Room.

Film Room lets parents upload game video from their phone, sync angles, and build player highlights.

Accept the invite (one link for all teams in this event):
${joinUrl}

Sign in with Google, accept the invite, then open Game Cap to upload video.`;
}

/** Strip non-digits except leading + for sms: URIs. */
export function normalizePhoneForSms(phone: string | undefined): string | null {
  if (!phone?.trim()) return null;
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return hasPlus ? `+${digits}` : digits;
}

export function parentInviteSmsUrl(
  phone: string,
  parentName: string,
  teamName: string,
  joinUrl: string,
): string | null {
  const normalized = normalizePhoneForSms(phone);
  if (!normalized) return null;
  const body = encodeURIComponent(
    parentInviteSmsMessage(parentName, teamName, joinUrl),
  );
  return `sms:${encodeURIComponent(normalized)}?&body=${body}`;
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

export function combineParentInviteMessages(messages: string[]): string {
  return messages.filter((message) => message.trim()).join("\n\n---\n\n");
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
