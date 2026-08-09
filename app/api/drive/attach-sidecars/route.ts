import {
  driveAuthErrorResponse,
  requireGameVaultContributor,
} from "@/lib/drive/auth";
import { attachSidecarsFromDriveByName } from "@/lib/drive/attach-sidecars-by-name";

export const runtime = "nodejs";

/**
 * Match Game Cap sidecar JSON in personal My Film Drive (preferred) and
 * optional team game vault to same-stem YouTube/upload sources.
 * Body: { gameId, createdByName? }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      gameId?: unknown;
      createdByName?: unknown;
    } | null;
    const gameId =
      typeof body?.gameId === "string" ? body.gameId.trim() : "";
    if (!gameId) {
      return Response.json({ error: "gameId is required." }, { status: 400 });
    }

    const { uid, teamId } = await requireGameVaultContributor(request, gameId);
    const createdByName =
      typeof body?.createdByName === "string" && body.createdByName.trim()
        ? body.createdByName.trim()
        : undefined;

    const result = await attachSidecarsFromDriveByName({
      gameId,
      teamId,
      uid,
      createdByName,
    });

    const marksImported = result.matched.reduce(
      (n, m) => n + m.marksImported,
      0,
    );

    return Response.json({
      ok: true,
      ...result,
      marksImported,
    });
  } catch (err) {
    return driveAuthErrorResponse(err);
  }
}
