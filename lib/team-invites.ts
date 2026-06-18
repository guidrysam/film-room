import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { linkParentOnTeamJoin } from "@/lib/parent-invite-targets";
import type { Team, TeamMemberRole } from "@/lib/teams";

/**
 * Team invite links (parallel to gameInvites).
 *
 * Layout: teamInvites/{code}
 *
 * Roles coach | parent | player | viewer — admin cannot be granted via invite.
 */

export type TeamInviteRole = Exclude<TeamMemberRole, "admin">;

export type TeamInvite = {
  code: string;
  teamId: string;
  teamName: string;
  role: TeamInviteRole;
  label?: string;
  createdBy: string;
  createdAt: Timestamp | null;
  expiresAt?: Timestamp | null;
  active: boolean;
};

const INVITE_ROLES: TeamInviteRole[] = [
  "coach",
  "parent",
  "player",
  "viewer",
];

function teamInvitesCol() {
  return collection(firestore, "teamInvites");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function randomInviteCode(): string {
  const bytes = new Uint8Array(18);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseInvite(id: string, raw: Record<string, unknown>): TeamInvite | null {
  const role = raw.role;
  if (!INVITE_ROLES.includes(role as TeamInviteRole)) return null;
  return {
    code: id,
    teamId: typeof raw.teamId === "string" ? raw.teamId : "",
    teamName: typeof raw.teamName === "string" ? raw.teamName : "Team",
    role: role as TeamInviteRole,
    ...(trimOrUndef(raw.label) ? { label: (raw.label as string).trim() } : {}),
    createdBy: typeof raw.createdBy === "string" ? raw.createdBy : "",
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    expiresAt:
      raw.expiresAt instanceof Timestamp
        ? raw.expiresAt
        : raw.expiresAt === null
          ? null
          : undefined,
    active: raw.active === true,
  };
}

export function isInviteExpired(invite: TeamInvite): boolean {
  if (!invite.expiresAt) return false;
  return invite.expiresAt.toMillis() < Date.now();
}

export async function createTeamInvite(
  team: Team,
  createdBy: string,
  role: TeamInviteRole,
  opts?: { label?: string; expiresInDays?: number },
): Promise<string> {
  if (!INVITE_ROLES.includes(role)) {
    throw new Error(`Invalid invite role: ${role}`);
  }
  const code = randomInviteCode();
  const now = serverTimestamp();
  const expiresInDays = opts?.expiresInDays ?? 30;
  const expiresAt =
    expiresInDays > 0
      ? Timestamp.fromMillis(Date.now() + expiresInDays * 86_400_000)
      : null;
  await setDoc(doc(teamInvitesCol(), code), {
    code,
    teamId: team.id,
    teamName: team.name,
    role,
    createdBy,
    active: true,
    createdAt: now,
    ...(expiresAt ? { expiresAt } : {}),
    ...(trimOrUndef(opts?.label) ? { label: opts!.label!.trim() } : {}),
  });
  return code;
}

export async function getTeamInvite(code: string): Promise<TeamInvite | null> {
  const snap = await getDoc(doc(teamInvitesCol(), code.trim()));
  if (!snap.exists()) return null;
  return parseInvite(snap.id, snap.data() as Record<string, unknown>);
}

export async function listTeamInvites(teamId: string): Promise<TeamInvite[]> {
  const q = query(teamInvitesCol(), where("teamId", "==", teamId));
  const snap = await getDocs(q);
  const out: TeamInvite[] = [];
  snap.forEach((d) => {
    const inv = parseInvite(d.id, d.data() as Record<string, unknown>);
    if (inv) out.push(inv);
  });
  out.sort(
    (a, b) =>
      (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  );
  return out;
}

export async function setTeamInviteActive(
  code: string,
  active: boolean,
): Promise<void> {
  await updateDoc(doc(teamInvitesCol(), code), { active });
}

/**
 * Redeem a team invite: add the user to members + memberUids on the team doc.
 * Uses a transient `joinCode` field (same pattern as game invites).
 */
export async function redeemTeamInvite(
  code: string,
  uid: string,
  opts?: { displayName?: string | null; email?: string | null },
): Promise<void> {
  const invite = await getTeamInvite(code);
  if (!invite) throw new Error("This invite link is not valid.");
  if (!invite.active) throw new Error("This invite link has been deactivated.");
  if (isInviteExpired(invite)) throw new Error("This invite link has expired.");

  const teamRef = doc(firestore, "teams", invite.teamId);
  const teamSnap = await getDoc(teamRef);
  if (!teamSnap.exists()) throw new Error("Team not found.");

  const members =
    teamSnap.data().members && typeof teamSnap.data().members === "object"
      ? (teamSnap.data().members as Record<string, unknown>)
      : {};
  const alreadyMember = uid in members;

  if (!alreadyMember) {
    await updateDoc(teamRef, {
      [`members.${uid}`]: invite.role,
      memberUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
      joinCode: code,
    });
  } else {
    await updateDoc(teamRef, { joinCode: deleteField() });
  }

  if (invite.role === "parent") {
    try {
      await linkParentOnTeamJoin(invite.teamId, uid, {
        email: opts?.email,
        inviteCode: code,
      });
    } catch {
      /* Onboarding link is best-effort; join still succeeds. */
    }
  }

  try {
    await updateDoc(teamRef, { joinCode: deleteField() });
  } catch {
    /* Best-effort cleanup of transient joinCode. */
  }
}
