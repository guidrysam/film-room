import {
  driveAuthErrorResponse,
  requireGameVaultContributor,
} from "@/lib/drive/auth";
import { resolveDriveDownloadToken } from "@/lib/drive/resolve-vault";
import { adminFirestore } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/**
 * Mint a short-lived access token to download a Drive file (AI proxy publish).
 * Prefers the actor's personal Drive token; falls back to team vault.
 * Body: { gameId, sourceId }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      gameId?: unknown;
      sourceId?: unknown;
    } | null;
    const gameId =
      typeof body?.gameId === "string" ? body.gameId.trim() : "";
    const sourceId =
      typeof body?.sourceId === "string" ? body.sourceId.trim() : "";
    if (!gameId || !sourceId) {
      return Response.json(
        { error: "gameId and sourceId are required." },
        { status: 400 },
      );
    }

    const { uid, teamId } = await requireGameVaultContributor(request, gameId);
    const sourceSnap = await adminFirestore
      .collection("games")
      .doc(gameId)
      .collection("sources")
      .doc(sourceId)
      .get();
    if (!sourceSnap.exists) {
      return Response.json({ error: "Source not found." }, { status: 404 });
    }
    const source = sourceSnap.data() ?? {};
    const driveFileId =
      typeof source.driveFileId === "string" ? source.driveFileId.trim() : "";
    if (!driveFileId) {
      return Response.json(
        { error: "Source has no Drive file." },
        { status: 400 },
      );
    }

    const { accessToken, scope } = await resolveDriveDownloadToken({
      uid,
      teamId,
    });

    return Response.json({
      accessToken,
      driveFileId,
      vaultScope: scope,
      fileName:
        typeof source.label === "string" && source.label.trim()
          ? `${source.label.trim()}.mp4`
          : "angle.mp4",
      mimeType: "video/mp4",
    });
  } catch (err) {
    return driveAuthErrorResponse(err);
  }
}
