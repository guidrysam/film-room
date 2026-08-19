import {
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
  canManageClub,
  getClub,
  isClubMember,
  updateClubMember,
  type Club,
} from "@/lib/clubs";

/**
 * Join requests for discoverable clubs (parent or coach).
 * Layout: clubJoinRequests/{requestId}
 */

export type ClubJoinRequestStatus = "pending" | "approved" | "declined";

export type ClubJoinRequestRole = "club_parent" | "club_coach";

export type ClubJoinRequest = {
  id: string;
  clubId: string;
  clubName: string;
  uid: string;
  displayName?: string;
  email?: string;
  role: ClubJoinRequestRole;
  status: ClubJoinRequestStatus;
  message?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  resolvedBy?: string;
  resolvedAt: Timestamp | null;
};

function requestsCol() {
  return collection(firestore, "clubJoinRequests");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function parseRequest(
  id: string,
  raw: Record<string, unknown>,
): ClubJoinRequest {
  const status: ClubJoinRequestStatus =
    raw.status === "approved" ||
    raw.status === "declined" ||
    raw.status === "pending"
      ? raw.status
      : "pending";
  return {
    id,
    clubId: typeof raw.clubId === "string" ? raw.clubId : "",
    clubName: typeof raw.clubName === "string" ? raw.clubName : "Club",
    uid: typeof raw.uid === "string" ? raw.uid : "",
    role: raw.role === "club_coach" ? "club_coach" : "club_parent",
    status,
    ...(trimOrUndef(raw.displayName)
      ? { displayName: String(raw.displayName) }
      : {}),
    ...(trimOrUndef(raw.email) ? { email: String(raw.email) } : {}),
    ...(trimOrUndef(raw.message) ? { message: String(raw.message) } : {}),
    ...(trimOrUndef(raw.resolvedBy)
      ? { resolvedBy: String(raw.resolvedBy) }
      : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
    resolvedAt: raw.resolvedAt instanceof Timestamp ? raw.resolvedAt : null,
  };
}

/** Ask to join a discoverable club as a parent or coach. */
export async function requestClubJoin(opts: {
  clubId: string;
  role?: ClubJoinRequestRole;
  message?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  await user.getIdToken(true);

  const club = await getClub(opts.clubId);
  if (!club) throw new Error("Club not found.");
  if (!club.discoverable) {
    throw new Error("This club is not open for join requests. Ask for an invite link.");
  }
  if (isClubMember(club, user.uid)) {
    throw new Error("You’re already in this club.");
  }

  const existing = await listMyPendingClubJoinRequests(user.uid);
  if (existing.some((r) => r.clubId === opts.clubId)) {
    throw new Error("You already have a pending request for this club.");
  }

  const ref = doc(requestsCol());
  const now = serverTimestamp();
  const payload = {
    clubId: opts.clubId,
    clubName: club.name,
    uid: user.uid,
    role: opts.role === "club_coach" ? "club_coach" : "club_parent",
    status: "pending" as const,
    createdAt: now,
    updatedAt: now,
    ...(trimOrUndef(user.displayName)
      ? { displayName: user.displayName!.trim() }
      : {}),
    ...(trimOrUndef(user.email) ? { email: user.email!.trim() } : {}),
    ...(trimOrUndef(opts.message) ? { message: opts.message!.trim() } : {}),
  };

  try {
    await setDoc(ref, payload);
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not send join request.");
  }
  return ref.id;
}

export async function listMyPendingClubJoinRequests(
  uid: string,
): Promise<ClubJoinRequest[]> {
  const q = query(
    requestsCol(),
    where("uid", "==", uid),
    where("status", "==", "pending"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    parseRequest(d.id, d.data() as Record<string, unknown>),
  );
}

export async function listPendingClubJoinRequests(
  clubId: string,
): Promise<ClubJoinRequest[]> {
  const q = query(
    requestsCol(),
    where("clubId", "==", clubId),
    where("status", "==", "pending"),
  );
  const snap = await getDocs(q);
  const out = snap.docs.map((d) =>
    parseRequest(d.id, d.data() as Record<string, unknown>),
  );
  out.sort(
    (a, b) =>
      (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  );
  return out;
}

export async function approveClubJoinRequest(
  requestId: string,
  adminUid: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  await user.getIdToken(true);

  const snap = await getDoc(doc(requestsCol(), requestId));
  if (!snap.exists()) throw new Error("Request not found.");
  const req = parseRequest(snap.id, snap.data() as Record<string, unknown>);
  if (req.status !== "pending") throw new Error("That request was already handled.");

  const club = await getClub(req.clubId);
  if (!club) throw new Error("Club not found.");
  if (!canManageClub(club, adminUid)) {
    throw new Error("Only club admins can approve join requests.");
  }

  if (!isClubMember(club, req.uid)) {
    await updateClubMember(req.clubId, req.uid, req.role);
  }

  try {
    await updateDoc(doc(requestsCol(), requestId), {
      status: "approved",
      resolvedBy: adminUid,
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not approve request.");
  }
}

export async function declineClubJoinRequest(
  requestId: string,
  adminUid: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  await user.getIdToken(true);

  const snap = await getDoc(doc(requestsCol(), requestId));
  if (!snap.exists()) throw new Error("Request not found.");
  const req = parseRequest(snap.id, snap.data() as Record<string, unknown>);
  if (req.status !== "pending") throw new Error("That request was already handled.");

  const club = await getClub(req.clubId);
  if (!club) throw new Error("Club not found.");
  if (!canManageClub(club, adminUid)) {
    throw new Error("Only club admins can decline join requests.");
  }

  try {
    await updateDoc(doc(requestsCol(), requestId), {
      status: "declined",
      resolvedBy: adminUid,
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not decline request.");
  }
}

export type DiscoverableClubHit = Pick<
  Club,
  "id" | "name" | "sport" | "logoUrl" | "discoverable"
>;
