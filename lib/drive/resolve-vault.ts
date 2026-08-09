import "server-only";

import { getTeamVaultAccessToken, ensureGameDriveFolders } from "@/lib/drive/team-vault";
import { getUserVaultAccessToken } from "@/lib/drive/user-vault";

export type ResolvedDriveVault = {
  accessToken: string;
  /** Folder to write uploads into. */
  uploadFolderId: string;
  /** Parent display folder id (My Film root or game folder). */
  driveFolderId: string;
  scope: "user" | "team";
  accountEmail?: string;
};

/**
 * Prefer the actor's personal My Film Drive. Fall back to team vault only when
 * personal Drive is not connected and the game has a team vault.
 */
export async function resolvePreferredDriveVault(opts: {
  uid: string;
  teamId?: string;
  gameId?: string;
}): Promise<ResolvedDriveVault> {
  try {
    const user = await getUserVaultAccessToken(opts.uid);
    return {
      accessToken: user.accessToken,
      uploadFolderId: user.inboxFolderId,
      driveFolderId: user.rootFolderId,
      scope: "user",
      ...(user.accountEmail ? { accountEmail: user.accountEmail } : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg !== "USER_DRIVE_NOT_CONNECTED") throw err;
  }

  if (opts.teamId && opts.gameId) {
    const folders = await ensureGameDriveFolders({
      teamId: opts.teamId,
      gameId: opts.gameId,
    });
    const team = await getTeamVaultAccessToken(opts.teamId);
    return {
      accessToken: team.accessToken,
      uploadFolderId: folders.driveRawFolderId,
      driveFolderId: folders.driveFolderId,
      scope: "team",
      ...(team.accountEmail ? { accountEmail: team.accountEmail } : {}),
    };
  }

  if (opts.teamId) {
    const team = await getTeamVaultAccessToken(opts.teamId);
    return {
      accessToken: team.accessToken,
      uploadFolderId: team.rootFolderId,
      driveFolderId: team.rootFolderId,
      scope: "team",
      ...(team.accountEmail ? { accountEmail: team.accountEmail } : {}),
    };
  }

  throw new Error("USER_DRIVE_NOT_CONNECTED");
}

/** Download token: try personal first, then team if provided. */
export async function resolveDriveDownloadToken(opts: {
  uid: string;
  teamId?: string;
}): Promise<{ accessToken: string; scope: "user" | "team" }> {
  try {
    const user = await getUserVaultAccessToken(opts.uid);
    return { accessToken: user.accessToken, scope: "user" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg !== "USER_DRIVE_NOT_CONNECTED") throw err;
  }
  if (opts.teamId) {
    const team = await getTeamVaultAccessToken(opts.teamId);
    return { accessToken: team.accessToken, scope: "team" };
  }
  throw new Error("USER_DRIVE_NOT_CONNECTED");
}
