import {
  driveAuthErrorResponse,
  requireGameVaultContributor,
} from "@/lib/drive/auth";
import { completeVaultUploadAdmin } from "@/lib/drive/complete-vault-upload";
import {
  completeInboxUploadAdmin,
  type FilmOrganizeKind,
} from "@/lib/drive/complete-inbox-upload";
import { isAngleSlot } from "@/lib/drive/angle-slots";
import { requireBearerUid } from "@/lib/ai/auth";

export const runtime = "nodejs";

function parseOrganizeKind(raw: unknown): FilmOrganizeKind | undefined {
  if (raw === "game" || raw === "practice" || raw === "other") return raw;
  return undefined;
}

/**
 * After Mac/browser uploads bytes to Drive, attach the source.
 *
 * Body: { driveFileId, angleSlot, gameId?, fileName?, title?, organizeKind?,
 *         createdByName?, recordedStartTime?, durationSec?, sidecar? }
 * - With gameId → attach under games/{gameId}/sources (existing path).
 * - Without gameId → users/{uid}/filmSources inbox item.
 *
 * Response: { ok, sourceId, marksImported, scope: "game" | "inbox" }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      gameId?: unknown;
      angleSlot?: unknown;
      driveFileId?: unknown;
      fileName?: unknown;
      title?: unknown;
      organizeKind?: unknown;
      createdByName?: unknown;
      recordedStartTime?: unknown;
      durationSec?: unknown;
      sidecar?: unknown;
    } | null;

    const gameId =
      typeof body?.gameId === "string" ? body.gameId.trim() : "";
    const driveFileId =
      typeof body?.driveFileId === "string" ? body.driveFileId.trim() : "";
    if (!driveFileId) {
      return Response.json(
        { error: "driveFileId is required." },
        { status: 400 },
      );
    }
    if (!isAngleSlot(body?.angleSlot)) {
      return Response.json({ error: "Invalid angleSlot." }, { status: 400 });
    }

    const shared = {
      angleSlot: body.angleSlot,
      driveFileId,
      ...(typeof body?.fileName === "string"
        ? { fileName: body.fileName }
        : {}),
      ...(typeof body?.createdByName === "string"
        ? { createdByName: body.createdByName }
        : {}),
      ...(typeof body?.recordedStartTime === "string"
        ? { recordedStartTime: body.recordedStartTime }
        : {}),
      ...(typeof body?.durationSec === "number"
        ? { durationSec: body.durationSec }
        : {}),
      ...(body?.sidecar !== undefined ? { sidecar: body.sidecar } : {}),
    };

    if (gameId) {
      const { uid } = await requireGameVaultContributor(request, gameId);
      const result = await completeVaultUploadAdmin({
        gameId,
        uid,
        ...shared,
      });
      return Response.json({ ok: true, scope: "game", ...result });
    }

    const uid = await requireBearerUid(request);
    const result = await completeInboxUploadAdmin({
      uid,
      ...shared,
      ...(typeof body?.title === "string" ? { title: body.title } : {}),
      ...(parseOrganizeKind(body?.organizeKind)
        ? { organizeKind: parseOrganizeKind(body?.organizeKind) }
        : {}),
    });
    return Response.json({ ok: true, scope: "inbox", ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (
      msg === "INVALID_ANGLE_SLOT" ||
      msg === "MISSING_DRIVE_FILE_ID" ||
      msg.startsWith("Sidecar")
    ) {
      return Response.json({ error: msg }, { status: 400 });
    }
    return driveAuthErrorResponse(err);
  }
}
