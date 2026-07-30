import {
  driveAuthErrorResponse,
  requireGameVaultContributor,
} from "@/lib/drive/auth";
import { isAngleSlot, labelForAngleSlot } from "@/lib/drive/angle-slots";
import {
  ensureGameDriveFolders,
  getTeamVaultAccessToken,
} from "@/lib/drive/team-vault";

export const runtime = "nodejs";

/**
 * Mint a short-lived team vault access token and ensure game raw folder.
 * Body: { gameId, angleSlot, fileName, mimeType?, sizeBytes? }
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
    if (!gameId || !fileName) {
      return Response.json(
        { error: "gameId and fileName are required." },
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

    const { uid, teamId } = await requireGameVaultContributor(request, gameId);
    const folders = await ensureGameDriveFolders({ teamId, gameId });
    const { accessToken } = await getTeamVaultAccessToken(teamId);

    const safeBase = fileName.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120);
    const uploadName = `${labelForAngleSlot(angleSlot)} — ${safeBase}`;

    return Response.json({
      accessToken,
      rawFolderId: folders.driveRawFolderId,
      driveFolderId: folders.driveFolderId,
      uploadName,
      angleSlot,
      angleLabel: labelForAngleSlot(angleSlot),
      teamId,
      uid,
      mimeType:
        typeof body?.mimeType === "string" && body.mimeType.trim()
          ? body.mimeType.trim()
          : "video/mp4",
      ...(typeof body?.sizeBytes === "number" &&
      Number.isFinite(body.sizeBytes) &&
      body.sizeBytes > 0
        ? { sizeBytes: body.sizeBytes }
        : {}),
    });
  } catch (err) {
    return driveAuthErrorResponse(err);
  }
}
