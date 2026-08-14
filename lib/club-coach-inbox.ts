import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
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
  isClubCoach,
  isClubMember,
  isClubParent,
} from "@/lib/clubs";
import type { FilmSource } from "@/lib/film-sources";
import { updateFilmSourceOrganize } from "@/lib/film-sources";
import { formatGameCapMogoDisplayName } from "@/lib/youtube/mogo-match";

/**
 * Club coach inbox — parents drop film here; coaches/admins view and
 * optionally organize onto a team game. Unorganized items stay usable.
 *
 * Layout: clubs/{clubId}/coachInbox/{itemId}
 */

export type ClubCoachInboxStatus = "open" | "organized" | "dismissed";

export type ClubCoachInboxItem = {
  id: string;
  clubId: string;
  sharedByUid: string;
  sharedByLabel?: string;
  label: string;
  kind: "youtube" | "upload";
  youtubeVideoId?: string;
  driveFileId?: string;
  url?: string;
  angleSlot?: string;
  durationSec?: number;
  recordedStartTime?: string;
  filmSourceId?: string;
  status: ClubCoachInboxStatus;
  teamId?: string;
  gameId?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

function inboxCol(clubId: string) {
  return collection(firestore, "clubs", clubId, "coachInbox");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function parseItem(
  clubId: string,
  id: string,
  raw: Record<string, unknown>,
): ClubCoachInboxItem {
  const status: ClubCoachInboxStatus =
    raw.status === "organized" ||
    raw.status === "dismissed" ||
    raw.status === "open"
      ? raw.status
      : "open";
  return {
    id,
    clubId,
    sharedByUid: typeof raw.sharedByUid === "string" ? raw.sharedByUid : "",
    label:
      typeof raw.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : id,
    kind: raw.kind === "upload" ? "upload" : "youtube",
    status,
    ...(trimOrUndef(raw.sharedByLabel)
      ? { sharedByLabel: String(raw.sharedByLabel) }
      : {}),
    ...(trimOrUndef(raw.youtubeVideoId)
      ? { youtubeVideoId: String(raw.youtubeVideoId) }
      : {}),
    ...(trimOrUndef(raw.driveFileId)
      ? { driveFileId: String(raw.driveFileId) }
      : {}),
    ...(trimOrUndef(raw.url) ? { url: String(raw.url) } : {}),
    ...(trimOrUndef(raw.angleSlot) ? { angleSlot: String(raw.angleSlot) } : {}),
    ...(typeof raw.durationSec === "number"
      ? { durationSec: raw.durationSec }
      : {}),
    ...(trimOrUndef(raw.recordedStartTime)
      ? { recordedStartTime: String(raw.recordedStartTime) }
      : {}),
    ...(trimOrUndef(raw.filmSourceId)
      ? { filmSourceId: String(raw.filmSourceId) }
      : {}),
    ...(trimOrUndef(raw.teamId) ? { teamId: String(raw.teamId) } : {}),
    ...(trimOrUndef(raw.gameId) ? { gameId: String(raw.gameId) } : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

export function canShareToClubCoachInbox(
  club: Awaited<ReturnType<typeof getClub>>,
  uid: string,
): boolean {
  if (!club || !uid) return false;
  return (
    isClubMember(club, uid) &&
    (isClubParent(club, uid) || isClubCoach(club, uid) || canManageClub(club, uid))
  );
}

export function canManageClubCoachInbox(
  club: Awaited<ReturnType<typeof getClub>>,
  uid: string,
): boolean {
  if (!club || !uid) return false;
  return canManageClub(club, uid) || isClubCoach(club, uid);
}

/** Parent (or club member) shares a My Film item into the club coach inbox. */
export async function shareFilmWithClubCoaches(opts: {
  clubId: string;
  source: FilmSource;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  await user.getIdToken(true);

  const club = await getClub(opts.clubId);
  if (!club) throw new Error("Club not found.");
  if (!canShareToClubCoachInbox(club, user.uid)) {
    throw new Error("Join this club before sharing with coaches.");
  }

  const source = opts.source;
  const ytId = source.youtubeVideoId || source.videoId;
  const isYoutube = source.kind === "youtube" || Boolean(ytId);
  if (!isYoutube && !source.driveFileId) {
    throw new Error("This item has no playable source.");
  }

  const label =
    formatGameCapMogoDisplayName(source.label) || source.label || "Film";
  const ref = doc(inboxCol(opts.clubId));
  const now = serverTimestamp();
  const sharedByLabel =
    trimOrUndef(user.displayName) || trimOrUndef(user.email) || undefined;

  const payload: Record<string, unknown> = {
    sharedByUid: user.uid,
    label,
    kind: isYoutube ? "youtube" : "upload",
    status: "open",
    filmSourceId: source.id,
    createdAt: now,
    updatedAt: now,
    ...(sharedByLabel ? { sharedByLabel } : {}),
    ...(isYoutube && ytId ? { youtubeVideoId: ytId } : {}),
    ...(!isYoutube && source.driveFileId
      ? { driveFileId: source.driveFileId }
      : {}),
    ...(trimOrUndef(source.url) ? { url: source.url } : {}),
    ...(trimOrUndef(source.angleSlot) ? { angleSlot: source.angleSlot } : {}),
    ...(typeof source.durationSec === "number"
      ? { durationSec: source.durationSec }
      : {}),
    ...(trimOrUndef(source.recordedStartTime)
      ? { recordedStartTime: source.recordedStartTime }
      : {}),
  };

  try {
    await setDoc(ref, payload);
    await updateFilmSourceOrganize(user.uid, source.id, {
      clubId: opts.clubId,
      teamId: null,
      gameId: null,
    });
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not share with coaches.");
  }
  return ref.id;
}

export async function listClubCoachInbox(
  clubId: string,
  opts?: { includeDismissed?: boolean; max?: number },
): Promise<ClubCoachInboxItem[]> {
  const max = opts?.max ?? 60;
  const q = query(inboxCol(clubId), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  const out = snap.docs.map((d) =>
    parseItem(clubId, d.id, d.data() as Record<string, unknown>),
  );
  if (opts?.includeDismissed) return out;
  return out.filter((i) => i.status !== "dismissed");
}

export async function listOpenClubCoachInbox(
  clubId: string,
): Promise<ClubCoachInboxItem[]> {
  const q = query(
    inboxCol(clubId),
    where("status", "==", "open"),
    orderBy("createdAt", "desc"),
    limit(40),
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) =>
      parseItem(clubId, d.id, d.data() as Record<string, unknown>),
    );
  } catch {
    // Composite index may be missing — fall back to full list filter.
    const all = await listClubCoachInbox(clubId);
    return all.filter((i) => i.status === "open");
  }
}

export async function dismissClubCoachInboxItem(
  clubId: string,
  itemId: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  await user.getIdToken(true);
  try {
    await updateDoc(doc(inboxCol(clubId), itemId), {
      status: "dismissed",
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not dismiss item.");
  }
}

/** Mark inbox item organized onto a team game (optional coach step). */
export async function markClubCoachInboxOrganized(opts: {
  clubId: string;
  itemId: string;
  teamId: string;
  gameId: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  await user.getIdToken(true);
  try {
    await updateDoc(doc(inboxCol(opts.clubId), opts.itemId), {
      status: "organized",
      teamId: opts.teamId,
      gameId: opts.gameId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not mark organized.");
  }
}
