import { driveAuthErrorResponse } from "@/lib/drive/auth";
import { resolveUserMusicFolder } from "@/lib/drive/soundtrack";
import { requireBearerUid } from "@/lib/ai/auth";

export const runtime = "nodejs";

/**
 * Mint a Drive access token targeting Film Room / My Film / Music for soundtrack upload.
 *
 * Body: { fileName, mimeType?, sizeBytes? }
 */
export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const body = (await request.json().catch(() => null)) as {
      fileName?: unknown;
      mimeType?: unknown;
      sizeBytes?: unknown;
    } | null;

    const fileName =
      typeof body?.fileName === "string" ? body.fileName.trim() : "";
    if (!fileName) {
      return Response.json(
        { error: "fileName is required." },
        { status: 400 },
      );
    }

    const safeBase = fileName.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120);
    const mimeType =
      typeof body?.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim()
        : "audio/mpeg";
    const sizeBytes =
      typeof body?.sizeBytes === "number" &&
      Number.isFinite(body.sizeBytes) &&
      body.sizeBytes > 0
        ? body.sizeBytes
        : undefined;

    const music = await resolveUserMusicFolder(uid);
    return Response.json({
      accessToken: music.accessToken,
      parentFolderId: music.musicFolderId,
      uploadName: safeBase,
      mimeType,
      uid,
      ...(sizeBytes != null ? { sizeBytes } : {}),
    });
  } catch (err) {
    return driveAuthErrorResponse(err);
  }
}
