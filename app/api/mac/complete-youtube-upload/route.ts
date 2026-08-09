import { requireBearerUid } from "@/lib/ai/auth";
import {
  driveAuthErrorResponse,
  requireGameVaultContributor,
} from "@/lib/drive/auth";
import { isAngleSlot } from "@/lib/drive/angle-slots";
import type { FilmOrganizeKind } from "@/lib/drive/complete-inbox-upload";
import { completeYouTubeUploadAdmin } from "@/lib/youtube/complete-youtube-upload";

export const runtime = "nodejs";

function parseOrganizeKind(raw: unknown): FilmOrganizeKind | undefined {
  if (raw === "game" || raw === "practice" || raw === "other") return raw;
  return undefined;
}

function parsePrivacy(
  raw: unknown,
): "private" | "unlisted" | "public" | undefined {
  if (raw === "private" || raw === "unlisted" || raw === "public") return raw;
  return undefined;
}

/**
 * After Game Cap uploads a VOD to YouTube, attach it to My Film (or a game)
 * and import Main-angle sidecar marks.
 *
 * POST /api/mac/complete-youtube-upload
 * Body: { youtubeVideoId, angleSlot, gameId?, fileName?, title?, organizeKind?,
 *         createdByName?, recordedStartTime?, durationSec?, sidecar?, privacyStatus? }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      youtubeVideoId?: unknown;
      angleSlot?: unknown;
      gameId?: unknown;
      fileName?: unknown;
      title?: unknown;
      organizeKind?: unknown;
      createdByName?: unknown;
      recordedStartTime?: unknown;
      durationSec?: unknown;
      sidecar?: unknown;
      privacyStatus?: unknown;
    } | null;

    const youtubeVideoId =
      typeof body?.youtubeVideoId === "string" ? body.youtubeVideoId.trim() : "";
    const gameId =
      typeof body?.gameId === "string" ? body.gameId.trim() : "";
    if (!youtubeVideoId) {
      return Response.json(
        { error: "youtubeVideoId is required." },
        { status: 400 },
      );
    }
    if (!isAngleSlot(body?.angleSlot)) {
      return Response.json({ error: "Invalid angleSlot." }, { status: 400 });
    }

    let uid: string;
    if (gameId) {
      ({ uid } = await requireGameVaultContributor(request, gameId));
    } else {
      uid = await requireBearerUid(request);
    }

    const result = await completeYouTubeUploadAdmin({
      uid,
      youtubeVideoId,
      angleSlot: body.angleSlot,
      ...(gameId ? { gameId } : {}),
      ...(typeof body?.fileName === "string" ? { fileName: body.fileName } : {}),
      ...(typeof body?.title === "string" ? { title: body.title } : {}),
      ...(parseOrganizeKind(body?.organizeKind)
        ? { organizeKind: parseOrganizeKind(body?.organizeKind) }
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
      ...(parsePrivacy(body?.privacyStatus)
        ? { privacyStatus: parsePrivacy(body?.privacyStatus) }
        : {}),
    });

    return Response.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (
      msg === "INVALID_ANGLE_SLOT" ||
      msg === "INVALID_YOUTUBE_VIDEO_ID" ||
      msg.startsWith("Sidecar")
    ) {
      return Response.json({ error: msg }, { status: 400 });
    }
    return driveAuthErrorResponse(err);
  }
}
