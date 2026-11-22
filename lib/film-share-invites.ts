/**
 * Client helpers for My Film library share invites (email → ongoing access).
 */

import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export type FilmShareInviteStatus = "pending" | "accepted" | "revoked";

export type FilmShareInvite = {
  code: string;
  ownerUid: string;
  ownerLabel: string;
  inviteeEmail: string;
  status: FilmShareInviteStatus;
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null;
  acceptedByUid?: string;
};

export type FilmShareGrant = {
  coachUid: string;
  coachEmail: string;
  inviteCode: string;
  createdAt: Timestamp | null;
};

export type FilmShareReceived = {
  ownerUid: string;
  ownerLabel: string;
  inviteCode: string;
  createdAt: Timestamp | null;
};

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidInviteEmail(email: string): boolean {
  const e = normalizeInviteEmail(email);
  // Practical check — not full RFC.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function filmShareJoinPath(code: string): string {
  return `/join/film/${encodeURIComponent(code.trim())}`;
}

function parseStatus(raw: unknown): FilmShareInviteStatus {
  if (raw === "accepted" || raw === "revoked" || raw === "pending") return raw;
  return "pending";
}

export function parseFilmShareInvite(
  code: string,
  raw: Record<string, unknown>,
): FilmShareInvite | null {
  const ownerUid =
    typeof raw.ownerUid === "string" ? raw.ownerUid.trim() : "";
  const inviteeEmail =
    typeof raw.inviteeEmail === "string"
      ? normalizeInviteEmail(raw.inviteeEmail)
      : "";
  if (!ownerUid || !inviteeEmail) return null;
  return {
    code,
    ownerUid,
    ownerLabel:
      typeof raw.ownerLabel === "string" && raw.ownerLabel.trim()
        ? raw.ownerLabel.trim()
        : "Film Room",
    inviteeEmail,
    status: parseStatus(raw.status),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    expiresAt: raw.expiresAt instanceof Timestamp ? raw.expiresAt : null,
    ...(typeof raw.acceptedByUid === "string" && raw.acceptedByUid.trim()
      ? { acceptedByUid: raw.acceptedByUid.trim() }
      : {}),
  };
}

export function isFilmShareInviteExpired(invite: FilmShareInvite): boolean {
  if (!invite.expiresAt || typeof invite.expiresAt.toMillis !== "function") {
    return false;
  }
  return invite.expiresAt.toMillis() <= Date.now();
}

export async function getFilmShareInvite(
  code: string,
): Promise<FilmShareInvite | null> {
  const id = code.trim();
  if (!id) return null;
  const snap = await getDoc(doc(firestore, "filmShareInvites", id));
  if (!snap.exists()) return null;
  return parseFilmShareInvite(snap.id, snap.data() as Record<string, unknown>);
}

export async function listFilmSharesForOwner(
  ownerUid: string,
): Promise<FilmShareGrant[]> {
  const snap = await getDocs(
    collection(firestore, "users", ownerUid, "filmShares"),
  );
  const out: FilmShareGrant[] = [];
  for (const d of snap.docs) {
    const raw = d.data() as Record<string, unknown>;
    out.push({
      coachUid: d.id,
      coachEmail:
        typeof raw.coachEmail === "string"
          ? normalizeInviteEmail(raw.coachEmail)
          : "",
      inviteCode:
        typeof raw.inviteCode === "string" ? raw.inviteCode.trim() : "",
      createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    });
  }
  return out;
}

export async function listPendingFilmShareInvitesForOwner(
  ownerUid: string,
  max = 40,
): Promise<FilmShareInvite[]> {
  const q = query(
    collection(firestore, "filmShareInvites"),
    where("ownerUid", "==", ownerUid),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    limit(max),
  );
  try {
    const snap = await getDocs(q);
    return snap.docs
      .map((d) =>
        parseFilmShareInvite(d.id, d.data() as Record<string, unknown>),
      )
      .filter((x): x is FilmShareInvite => x != null);
  } catch {
    // Composite index may be missing — fall back to ownerUid-only.
    const snap = await getDocs(
      query(
        collection(firestore, "filmShareInvites"),
        where("ownerUid", "==", ownerUid),
        limit(max),
      ),
    );
    return snap.docs
      .map((d) =>
        parseFilmShareInvite(d.id, d.data() as Record<string, unknown>),
      )
      .filter((x): x is FilmShareInvite => x != null && x.status === "pending");
  }
}

export async function listFilmSharesReceived(
  coachUid: string,
): Promise<FilmShareReceived[]> {
  const snap = await getDocs(
    collection(firestore, "users", coachUid, "filmSharesReceived"),
  );
  const out: FilmShareReceived[] = [];
  for (const d of snap.docs) {
    const raw = d.data() as Record<string, unknown>;
    out.push({
      ownerUid: d.id,
      ownerLabel:
        typeof raw.ownerLabel === "string" && raw.ownerLabel.trim()
          ? raw.ownerLabel.trim()
          : "Shared film",
      inviteCode:
        typeof raw.inviteCode === "string" ? raw.inviteCode.trim() : "",
      createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    });
  }
  return out;
}
