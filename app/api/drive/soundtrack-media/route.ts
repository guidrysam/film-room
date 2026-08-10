import { driveAuthErrorResponse } from "@/lib/drive/auth";
import { streamDriveFile } from "@/lib/drive/soundtrack";
import { getUserVaultAccessToken } from "@/lib/drive/user-vault";
import { requireBearerUid } from "@/lib/ai/auth";

export const runtime = "nodejs";

/**
 * Stream a soundtrack file from the signed-in user's Drive (preview playback).
 * Query: ?fileId=&mimeType=
 */
export async function GET(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const url = new URL(request.url);
    const fileId = url.searchParams.get("fileId")?.trim() ?? "";
    const mimeType = url.searchParams.get("mimeType")?.trim() || undefined;
    if (!fileId) {
      return Response.json({ error: "fileId is required." }, { status: 400 });
    }
    const { accessToken } = await getUserVaultAccessToken(uid);
    return streamDriveFile({
      accessToken,
      driveFileId: fileId,
      mimeType,
    });
  } catch (err) {
    return driveAuthErrorResponse(err);
  }
}
