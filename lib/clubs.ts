import {
  arrayUnion,
  collection,
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
import { auth, firestore } from "@/lib/firebase";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";
import {
  getTeam,
  listMyTeams,
  updateTeamMember,
  type Team,
} from "@/lib/teams";

/**
 * Club organization layer.
 *
 * Layout:
 *   clubs/{clubId}
 *   teams/{teamId}.clubId → back-link
 *
 * Club roles cascade: club_admin can manage/coach all club teams.
 * club_coach is listed at club and must be assigned onto specific teams.
 * club_parent can see kids across club teams once linked on a roster.
 */

export type ClubMemberRole = "club_admin" | "club_coach" | "club_parent";

export type Club = {
  id: string;
  name: string;
  sport?: string;
  ownerId: string;
  members: Record<string, ClubMemberRole>;
  memberUids: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type CreateClubInput = {
  name: string;
  sport?: string;
};

export type ClubMemberEntry = {
  uid: string;
  role: ClubMemberRole;
};

const CLUB_ROLES: ClubMemberRole[] = [
  "club_admin",
  "club_coach",
  "club_parent",
];

function clubsCol() {
  return collection(firestore, "clubs");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function parseClub(id: string, raw: Record<string, unknown>): Club {
  const membersRaw =
    raw.members && typeof raw.members === "object"
      ? (raw.members as Record<string, unknown>)
      : {};
  const members: Record<string, ClubMemberRole> = {};
  for (const [k, v] of Object.entries(membersRaw)) {
    if (CLUB_ROLES.includes(v as ClubMemberRole)) {
      members[k] = v as ClubMemberRole;
    }
  }
  const memberUids = Array.isArray(raw.memberUids)
    ? (raw.memberUids as unknown[]).filter(
        (u): u is string => typeof u === "string",
      )
    : Object.keys(members);
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : "Club",
    ownerId: typeof raw.ownerId === "string" ? raw.ownerId : "",
    members,
    memberUids,
    ...(trimOrUndef(raw.sport) ? { sport: (raw.sport as string).trim() } : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

export function normalizeCreateClubInput(input: {
  name: string;
  sport?: string;
}): CreateClubInput | { error: string } {
  const name = input.name.trim();
  if (!name) return { error: "Give the club a name." };
  return {
    name,
    ...(trimOrUndef(input.sport) ? { sport: input.sport!.trim() } : {}),
  };
}

export function clubRoleFor(
  club: Club,
  uid: string,
): ClubMemberRole | null {
  if (!uid) return null;
  if (club.ownerId === uid) return "club_admin";
  return club.members[uid] ?? null;
}

export function canManageClub(club: Club, uid: string): boolean {
  if (!uid) return false;
  return club.ownerId === uid || club.members[uid] === "club_admin";
}

export function isClubCoach(club: Club, uid: string): boolean {
  if (!uid) return false;
  return canManageClub(club, uid) || club.members[uid] === "club_coach";
}

export function isClubParent(club: Club, uid: string): boolean {
  if (!uid) return false;
  return club.members[uid] === "club_parent" || canManageClub(club, uid);
}

export function isClubMember(club: Club, uid: string): boolean {
  if (!uid) return false;
  return club.ownerId === uid || club.members[uid] != null;
}

export async function createClub(
  uid: string,
  data: CreateClubInput,
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required to create a club.");
  const effectiveUid = user.uid;
  await user.getIdToken();

  const ref = doc(clubsCol());
  const now = serverTimestamp();
  const name = data.name.trim() || "Club";
  const payload = {
    name,
    ownerId: effectiveUid,
    members: { [effectiveUid]: "club_admin" as ClubMemberRole },
    memberUids: [effectiveUid],
    createdAt: now,
    updatedAt: now,
    ...(trimOrUndef(data.sport) ? { sport: data.sport!.trim() } : {}),
  };

  try {
    await setDoc(ref, payload);
  } catch (error) {
    console.error("createClub failed", error);
    throw formatFirestoreWriteError(
      error,
      "Club creation failed. Check Firestore rules deployment.",
    );
  }
  return ref.id;
}

export async function getClub(clubId: string): Promise<Club | null> {
  const snap = await getDoc(doc(clubsCol(), clubId));
  if (!snap.exists()) return null;
  return parseClub(snap.id, snap.data() as Record<string, unknown>);
}

/** Clubs where the user is a member, newest first. */
export async function listMyClubs(uid: string): Promise<Club[]> {
  const q = query(clubsCol(), where("memberUids", "array-contains", uid));
  const snap = await getDocs(q);
  const out: Club[] = [];
  snap.forEach((d) =>
    out.push(parseClub(d.id, d.data() as Record<string, unknown>)),
  );
  out.sort(
    (a, b) =>
      (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
  );
  return out;
}

/** Teams belonging to a club (requires club membership to read via rules). */
export async function listClubTeams(clubId: string): Promise<Team[]> {
  const q = query(
    collection(firestore, "teams"),
    where("clubId", "==", clubId),
  );
  const snap = await getDocs(q);
  const out: Team[] = [];
  for (const d of snap.docs) {
    const team = await getTeam(d.id);
    if (team) out.push(team);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function updateClubMember(
  clubId: string,
  targetUid: string,
  role: ClubMemberRole,
): Promise<void> {
  const uid = targetUid.trim();
  if (!uid) throw new Error("A user id is required.");
  if (!CLUB_ROLES.includes(role)) {
    throw new Error(`Invalid club role: ${role}`);
  }
  await updateDoc(doc(clubsCol(), clubId), {
    [`members.${uid}`]: role,
    memberUids: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
}

export async function getClubMembers(
  clubId: string,
): Promise<ClubMemberEntry[]> {
  const club = await getClub(clubId);
  if (!club) return [];
  const entries = Object.entries(club.members).map(([uid, role]) => ({
    uid,
    role,
  }));
  if (
    club.ownerId &&
    !entries.some((e) => e.uid === club.ownerId)
  ) {
    entries.push({ uid: club.ownerId, role: "club_admin" });
  }
  return entries.sort((a, b) => a.uid.localeCompare(b.uid));
}

/**
 * Load club for a team when clubId is set. Used to expand team permissions.
 */
export async function loadClubForTeam(
  team: Pick<Team, "clubId"> | null | undefined,
): Promise<Club | null> {
  const clubId = team?.clubId?.trim();
  if (!clubId) return null;
  return getClub(clubId);
}

/** Prefer an existing club for this user, else null. */
export async function primaryClubIdForUser(
  uid: string,
): Promise<string | null> {
  const clubs = await listMyClubs(uid);
  const admin = clubs.find((c) => canManageClub(c, uid));
  return admin?.id ?? clubs[0]?.id ?? null;
}

export async function listTeamsVisibleViaClubs(
  uid: string,
): Promise<Team[]> {
  const clubs = await listMyClubs(uid);
  const byId = new Map<string, Team>();
  for (const club of clubs) {
    if (!canManageClub(club, uid) && !isClubParent(club, uid)) continue;
    const teams = await listClubTeams(club.id);
    for (const team of teams) byId.set(team.id, team);
  }
  const mine = await listMyTeams(uid);
  for (const team of mine) byId.set(team.id, team);
  return [...byId.values()].sort(
    (a, b) =>
      (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
  );
}

/**
 * Place a club coach onto a specific team as team `coach`.
 */
export async function assignCoachToClubTeam(opts: {
  actorUid: string;
  clubId: string;
  teamId: string;
  coachUid: string;
}): Promise<void> {
  const club = await getClub(opts.clubId);
  if (!club) throw new Error("Club not found.");
  if (!canManageClub(club, opts.actorUid)) {
    throw new Error("Only club admins can assign coaches.");
  }
  const team = await getTeam(opts.teamId);
  if (!team) throw new Error("Team not found.");
  if (team.clubId !== opts.clubId) {
    throw new Error("That team does not belong to this club.");
  }
  const role = clubRoleFor(club, opts.coachUid);
  if (role !== "club_coach" && role !== "club_admin") {
    throw new Error("Invite them as a club coach before assigning teams.");
  }
  await updateTeamMember(opts.teamId, opts.coachUid, "coach");
}
