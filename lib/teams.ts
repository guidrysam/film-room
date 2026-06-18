import {
  arrayRemove,
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
import { auth, firestore } from "@/lib/firebase";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";
import {
  createGame,
  listGamesForTeam,
  type CreateGameInput,
  type Game,
} from "@/lib/games";

/**
 * Team organization layer (Phase 1–2).
 *
 * Layout:
 *   teams/{teamId}
 *   teams/{teamId}/players/{playerId}
 *
 * Games remain top-level at games/{gameId} with optional teamId back-link.
 */

export type TeamMemberRole =
  | "admin"
  | "coach"
  | "parent"
  | "player"
  | "viewer";

export type TeamYouTubeConfig = {
  channelId?: string;
  channelTitle?: string;
};

export type TeamMember = {
  uid: string;
  role: TeamMemberRole;
  displayName?: string;
  addedAt?: number;
};

export type Team = {
  id: string;
  name: string;
  sport?: string;
  season?: string;
  clubId?: string;
  ownerId: string;
  /** uid -> role. Creator is always admin. */
  members: Record<string, TeamMemberRole>;
  /** Mirror of member uids for `array-contains` queries. */
  memberUids: string[];
  youtube?: TeamYouTubeConfig;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type Player = {
  id: string;
  name: string;
  jerseyNumber?: string;
  position?: string;
  linkedUid?: string;
  /** Parent member uids linked via roster onboarding. */
  parentUids?: string[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type PlayerInput = {
  name: string;
  jerseyNumber?: string;
  position?: string;
  linkedUid?: string;
};

export type CreateTeamInput = {
  name: string;
  sport?: string;
  season?: string;
  clubId?: string;
};

export type CreateTeamGameInput = CreateGameInput & {
  opponent?: string;
  season?: string;
  scheduledStartAt?: string;
};

function teamsCol() {
  return collection(firestore, "teams");
}

function playersCol(teamId: string) {
  return collection(firestore, "teams", teamId, "players");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

const TEAM_ROLES: TeamMemberRole[] = [
  "admin",
  "coach",
  "parent",
  "player",
  "viewer",
];

function parseTeam(id: string, raw: Record<string, unknown>): Team {
  const membersRaw =
    raw.members && typeof raw.members === "object"
      ? (raw.members as Record<string, unknown>)
      : {};
  const members: Record<string, TeamMemberRole> = {};
  for (const [k, v] of Object.entries(membersRaw)) {
    if (TEAM_ROLES.includes(v as TeamMemberRole)) members[k] = v as TeamMemberRole;
  }
  const memberUids = Array.isArray(raw.memberUids)
    ? (raw.memberUids as unknown[]).filter(
        (u): u is string => typeof u === "string",
      )
    : Object.keys(members);
  const youtubeRaw =
    raw.youtube && typeof raw.youtube === "object"
      ? (raw.youtube as Record<string, unknown>)
      : null;
  const youtube: TeamYouTubeConfig | undefined = youtubeRaw
    ? {
        ...(trimOrUndef(youtubeRaw.channelId)
          ? { channelId: (youtubeRaw.channelId as string).trim() }
          : {}),
        ...(trimOrUndef(youtubeRaw.channelTitle)
          ? { channelTitle: (youtubeRaw.channelTitle as string).trim() }
          : {}),
      }
    : undefined;
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : "Team",
    ownerId: typeof raw.ownerId === "string" ? raw.ownerId : "",
    members,
    memberUids,
    ...(trimOrUndef(raw.sport) ? { sport: (raw.sport as string).trim() } : {}),
    ...(trimOrUndef(raw.season) ? { season: (raw.season as string).trim() } : {}),
    ...(trimOrUndef(raw.clubId) ? { clubId: (raw.clubId as string).trim() } : {}),
    ...(youtube && Object.keys(youtube).length > 0 ? { youtube } : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

/** Normalize manual team create input before persisting. */
export function normalizeCreateTeamInput(input: {
  name: string;
  sport?: string;
  season?: string;
}): CreateTeamInput | { error: string } {
  const name = input.name.trim();
  if (!name) return { error: "Give the team a name." };
  return {
    name,
    ...(trimOrUndef(input.sport) ? { sport: input.sport!.trim() } : {}),
    ...(trimOrUndef(input.season) ? { season: input.season!.trim() } : {}),
  };
}

export async function createTeam(
  uid: string,
  data: CreateTeamInput,
): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sign in required to create a team.");
  }
  if (user.uid !== uid) {
    console.warn("createTeam uid mismatch; using authenticated uid", {
      passedUid: uid,
      authUid: user.uid,
    });
  }
  const effectiveUid = user.uid;
  await user.getIdToken();

  const ref = doc(teamsCol());
  const now = serverTimestamp();
  const name = data.name.trim() || "Team";
  const payload = {
    name,
    ownerId: effectiveUid,
    members: { [effectiveUid]: "admin" },
    memberUids: [effectiveUid],
    createdAt: now,
    updatedAt: now,
    ...(trimOrUndef(data.sport) ? { sport: data.sport!.trim() } : {}),
    ...(trimOrUndef(data.season) ? { season: data.season!.trim() } : {}),
    ...(trimOrUndef(data.clubId) ? { clubId: data.clubId!.trim() } : {}),
  };

  console.log("Creating team", {
    uid: effectiveUid,
    path: ref.path,
    payload: {
      ...payload,
      createdAt: "<serverTimestamp>",
      updatedAt: "<serverTimestamp>",
    },
  });

  try {
    await setDoc(ref, payload);
  } catch (error) {
    console.error("createTeam failed", error);
    throw formatFirestoreWriteError(
      error,
      "Team creation failed. Check Firestore rules deployment.",
    );
  }
  return ref.id;
}

export async function getTeam(teamId: string): Promise<Team | null> {
  const snap = await getDoc(doc(teamsCol(), teamId));
  if (!snap.exists()) return null;
  return parseTeam(snap.id, snap.data() as Record<string, unknown>);
}

/** Teams where the user is a member, newest first. */
export async function listMyTeams(uid: string): Promise<Team[]> {
  const q = query(teamsCol(), where("memberUids", "array-contains", uid));
  const snap = await getDocs(q);
  const out: Team[] = [];
  snap.forEach((d) =>
    out.push(parseTeam(d.id, d.data() as Record<string, unknown>)),
  );
  out.sort(
    (a, b) =>
      (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
  );
  return out;
}

export async function updateTeam(
  teamId: string,
  patch: Partial<CreateTeamInput & { youtube?: TeamYouTubeConfig }>,
): Promise<void> {
  await updateDoc(doc(teamsCol(), teamId), {
    updatedAt: serverTimestamp(),
    ...(patch.name !== undefined ? { name: patch.name.trim() || "Team" } : {}),
    ...(patch.sport !== undefined ? { sport: patch.sport.trim() } : {}),
    ...(patch.season !== undefined ? { season: patch.season.trim() } : {}),
    ...(patch.clubId !== undefined ? { clubId: patch.clubId.trim() } : {}),
    ...(patch.youtube !== undefined ? { youtube: patch.youtube } : {}),
  });
}

export type TeamMemberEntry = {
  uid: string;
  role: TeamMemberRole;
};

function teamRoleRank(role: TeamMemberRole): number {
  switch (role) {
    case "admin":
      return 0;
    case "coach":
      return 1;
    case "parent":
      return 2;
    case "player":
      return 3;
    default:
      return 4;
  }
}

export function teamRoleFor(team: Team, uid: string): TeamMemberRole | null {
  return team.members[uid] ?? null;
}

export function canManageTeam(team: Team, uid: string): boolean {
  if (!uid) return false;
  return team.ownerId === uid || team.members[uid] === "admin";
}

export function canCoachTeam(team: Team, uid: string): boolean {
  if (!uid) return false;
  const role = team.members[uid];
  return canManageTeam(team, uid) || role === "coach";
}

/** Admin, coach, and parent can attach sources (Game Cap contribution). */
export function canContributeTeam(team: Team, uid: string): boolean {
  if (!uid) return false;
  const role = team.members[uid];
  return (
    canManageTeam(team, uid) || role === "coach" || role === "parent"
  );
}

export function canViewTeam(team: Team, uid: string): boolean {
  if (!uid) return false;
  return team.ownerId === uid || team.members[uid] != null;
}

export async function getTeamMembers(
  teamId: string,
): Promise<TeamMemberEntry[]> {
  const team = await getTeam(teamId);
  if (!team) return [];
  return Object.entries(team.members)
    .map(([uid, role]) => ({ uid, role }))
    .sort(
      (a, b) =>
        teamRoleRank(a.role) - teamRoleRank(b.role) ||
        a.uid.localeCompare(b.uid),
    );
}

export async function updateTeamMember(
  teamId: string,
  targetUid: string,
  role: TeamMemberRole,
): Promise<void> {
  const uid = targetUid.trim();
  if (!uid) throw new Error("A user id is required.");
  if (!TEAM_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }
  await updateDoc(doc(teamsCol(), teamId), {
    [`members.${uid}`]: role,
    memberUids: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
}

export async function removeTeamMember(
  teamId: string,
  targetUid: string,
): Promise<void> {
  const uid = targetUid.trim();
  if (!uid) throw new Error("A user id is required.");
  const team = await getTeam(teamId);
  if (!team) throw new Error("Team not found.");
  if (!(uid in team.members)) return;
  const adminCount = Object.values(team.members).filter(
    (r) => r === "admin",
  ).length;
  if (team.members[uid] === "admin" && adminCount <= 1) {
    throw new Error("Cannot remove the only admin of this team.");
  }
  await updateDoc(doc(teamsCol(), teamId), {
    [`members.${uid}`]: deleteField(),
    memberUids: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

/** Create a Game linked to a team. Caller must be admin or coach. */
export async function createTeamGame(
  uid: string,
  teamId: string,
  data: CreateTeamGameInput,
): Promise<string> {
  const team = await getTeam(teamId);
  if (!team) throw new Error("Team not found.");
  if (!canCoachTeam(team, uid)) {
    throw new Error("Only team admins and coaches can create games.");
  }
  return createGame(uid, {
    ...data,
    teamId,
    ...(team.clubId ? { clubId: team.clubId } : {}),
  });
}

/** Games for a team the user can access. */
export async function listTeamGames(
  uid: string,
  teamId: string,
): Promise<Game[]> {
  const team = await getTeam(teamId);
  if (!team || !canViewTeam(team, uid)) return [];
  return listGamesForTeam(teamId);
}

function parsePlayer(id: string, raw: Record<string, unknown>): Player {
  const parentUidsRaw = Array.isArray(raw.parentUids) ? raw.parentUids : [];
  const parentUids = parentUidsRaw.filter(
    (u): u is string => typeof u === "string" && u.trim() !== "",
  );
  return {
    id,
    name: typeof raw.name === "string" ? raw.name.trim() || "Player" : "Player",
    ...(trimOrUndef(raw.jerseyNumber)
      ? { jerseyNumber: (raw.jerseyNumber as string).trim() }
      : {}),
    ...(trimOrUndef(raw.position)
      ? { position: (raw.position as string).trim() }
      : {}),
    ...(trimOrUndef(raw.linkedUid)
      ? { linkedUid: (raw.linkedUid as string).trim() }
      : {}),
    ...(parentUids.length > 0 ? { parentUids } : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

/** Stable roster key for duplicate detection (name + jersey number). */
export function playerRosterKey(name: string, jerseyNumber?: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  const j = (jerseyNumber ?? "").trim().toLowerCase();
  return `${n}|${j}`;
}

export function indexPlayersByRosterKey(
  players: Player[],
): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const p of players) {
    map.set(playerRosterKey(p.name, p.jerseyNumber), p);
  }
  return map;
}

export async function listTeamPlayers(teamId: string): Promise<Player[]> {
  const snap = await getDocs(playersCol(teamId));
  const out: Player[] = [];
  snap.forEach((d) =>
    out.push(parsePlayer(d.id, d.data() as Record<string, unknown>)),
  );
  out.sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      (a.jerseyNumber ?? "").localeCompare(b.jerseyNumber ?? ""),
  );
  return out;
}

export async function getTeamPlayer(
  teamId: string,
  playerId: string,
): Promise<Player | null> {
  const snap = await getDoc(doc(playersCol(teamId), playerId));
  if (!snap.exists()) return null;
  return parsePlayer(snap.id, snap.data() as Record<string, unknown>);
}

export async function upsertTeamPlayer(
  teamId: string,
  input: PlayerInput,
  existingByKey?: Map<string, Player>,
): Promise<{ player: Player; created: boolean }> {
  const name = input.name.trim();
  if (!name) throw new Error("Player name is required.");
  const jerseyNumber = trimOrUndef(input.jerseyNumber);
  const key = playerRosterKey(name, jerseyNumber);
  const existing = existingByKey?.get(key);
  const ref = existing
    ? doc(playersCol(teamId), existing.id)
    : doc(playersCol(teamId));
  const now = serverTimestamp();
  const payload = {
    name,
    ...(jerseyNumber ? { jerseyNumber } : {}),
    ...(trimOrUndef(input.position) ? { position: input.position!.trim() } : {}),
    ...(trimOrUndef(input.linkedUid) ? { linkedUid: input.linkedUid!.trim() } : {}),
    updatedAt: now,
    ...(!existing ? { createdAt: now } : {}),
  };
  await setDoc(ref, payload, { merge: true });
  return {
    player: {
      id: ref.id,
      name,
      ...(jerseyNumber ? { jerseyNumber } : {}),
      ...(trimOrUndef(input.position) ? { position: input.position!.trim() } : {}),
      ...(trimOrUndef(input.linkedUid) ? { linkedUid: input.linkedUid!.trim() } : {}),
    },
    created: !existing,
  };
}

export async function addParentUidToPlayer(
  teamId: string,
  playerId: string,
  parentUid: string,
): Promise<void> {
  const uid = parentUid.trim();
  if (!uid) throw new Error("Parent uid is required.");
  await updateDoc(doc(playersCol(teamId), playerId), {
    parentUids: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
}

export async function removeParentUidFromPlayer(
  teamId: string,
  playerId: string,
  parentUid: string,
): Promise<void> {
  const uid = parentUid.trim();
  if (!uid) return;
  await updateDoc(doc(playersCol(teamId), playerId), {
    parentUids: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}
