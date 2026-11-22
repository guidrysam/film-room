/**
 * Server-side My Film share invites (Admin SDK + Resend).
 */

import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  isEmailSendingConfigured,
  sendEmailViaResend,
} from "@/lib/email/resend";
import { adminFirestore } from "@/lib/firebase-admin";
import {
  normalizeInviteEmail,
  isValidInviteEmail,
  filmShareJoinPath,
} from "@/lib/film-share-invites";

const INVITE_EXPIRES_DAYS = 60;

function randomInviteCode(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function appOriginFromRequest(request: Request): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const origin = request.headers.get("origin")?.trim();
  if (origin) return origin.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function youtubeIdFromFilmDoc(data: Record<string, unknown>): string | null {
  const id = (
    (typeof data.youtubeVideoId === "string" && data.youtubeVideoId) ||
    (typeof data.videoId === "string" && data.videoId) ||
    ""
  ).trim();
  return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}

/** Copy owner YouTube filmSources into coach library; skip duplicates. */
export async function importOwnerFilmIntoCoachLibrary(opts: {
  ownerUid: string;
  coachUid: string;
}): Promise<{ imported: number; skipped: number }> {
  const ownerCol = adminFirestore
    .collection("users")
    .doc(opts.ownerUid)
    .collection("filmSources");
  const coachCol = adminFirestore
    .collection("users")
    .doc(opts.coachUid)
    .collection("filmSources");

  const [ownerSnap, coachSnap] = await Promise.all([
    ownerCol.get(),
    coachCol.get(),
  ]);

  const existingSharedIds = new Set<string>();
  const existingYtFromOwner = new Set<string>();
  for (const d of coachSnap.docs) {
    const data = d.data() ?? {};
    if (
      typeof data.sharedFromUid === "string" &&
      data.sharedFromUid === opts.ownerUid
    ) {
      if (typeof data.sharedFromSourceId === "string") {
        existingSharedIds.add(data.sharedFromSourceId);
      }
      const yt = youtubeIdFromFilmDoc(data);
      if (yt) existingYtFromOwner.add(yt);
    }
  }

  let imported = 0;
  let skipped = 0;

  for (const d of ownerSnap.docs) {
    const data = d.data() ?? {};
    if (data.status === "dismissed") {
      skipped += 1;
      continue;
    }
    const yt = youtubeIdFromFilmDoc(data);
    if (!yt) {
      skipped += 1;
      continue;
    }
    if (existingSharedIds.has(d.id) || existingYtFromOwner.has(yt)) {
      skipped += 1;
      continue;
    }

    const ref = coachCol.doc();
    const label =
      typeof data.label === "string" && data.label.trim()
        ? data.label.trim()
        : yt;
    await ref.set({
      id: ref.id,
      ownerUid: opts.coachUid,
      kind: "youtube",
      label,
      organizeKind:
        data.organizeKind === "game" ||
        data.organizeKind === "practice" ||
        data.organizeKind === "other"
          ? data.organizeKind
          : "game",
      status: "ready",
      workQueue: true,
      videoId: yt,
      youtubeVideoId: yt,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(yt)}`,
      source: "film_share_import",
      sharedFromUid: opts.ownerUid,
      sharedFromSourceId: d.id,
      sharedAt: FieldValue.serverTimestamp(),
      ...(typeof data.thumbnailUrl === "string" && data.thumbnailUrl.trim()
        ? { thumbnailUrl: data.thumbnailUrl.trim() }
        : {}),
      ...(typeof data.durationSec === "number" &&
      Number.isFinite(data.durationSec) &&
      data.durationSec > 0
        ? { durationSec: data.durationSec }
        : {}),
      ...(data.captureDevice === "mogo" || data.captureDevice === "tripod"
        ? { captureDevice: data.captureDevice }
        : {}),
      ...(data.filmKind === "highlight" || data.filmKind === "full"
        ? { filmKind: data.filmKind }
        : {}),
      ...(typeof data.publishedAt === "string" && data.publishedAt.trim()
        ? { publishedAt: data.publishedAt.trim() }
        : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    existingSharedIds.add(d.id);
    existingYtFromOwner.add(yt);
    imported += 1;
  }

  return { imported, skipped };
}

export type CreateFilmShareInviteResult = {
  code: string;
  joinUrl: string;
  emailSent: boolean;
  emailError?: string;
};

export async function createAndSendFilmShareInvite(opts: {
  request: Request;
  ownerUid: string;
  ownerLabel: string;
  inviteeEmail: string;
}): Promise<CreateFilmShareInviteResult> {
  const email = normalizeInviteEmail(opts.inviteeEmail);
  if (!isValidInviteEmail(email)) {
    throw new Error("INVALID_EMAIL");
  }

  const code = randomInviteCode();
  const expiresAt = Timestamp.fromMillis(
    Date.now() + INVITE_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  );
  await adminFirestore.collection("filmShareInvites").doc(code).set({
    code,
    ownerUid: opts.ownerUid,
    ownerLabel: opts.ownerLabel.trim() || "Film Room",
    inviteeEmail: email,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  const origin = appOriginFromRequest(opts.request);
  const joinUrl = `${origin}${filmShareJoinPath(code)}`;

  if (!isEmailSendingConfigured()) {
    return {
      code,
      joinUrl,
      emailSent: false,
      emailError:
        "Email sending is not configured. Copy the link and send it yourself.",
    };
  }

  const ownerName = opts.ownerLabel.trim() || "Someone";
  const subject = `${ownerName} shared their Film Room library with you`;
  const text = [
    `${ownerName} invited you to access their film library in Film Room.`,
    "",
    "Accept the invite (sign in with this email):",
    joinUrl,
    "",
    "Clips will appear in your Film Room so you can build reels and study film.",
    "This invite expires in 60 days.",
  ].join("\n");
  const html = `
    <p><strong>${escapeHtml(ownerName)}</strong> invited you to access their film library in Film Room.</p>
    <p><a href="${escapeHtml(joinUrl)}">Accept invite</a> — sign in with <strong>${escapeHtml(email)}</strong>.</p>
    <p>Clips will appear in your Film Room so you can build reels and study film.</p>
    <p style="color:#666;font-size:12px">This invite expires in 60 days.</p>
  `;

  const sent = await sendEmailViaResend({
    to: email,
    subject,
    text,
    html,
  });

  if (!sent.ok) {
    return {
      code,
      joinUrl,
      emailSent: false,
      emailError: sent.error,
    };
  }

  return { code, joinUrl, emailSent: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function acceptFilmShareInvite(opts: {
  code: string;
  coachUid: string;
  coachEmail: string;
}): Promise<{
  ownerUid: string;
  ownerLabel: string;
  imported: number;
  skipped: number;
}> {
  const code = opts.code.trim();
  if (!code) throw new Error("INVALID_INVITE");

  const coachEmail = normalizeInviteEmail(opts.coachEmail);
  if (!coachEmail) throw new Error("EMAIL_REQUIRED");

  const ref = adminFirestore.collection("filmShareInvites").doc(code);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("INVALID_INVITE");
  const data = snap.data() ?? {};

  if (data.status === "revoked") throw new Error("INVITE_REVOKED");
  if (data.status === "accepted" && data.acceptedByUid === opts.coachUid) {
    // Idempotent re-accept: sync imports.
    const ownerUid = String(data.ownerUid ?? "");
    const ownerLabel =
      typeof data.ownerLabel === "string" && data.ownerLabel.trim()
        ? data.ownerLabel.trim()
        : "Shared film";
    const { imported, skipped } = await importOwnerFilmIntoCoachLibrary({
      ownerUid,
      coachUid: opts.coachUid,
    });
    return { ownerUid, ownerLabel, imported, skipped };
  }
  if (data.status !== "pending" && data.status !== "accepted") {
    throw new Error("INVALID_INVITE");
  }

  const inviteeEmail = normalizeInviteEmail(String(data.inviteeEmail ?? ""));
  if (inviteeEmail !== coachEmail) throw new Error("EMAIL_MISMATCH");

  const expiresAt = data.expiresAt;
  if (
    expiresAt &&
    typeof expiresAt.toMillis === "function" &&
    expiresAt.toMillis() <= Date.now()
  ) {
    throw new Error("INVITE_EXPIRED");
  }

  const ownerUid = String(data.ownerUid ?? "").trim();
  if (!ownerUid) throw new Error("INVALID_INVITE");
  if (ownerUid === opts.coachUid) throw new Error("CANNOT_SHARE_SELF");

  const ownerLabel =
    typeof data.ownerLabel === "string" && data.ownerLabel.trim()
      ? data.ownerLabel.trim()
      : "Shared film";

  const batch = adminFirestore.batch();
  batch.set(
    adminFirestore
      .collection("users")
      .doc(ownerUid)
      .collection("filmShares")
      .doc(opts.coachUid),
    {
      coachUid: opts.coachUid,
      coachEmail,
      inviteCode: code,
      createdAt: FieldValue.serverTimestamp(),
    },
  );
  batch.set(
    adminFirestore
      .collection("users")
      .doc(opts.coachUid)
      .collection("filmSharesReceived")
      .doc(ownerUid),
    {
      ownerUid,
      ownerLabel,
      inviteCode: code,
      createdAt: FieldValue.serverTimestamp(),
    },
  );
  batch.update(ref, {
    status: "accepted",
    acceptedByUid: opts.coachUid,
    acceptedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  const { imported, skipped } = await importOwnerFilmIntoCoachLibrary({
    ownerUid,
    coachUid: opts.coachUid,
  });

  return { ownerUid, ownerLabel, imported, skipped };
}

export async function revokeFilmShareGrant(opts: {
  ownerUid: string;
  coachUid: string;
}): Promise<void> {
  const grantRef = adminFirestore
    .collection("users")
    .doc(opts.ownerUid)
    .collection("filmShares")
    .doc(opts.coachUid);
  const grantSnap = await grantRef.get();
  if (!grantSnap.exists) throw new Error("GRANT_NOT_FOUND");
  const inviteCode =
    typeof grantSnap.data()?.inviteCode === "string"
      ? String(grantSnap.data()?.inviteCode).trim()
      : "";

  const batch = adminFirestore.batch();
  batch.delete(grantRef);
  batch.delete(
    adminFirestore
      .collection("users")
      .doc(opts.coachUid)
      .collection("filmSharesReceived")
      .doc(opts.ownerUid),
  );
  if (inviteCode) {
    const invRef = adminFirestore.collection("filmShareInvites").doc(inviteCode);
    batch.set(
      invRef,
      {
        status: "revoked",
        revokedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
}

export async function revokePendingFilmShareInvite(opts: {
  ownerUid: string;
  code: string;
}): Promise<void> {
  const ref = adminFirestore.collection("filmShareInvites").doc(opts.code.trim());
  const snap = await ref.get();
  if (!snap.exists) throw new Error("INVALID_INVITE");
  const data = snap.data() ?? {};
  if (data.ownerUid !== opts.ownerUid) throw new Error("ACCESS_DENIED");
  if (data.status !== "pending") throw new Error("NOT_PENDING");
  await ref.update({
    status: "revoked",
    revokedAt: FieldValue.serverTimestamp(),
  });
}

export async function syncFilmShareFromOwner(opts: {
  coachUid: string;
  ownerUid: string;
}): Promise<{ imported: number; skipped: number }> {
  const grant = await adminFirestore
    .collection("users")
    .doc(opts.ownerUid)
    .collection("filmShares")
    .doc(opts.coachUid)
    .get();
  if (!grant.exists) throw new Error("GRANT_NOT_FOUND");
  return importOwnerFilmIntoCoachLibrary(opts);
}
