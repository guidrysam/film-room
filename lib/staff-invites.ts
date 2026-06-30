import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { isPermissionDeniedError } from "@/lib/firestore-errors";
import { linkParentOnTeamJoin } from "@/lib/parent-invite-targets";
import { canManageTeam, type Team, type TeamMemberRole } from "@/lib/teams";

/**
 * One invite link that adds a staff member to multiple teams at once
 * (e.g. all teams in a tournament import batch).
 *
 * Layout: staffInvites/{code}
 */

export type StaffInviteRole = Exclude<TeamMemberRole, "admin">;

export type StaffInvite = {
  code: string;
  teamIds: string[];
  eventLabel: string;
  role: StaffInviteRole;
  label?: string;
  createdBy: string;
  createdAt: Timestamp | null;
  expiresAt?: Timestamp | null;
  active: boolean;
};

const STAFF_ROLES: StaffInviteRole[] = ["coach", "parent", "player", "viewer"];

function staffInvitesCol() {
  return collection(firestore, "staffInvites");
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

function parseStaffInvite(
  id: string,
  raw: Record<string, unknown>,
): StaffInvite | null {
  const role = raw.role;
  if (!STAFF_ROLES.includes(role as StaffInviteRole)) return null;
  const teamIdsRaw = Array.isArray(raw.teamIds) ? raw.teamIds : [];
  const teamIds = teamIdsRaw.filter(
    (id): id is string => typeof id === "string" && id.trim() !== "",
  );
  if (teamIds.length === 0) return null;
  return {
    code: id,
    teamIds,
    eventLabel:
      typeof raw.eventLabel === "string"
        ? raw.eventLabel.trim() || "Event"
        : "Event",
    role: role as StaffInviteRole,
    ...(trimOrUndef(raw.label) ? { label: (raw.label as string).trim() } : {}),
    createdBy: typeof raw.createdBy === "string" ? raw.createdBy : "",
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    ...(raw.expiresAt instanceof Timestamp ? { expiresAt: raw.expiresAt } : {}),
    active: raw.active !== false,
  };
}

export function isStaffInviteExpired(invite: StaffInvite): boolean {
  if (!invite.expiresAt) return false;
  return invite.expiresAt.toMillis() <= Date.now();
}

export type CreateStaffInviteInput = {
  teams: Team[];
  actorUid: string;
  eventLabel: string;
  role?: StaffInviteRole;
  label?: string;
  expiresInDays?: number;
};

/** Create a multi-team staff invite. Caller must be admin on every team. */
export async function createStaffInvite(
  input: CreateStaffInviteInput,
): Promise<string> {
  const role = input.role ?? "coach";
  if (!STAFF_ROLES.includes(role)) {
    throw new Error(`Invalid staff invite role: ${role}`);
  }
  const manageable = input.teams.filter((team) =>
    canManageTeam(team, input.actorUid),
  );
  if (manageable.length === 0) {
    throw new Error("You must be a team admin to create staff invites.");
  }
  const teamIds = manageable.map((t) => t.id);
  const eventLabel = input.eventLabel.trim() || "Event";
  const code = randomInviteCode();
  const expiresInDays = input.expiresInDays ?? 90;
  const expiresAt =
    expiresInDays > 0
      ? Timestamp.fromMillis(Date.now() + expiresInDays * 86_400_000)
      : null;

  await setDoc(doc(staffInvitesCol(), code), {
    code,
    teamIds,
    eventLabel,
    role,
    createdBy: input.actorUid,
    active: true,
    createdAt: serverTimestamp(),
    ...(expiresAt ? { expiresAt } : {}),
    ...(trimOrUndef(input.label) ? { label: input.label!.trim() } : {}),
  });
  return code;
}

export async function getStaffInvite(code: string): Promise<StaffInvite | null> {
  const snap = await getDoc(doc(staffInvitesCol(), code.trim()));
  if (!snap.exists()) return null;
  return parseStaffInvite(snap.id, snap.data() as Record<string, unknown>);
}

export async function setStaffInviteActive(
  code: string,
  active: boolean,
): Promise<void> {
  await updateDoc(doc(staffInvitesCol(), code), { active });
}

/** Join a team via invite without reading the team doc (non-members cannot read). */
async function tryJoinTeamViaInviteCode(
  teamRef: ReturnType<typeof doc>,
  uid: string,
  role: StaffInviteRole,
  code: string,
): Promise<boolean> {
  try {
    await updateDoc(teamRef, {
      [`members.${uid}`]: role,
      memberUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
      joinCode: code,
    });
    try {
      await updateDoc(teamRef, { joinCode: deleteField() });
    } catch {
      /* Best-effort cleanup of transient joinCode. */
    }
    return true;
  } catch (err) {
    if (!isPermissionDeniedError(err)) throw err;
    try {
      await updateDoc(teamRef, { joinCode: deleteField() });
    } catch {
      /* Already a member or invite invalid. */
    }
    return false;
  }
}

/** Redeem a staff invite — join all listed teams with the invite role. */
export async function redeemStaffInvite(
  code: string,
  uid: string,
  opts?: { email?: string | null },
): Promise<{ joined: number; skipped: number }> {
  const invite = await getStaffInvite(code);
  if (!invite) throw new Error("This invite link is not valid.");
  if (!invite.active) throw new Error("This invite link has been deactivated.");
  if (isStaffInviteExpired(invite)) {
    throw new Error("This invite link has expired.");
  }

  let joined = 0;
  let skipped = 0;

  for (const teamId of invite.teamIds) {
    const teamRef = doc(firestore, "teams", teamId);
    const joinedTeam = await tryJoinTeamViaInviteCode(
      teamRef,
      uid,
      invite.role,
      code,
    );
    if (joinedTeam) {
      joined += 1;
      if (invite.role === "parent") {
        try {
          await linkParentOnTeamJoin(teamId, uid, {
            email: opts?.email,
            inviteCode: code,
          });
        } catch {
          /* Roster link is best-effort; join still succeeds. */
        }
      }
    } else {
      skipped += 1;
    }
  }

  return { joined, skipped };
}
