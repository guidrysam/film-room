import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { decryptSecret, encryptSecret } from "@/lib/drive/crypto";
import {
  ensureChildFolder,
  ensureTeamVaultRoot,
} from "@/lib/drive/folders";
import { gameFolderDisplayName } from "@/lib/drive/naming";
import {
  fetchDriveAccountEmail,
  refreshDriveAccessToken,
} from "@/lib/drive/oauth";

export type TeamDriveConfig = {
  connectedByUid: string;
  rootFolderId: string;
  connectedAt: string;
  accountEmail?: string;
};

function secretsRef(teamId: string) {
  return adminFirestore.collection("teams").doc(teamId).collection("secrets").doc("drive");
}

export async function saveTeamDriveRefreshToken(opts: {
  teamId: string;
  refreshToken: string;
  connectedByUid: string;
  rootFolderId: string;
  accountEmail?: string;
}): Promise<void> {
  const blob = encryptSecret(opts.refreshToken);
  const connectedAt = new Date().toISOString();
  await secretsRef(opts.teamId).set(
    {
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      tag: blob.tag,
      updatedAt: FieldValue.serverTimestamp(),
      connectedByUid: opts.connectedByUid,
    },
    { merge: true },
  );
  const drive: TeamDriveConfig = {
    connectedByUid: opts.connectedByUid,
    rootFolderId: opts.rootFolderId,
    connectedAt,
    ...(opts.accountEmail ? { accountEmail: opts.accountEmail } : {}),
  };
  await adminFirestore.collection("teams").doc(opts.teamId).set(
    {
      drive,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearTeamDriveConnection(teamId: string): Promise<void> {
  await secretsRef(teamId).delete().catch(() => undefined);
  await adminFirestore.collection("teams").doc(teamId).set(
    {
      drive: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadTeamDriveRefreshToken(
  teamId: string,
): Promise<string | null> {
  const snap = await secretsRef(teamId).get();
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

export async function getTeamVaultAccessToken(teamId: string): Promise<{
  accessToken: string;
  rootFolderId: string;
  accountEmail?: string;
}> {
  const teamSnap = await adminFirestore.collection("teams").doc(teamId).get();
  if (!teamSnap.exists) throw new Error("TEAM_NOT_FOUND");
  const team = teamSnap.data() ?? {};
  const drive =
    team.drive && typeof team.drive === "object"
      ? (team.drive as Record<string, unknown>)
      : null;
  const rootFolderId =
    typeof drive?.rootFolderId === "string" ? drive.rootFolderId.trim() : "";
  if (!rootFolderId) throw new Error("DRIVE_NOT_CONNECTED");

  const refreshToken = await loadTeamDriveRefreshToken(teamId);
  if (!refreshToken) throw new Error("DRIVE_NOT_CONNECTED");

  const tokens = await refreshDriveAccessToken(refreshToken);
  if (!tokens.access_token) throw new Error("DRIVE_TOKEN_REFRESH_FAILED");

  const accountEmail =
    typeof drive?.accountEmail === "string"
      ? drive.accountEmail.trim()
      : undefined;

  return {
    accessToken: tokens.access_token,
    rootFolderId,
    ...(accountEmail ? { accountEmail } : {}),
  };
}

export async function connectTeamDriveVault(opts: {
  teamId: string;
  uid: string;
  refreshToken: string;
  accessToken: string;
}): Promise<TeamDriveConfig> {
  const teamSnap = await adminFirestore.collection("teams").doc(opts.teamId).get();
  if (!teamSnap.exists) throw new Error("TEAM_NOT_FOUND");
  const team = teamSnap.data() ?? {};
  const teamName =
    typeof team.name === "string" && team.name.trim()
      ? team.name.trim()
      : "Team";

  const rootFolderId = await ensureTeamVaultRoot({
    accessToken: opts.accessToken,
    teamName,
  });
  const accountEmail = await fetchDriveAccountEmail(opts.accessToken);

  await saveTeamDriveRefreshToken({
    teamId: opts.teamId,
    refreshToken: opts.refreshToken,
    connectedByUid: opts.uid,
    rootFolderId,
    ...(accountEmail ? { accountEmail } : {}),
  });

  return {
    connectedByUid: opts.uid,
    rootFolderId,
    connectedAt: new Date().toISOString(),
    ...(accountEmail ? { accountEmail } : {}),
  };
}

export async function ensureGameDriveFolders(opts: {
  teamId: string;
  gameId: string;
}): Promise<{ driveFolderId: string; driveRawFolderId: string }> {
  const gameSnap = await adminFirestore.collection("games").doc(opts.gameId).get();
  if (!gameSnap.exists) throw new Error("GAME_NOT_FOUND");
  const game = gameSnap.data() ?? {};
  const gameTeamId =
    typeof game.teamId === "string" ? game.teamId.trim() : "";
  if (gameTeamId && gameTeamId !== opts.teamId) {
    throw new Error("GAME_TEAM_MISMATCH");
  }

  const existingFolder =
    typeof game.driveFolderId === "string" ? game.driveFolderId.trim() : "";
  const existingRaw =
    typeof game.driveRawFolderId === "string"
      ? game.driveRawFolderId.trim()
      : "";
  if (existingFolder && existingRaw) {
    return { driveFolderId: existingFolder, driveRawFolderId: existingRaw };
  }

  const { accessToken, rootFolderId } = await getTeamVaultAccessToken(
    opts.teamId,
  );
  const folderName = gameFolderDisplayName({
    id: opts.gameId,
    date: typeof game.date === "string" ? game.date : undefined,
    opponent: typeof game.opponent === "string" ? game.opponent : undefined,
    title: typeof game.title === "string" ? game.title : undefined,
  });

  const driveFolderId =
    existingFolder ||
    (await ensureChildFolder({
      accessToken,
      parentId: rootFolderId,
      name: folderName,
    }));
  const driveRawFolderId =
    existingRaw ||
    (await ensureChildFolder({
      accessToken,
      parentId: driveFolderId,
      name: "raw",
    }));

  await adminFirestore.collection("games").doc(opts.gameId).set(
    {
      driveFolderId,
      driveRawFolderId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { driveFolderId, driveRawFolderId };
}
