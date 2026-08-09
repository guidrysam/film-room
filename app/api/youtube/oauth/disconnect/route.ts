import { requireBearerUid } from "@/lib/ai/auth";
import { clearUserYouTubeUpload } from "@/lib/youtube/user-upload-oauth";

export const runtime = "nodejs";

/** Disconnect personal YouTube upload refresh token. */
export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    await clearUserYouTubeUpload(uid);
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "AUTH_REQUIRED") {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[youtube/oauth/disconnect]", err);
    return Response.json({ error: "Could not disconnect YouTube." }, { status: 500 });
  }
}
