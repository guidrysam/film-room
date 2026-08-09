import {
  driveAuthErrorResponse,
  requireGameVaultContributor,
} from "@/lib/drive/auth";
import { isAngleSlot, labelForAngleSlot } from "@/lib/drive/angle-slots";
import {
  ensureGameDriveFolders,
  getTeamVaultAccessToken,
} from "@/lib/drive/team-vault";
import { getUserVaultAccessToken } from "@/lib/drive/user-vault";
import { requireBearerUid } from "@/lib/ai/auth";

export const runtime = "nodejs";

/**
 * Mint a short-lived Drive access token and target folder for vault upload.
 *
 * Body: { fileName, angleSlot, mimeType?, sizeBytes?, gameId? }
 * - With gameId → team game vault (existing Game Cap path).
 * - Without gameId → signed-in user's My Film Inbox.
 *
 * Response always includes rawFolderId (Mac client field name stays stable).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      gameId?: unknown;
      angleSlot?: unknown;
      fileName?: unknown;
      mimeType?: unknown;
      sizeBytes?: unknown;
    } | null;

    const gameId =
      typeof body?.gameId === "string" ? body.gameId.trim() : "";
    const fileName =
      typeof body?.fileName === "string" ? body.fileName.trim() : "";
    if (!fileName) {
      return Response.json(
        { error: "fileName is required." },
        { status: 400 },
      );
    }
    if (!isAngleSlot(body?.angleSlot)) {
      return Response.json(
        { error: "Invalid angleSlot." },
        { status: 400 },
      );
    }
    const angleSlot = body.angleSlot;
    const safeBase = fileName.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120);
    const uploadName = `${labelForAngleSlot(angleSlot)} — ${safeBase}`;
    const mimeType =
      typeof body?.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim()
        : "video/mp4";
    const sizeBytes =
      typeof body?.sizeBytes === "number" &&
      Number.isFinite(body.sizeBytes) &&
      body.sizeBytes > 0
        ? body.sizeBytes
        : undefined;

    if (gameId) {
      const { uid, teamId } = await requireGameVaultContributor(
        request,
        gameId,
      );
      const folders = await ensureGameDriveFolders({ teamId, gameId });
      const { accessToken } = await getTeamVaultAccessToken(teamId);
      return Response.json({
        accessToken,
        rawFolderId: folders.driveRawFolderId,
        driveFolderId: folders.driveFolderId,
        uploadName,
        angleSlot,
        angleLabel: labelForAngleSlot(angleSlot),
        teamId,
        gameId,
        scope: "game",
        uid,
        mimeType,
        ...(sizeBytes != null ? { sizeBytes } : {}),
      });
    }

    const uid = await requireBearerUid(request);
    const vault = await getUserVaultAccessToken(uid);
    return Response.json({
      accessToken: vault.accessToken,
      rawFolderId: vault.inboxFolderId,
      driveFolderId: vault.rootFolderId,
      uploadName,
      angleSlot,
      angleLabel: labelForAngleSlot(angleSlot),
      /** Always present for Mac decoder stability (null = inbox). */
      teamId: null,
      gameId: null,
      scope: "inbox",
      uid,
      mimeType,
      ...(sizeBytes != null ? { sizeBytes } : {}),
    });
  } catch (err) {
    return driveAuthErrorResponse(err);
  }
}
