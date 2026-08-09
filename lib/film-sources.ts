import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export type FilmOrganizeKind = "game" | "practice" | "other";

export type FilmSourceStatus = "ready" | "analyzing" | "published" | "error";

export type UserDrivePublic = {
  connectedByUid: string;
  rootFolderId: string;
  inboxFolderId: string;
  connectedAt: string;
  accountEmail?: string;
};

export type FilmSource = {
  id: string;
  ownerUid: string;
  label: string;
  organizeKind: FilmOrganizeKind;
  status: FilmSourceStatus;
  driveFileId: string;
  angleSlot?: string;
  url?: string;
  marksImported?: number;
  recordedStartTime?: string;
  durationSec?: number;
  clubId?: string;
  teamId?: string;
  gameId?: string;
  playerId?: string;
  seasonId?: string;
  reviewGameId?: string;
  createdAt: Timestamp | null;
};

function filmSourcesCol(uid: string) {
  return collection(firestore, "users", uid, "filmSources");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

export function parseFilmSource(
  id: string,
  raw: Record<string, unknown>,
): FilmSource {
  const organizeKind: FilmOrganizeKind =
    raw.organizeKind === "game" ||
    raw.organizeKind === "practice" ||
    raw.organizeKind === "other"
      ? raw.organizeKind
      : "other";
  const status: FilmSourceStatus =
    raw.status === "analyzing" ||
    raw.status === "published" ||
    raw.status === "error" ||
    raw.status === "ready"
      ? raw.status
      : "ready";
  return {
    id,
    ownerUid:
      typeof raw.ownerUid === "string" ? raw.ownerUid : "",
    label:
      typeof raw.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : id,
    organizeKind,
    status,
    driveFileId:
      typeof raw.driveFileId === "string" ? raw.driveFileId : "",
    ...(trimOrUndef(raw.angleSlot) ? { angleSlot: String(raw.angleSlot) } : {}),
    ...(trimOrUndef(raw.url) ? { url: String(raw.url) } : {}),
    ...(typeof raw.marksImported === "number"
      ? { marksImported: raw.marksImported }
      : {}),
    ...(trimOrUndef(raw.recordedStartTime)
      ? { recordedStartTime: String(raw.recordedStartTime) }
      : {}),
    ...(typeof raw.durationSec === "number"
      ? { durationSec: raw.durationSec }
      : {}),
    ...(trimOrUndef(raw.clubId) ? { clubId: String(raw.clubId) } : {}),
    ...(trimOrUndef(raw.teamId) ? { teamId: String(raw.teamId) } : {}),
    ...(trimOrUndef(raw.gameId) ? { gameId: String(raw.gameId) } : {}),
    ...(trimOrUndef(raw.playerId) ? { playerId: String(raw.playerId) } : {}),
    ...(trimOrUndef(raw.seasonId) ? { seasonId: String(raw.seasonId) } : {}),
    ...(trimOrUndef(raw.reviewGameId)
      ? { reviewGameId: String(raw.reviewGameId) }
      : {}),
    createdAt:
      raw.createdAt && typeof raw.createdAt === "object"
        ? (raw.createdAt as Timestamp)
        : null,
  };
}

export async function getUserDrivePublic(
  uid: string,
): Promise<UserDrivePublic | null> {
  const snap = await getDoc(doc(firestore, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data() ?? {};
  const drive =
    data.drive && typeof data.drive === "object"
      ? (data.drive as Record<string, unknown>)
      : null;
  if (!drive) return null;
  const rootFolderId = trimOrUndef(drive.rootFolderId);
  if (!rootFolderId) return null;
  return {
    connectedByUid: trimOrUndef(drive.connectedByUid) ?? uid,
    rootFolderId,
    inboxFolderId: trimOrUndef(drive.inboxFolderId) ?? rootFolderId,
    connectedAt: trimOrUndef(drive.connectedAt) ?? new Date(0).toISOString(),
    ...(trimOrUndef(drive.accountEmail)
      ? { accountEmail: String(drive.accountEmail) }
      : {}),
  };
}

export async function listMyFilmSources(
  uid: string,
  max = 40,
): Promise<FilmSource[]> {
  const q = query(
    filmSourcesCol(uid),
    orderBy("createdAt", "desc"),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    parseFilmSource(d.id, d.data() as Record<string, unknown>),
  );
}

export async function updateFilmSourceOrganize(
  uid: string,
  sourceId: string,
  patch: {
    organizeKind?: FilmOrganizeKind;
    label?: string;
    clubId?: string | null;
    teamId?: string | null;
    gameId?: string | null;
    playerId?: string | null;
    seasonId?: string | null;
  },
): Promise<void> {
  const ref = doc(firestore, "users", uid, "filmSources", sourceId);
  const data: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (patch.organizeKind) data.organizeKind = patch.organizeKind;
  if (typeof patch.label === "string" && patch.label.trim()) {
    data.label = patch.label.trim();
  }
  for (const key of [
    "clubId",
    "teamId",
    "gameId",
    "playerId",
    "seasonId",
  ] as const) {
    if (patch[key] === null) data[key] = null;
    else if (typeof patch[key] === "string" && patch[key]!.trim()) {
      data[key] = patch[key]!.trim();
    }
  }
  await updateDoc(ref, data);
}

export async function setFilmSourceReviewGame(
  uid: string,
  sourceId: string,
  reviewGameId: string,
): Promise<void> {
  await updateDoc(doc(firestore, "users", uid, "filmSources", sourceId), {
    reviewGameId,
    updatedAt: serverTimestamp(),
  });
}
