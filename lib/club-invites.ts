import {
  canManageClub,
  type Club,
  type ClubMemberRole,
} from "@/lib/clubs";
import { firestore } from "@/lib/firebase";
import { isPermissionDeniedError } from "@/lib/firestore-errors";
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

/**
 * Club invite links — join as club_admin, club_coach, or club_parent.
 * Layout: clubInvites/{code}
 */

export type ClubInviteRole = ClubMemberRole;

export type ClubInvite = {
  code: string;
  clubId: string;
  clubName: string;
  role: ClubInviteRole;
  label?: string;
  createdBy: string;
  createdAt: Timestamp | null;
  expiresAt?: Timestamp | null;
  active: boolean;
};

const INVITE_ROLES: ClubInviteRole[] = [
  "club_admin",
  "club_coach",
  "club_parent",
];

function clubInvitesCol() {
  return collection(firestore, "clubInvites");
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

function parseInvite(
  id: string,
  raw: Record<string, unknown>,
): ClubInvite | null {
  const role = raw.role;
  if (!INVITE_ROLES.includes(role as ClubInviteRole)) return null;
  return {
    code: id,
    clubId: typeof raw.clubId === "string" ? raw.clubId : "",
    clubName: typeof raw.clubName === "string" ? raw.clubName : "Club",
    role: role as ClubInviteRole,
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

export function isClubInviteExpired(invite: ClubInvite): boolean {
  if (!invite.expiresAt) return false;
  return invite.expiresAt.toMillis() < Date.now();
}

export async function createClubInvite(
  club: Club,
  createdBy: string,
  role: ClubInviteRole,
  opts?: { label?: string; expiresInDays?: number },
): Promise<string> {
  if (!canManageClub(club, createdBy)) {
    throw new Error("Only club admins can create invites.");
  }
  const code = randomInviteCode();
  const expiresInDays = opts?.expiresInDays ?? 30;
  const expiresAt = Timestamp.fromMillis(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  );
  await setDoc(doc(clubInvitesCol(), code), {
    clubId: club.id,
    clubName: club.name,
    role,
    createdBy,
    createdAt: serverTimestamp(),
    expiresAt,
    active: true,
    ...(trimOrUndef(opts?.label) ? { label: opts!.label!.trim() } : {}),
  });
  return code;
}

export async function getClubInvite(code: string): Promise<ClubInvite | null> {
  try {
    const snap = await getDoc(doc(clubInvitesCol(), code));
    if (!snap.exists()) return null;
    return parseInvite(snap.id, snap.data() as Record<string, unknown>);
  } catch (e) {
    if (isPermissionDeniedError(e)) return null;
    throw e;
  }
}

/**
 * Redeem a club invite: add the user as club_coach or club_parent.
 * Uses transient `joinCode` (same pattern as team invites).
 */
export async function redeemClubInvite(
  code: string,
  uid: string,
): Promise<{ clubId: string; role: ClubInviteRole }> {
  const invite = await getClubInvite(code);
  if (!invite || !invite.active) {
    throw new Error("This invite link is not valid.");
  }
  if (isClubInviteExpired(invite)) {
    throw new Error("This invite link has expired.");
  }

  const clubRef = doc(firestore, "clubs", invite.clubId);
  try {
    await updateDoc(clubRef, {
      [`members.${uid}`]: invite.role,
      memberUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
      joinCode: code,
    });
    try {
      await updateDoc(clubRef, { joinCode: deleteField() });
    } catch {
      /* best-effort */
    }
  } catch (err) {
    if (!isPermissionDeniedError(err)) throw err;
    // Already a member — still OK
    try {
      await updateDoc(clubRef, { joinCode: deleteField() });
    } catch {
      /* ignore */
    }
  }

  return { clubId: invite.clubId, role: invite.role };
}

export async function deactivateClubInvite(code: string): Promise<void> {
  await updateDoc(doc(clubInvitesCol(), code), {
    active: false,
    updatedAt: serverTimestamp(),
    expiresAt: deleteField(),
  });
}

export function clubInviteJoinPath(code: string): string {
  return `/join/club/${code}`;
}

export function normalizeClubInviteCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed).trim();
  } catch {
    return trimmed;
  }
}

/** Accept a join URL or the invite code itself. */
export function extractClubInviteCode(input: string): string | null {
  const raw = normalizeClubInviteCode(input);
  if (!raw) return null;
  try {
    const asUrl = raw.includes("://")
      ? new URL(raw)
      : new URL(raw, "https://filmroom.local");
    const match = asUrl.pathname.match(/\/join\/club\/([^/]+)\/?$/i);
    if (match?.[1]) return normalizeClubInviteCode(match[1]);
  } catch {
    /* not a URL */
  }
  if (/^[A-Za-z0-9_-]{12,}$/.test(raw)) return raw;
  return null;
}
