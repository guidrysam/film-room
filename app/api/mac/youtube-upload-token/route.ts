import { requireBearerUid } from "@/lib/ai/auth";
import { getUserYouTubeUploadAccessToken } from "@/lib/youtube/user-upload-oauth";

export const runtime = "nodejs";

/**
 * Mint a short-lived YouTube access token for Game Cap (Mac / MOGO).
 * Auth: Bearer Firebase ID token (device link).
 *
 * POST /api/mac/youtube-upload-token
 */
export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const token = await getUserYouTubeUploadAccessToken(uid);
    return Response.json({
      accessToken: token.accessToken,
      expiresInSec: token.expiresInSec,
      ...(token.channelTitle ? { channelTitle: token.channelTitle } : {}),
      ...(token.channelId ? { channelId: token.channelId } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "AUTH_REQUIRED") {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    if (msg === "YOUTUBE_UPLOAD_NOT_CONNECTED") {
      return Response.json(
        {
          error:
            "Connect YouTube upload in Film Room → My Film (or Settings).",
        },
        { status: 403 },
      );
    }
    console.error("[mac/youtube-upload-token]", err);
    return Response.json(
      { error: "Could not mint YouTube upload token." },
      { status: 500 },
    );
  }
}
