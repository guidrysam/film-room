import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { decryptSecret, encryptSecret } from "@/lib/drive/crypto";
import {
  ensureUserInboxFolder,
  ensureUserVaultRoot,
} from "@/lib/drive/folders";
import {
  fetchDriveAccountEmail,
  refreshDriveAccessToken,
} from "@/lib/drive/oauth";

export type UserDriveConfig = {
  connectedByUid: string;
  rootFolderId: string;
  inboxFolderId: string;
  connectedAt: string;
  accountEmail?: string;
};

function secretsRef(uid: string) {
  return adminFirestore
    .collection("users")
    .doc(uid)
    .collection("secrets")
    .doc("drive");
}

export async function saveUserDriveRefreshToken(opts: {
  uid: string;
  refreshToken: string;
  rootFolderId: string;
  inboxFolderId: string;
  accountEmail?: string;
}): Promise<void> {
  const blob = encryptSecret(opts.refreshToken);
  const connectedAt = new Date().toISOString();
  await secretsRef(opts.uid).set(
    {
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      tag: blob.tag,
      updatedAt: FieldValue.serverTimestamp(),
      connectedByUid: opts.uid,
    },
    { merge: true },
  );
  const drive: UserDriveConfig = {
    connectedByUid: opts.uid,
    rootFolderId: opts.rootFolderId,
    inboxFolderId: opts.inboxFolderId,
    connectedAt,
    ...(opts.accountEmail ? { accountEmail: opts.accountEmail } : {}),
  };
  await adminFirestore.collection("users").doc(opts.uid).set(
    {
      drive,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearUserDriveConnection(uid: string): Promise<void> {
  await secretsRef(uid).delete().catch(() => undefined);
  await adminFirestore.collection("users").doc(uid).set(
    {
      drive: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadUserDriveRefreshToken(
  uid: string,
): Promise<string | null> {
  const snap = await secretsRef(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  if (
    typeof data.ciphertext !== "string" ||
    typeof data.iv !== "string" ||
    typeof data.tag !== "string"
  ) {
    return null;
  }
  return decryptSecret({
    ciphertext: data.ciphertext,
    iv: data.iv,
    tag: data.tag,
  });
}

export async function getUserVaultAccessToken(uid: string): Promise<{
  accessToken: string;
  rootFolderId: string;
  inboxFolderId: string;
  accountEmail?: string;
}> {
  const userSnap = await adminFirestore.collection("users").doc(uid).get();
  const user = userSnap.data() ?? {};
  const drive =
    user.drive && typeof user.drive === "object"
      ? (user.drive as Record<string, unknown>)
      : null;
  const rootFolderId =
    typeof drive?.rootFolderId === "string" ? drive.rootFolderId.trim() : "";
  let inboxFolderId =
    typeof drive?.inboxFolderId === "string" ? drive.inboxFolderId.trim() : "";
  if (!rootFolderId) throw new Error("USER_DRIVE_NOT_CONNECTED");

  const refreshToken = await loadUserDriveRefreshToken(uid);
  if (!refreshToken) throw new Error("USER_DRIVE_NOT_CONNECTED");

  const tokens = await refreshDriveAccessToken(refreshToken);
  if (!tokens.access_token) throw new Error("DRIVE_TOKEN_REFRESH_FAILED");

  if (!inboxFolderId) {
    inboxFolderId = await ensureUserInboxFolder({
      accessToken: tokens.access_token,
      rootFolderId,
    });
    await adminFirestore.collection("users").doc(uid).set(
      {
        drive: {
          ...(drive ?? {}),
          inboxFolderId,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  const accountEmail =
    typeof drive?.accountEmail === "string"
      ? drive.accountEmail.trim()
      : undefined;

  return {
    accessToken: tokens.access_token,
    rootFolderId,
    inboxFolderId,
    ...(accountEmail ? { accountEmail } : {}),
  };
}

export async function connectUserDriveVault(opts: {
  uid: string;
  refreshToken: string;
  accessToken: string;
}): Promise<UserDriveConfig> {
  const rootFolderId = await ensureUserVaultRoot({
    accessToken: opts.accessToken,
  });
  const inboxFolderId = await ensureUserInboxFolder({
    accessToken: opts.accessToken,
    rootFolderId,
  });
  const accountEmail = await fetchDriveAccountEmail(opts.accessToken);

  await saveUserDriveRefreshToken({
    uid: opts.uid,
    refreshToken: opts.refreshToken,
    rootFolderId,
    inboxFolderId,
    ...(accountEmail ? { accountEmail } : {}),
  });

  return {
    connectedByUid: opts.uid,
    rootFolderId,
    inboxFolderId,
    connectedAt: new Date().toISOString(),
    ...(accountEmail ? { accountEmail } : {}),
  };
}

export async function readUserDrivePublicConfig(
  uid: string,
): Promise<UserDriveConfig | null> {
  const snap = await adminFirestore.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const drive =
    data.drive && typeof data.drive === "object"
      ? (data.drive as Record<string, unknown>)
      : null;
  if (!drive) return null;
  const rootFolderId =
    typeof drive.rootFolderId === "string" ? drive.rootFolderId.trim() : "";
  const inboxFolderId =
    typeof drive.inboxFolderId === "string" ? drive.inboxFolderId.trim() : "";
  if (!rootFolderId) return null;
  return {
    connectedByUid:
      typeof drive.connectedByUid === "string"
        ? drive.connectedByUid
        : uid,
    rootFolderId,
    inboxFolderId: inboxFolderId || rootFolderId,
    connectedAt:
      typeof drive.connectedAt === "string"
        ? drive.connectedAt
        : new Date(0).toISOString(),
    ...(typeof drive.accountEmail === "string"
      ? { accountEmail: drive.accountEmail }
      : {}),
  };
}
