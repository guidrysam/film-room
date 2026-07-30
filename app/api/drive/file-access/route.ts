import {
  driveAuthErrorResponse,
  requireGameVaultContributor,
} from "@/lib/drive/auth";
import { getTeamVaultAccessToken } from "@/lib/drive/team-vault";
import { adminFirestore } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/**
 * Mint a short-lived vault access token to download a Drive file for AI proxy publish.
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

    const { teamId } = await requireGameVaultContributor(request, gameId);
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

    const gameSnap = await adminFirestore.collection("games").doc(gameId).get();
    const gameTeamId =
      typeof gameSnap.data()?.teamId === "string"
        ? String(gameSnap.data()?.teamId).trim()
        : "";
    if (gameTeamId && gameTeamId !== teamId) {
      return Response.json({ error: "Game team mismatch." }, { status: 400 });
    }

    const { accessToken } = await getTeamVaultAccessToken(teamId);
    return Response.json({
      accessToken,
      driveFileId,
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
