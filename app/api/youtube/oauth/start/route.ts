import { requireBearerUid } from "@/lib/ai/auth";
import { appBaseUrlFromRequest } from "@/lib/drive/app-url";
import {
  buildYouTubeUploadAuthorizeUrl,
  newYouTubeUploadOAuthNonce,
  signYouTubeUploadOAuthState,
} from "@/lib/youtube/user-upload-oauth";

export const runtime = "nodejs";

/**
 * Start offline OAuth for YouTube upload (Game Cap native mint tokens).
 * Body: { } (user mode only)
 * Auth: Bearer Firebase ID token.
 */
export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const appBaseUrl = appBaseUrlFromRequest(request);
    const state = signYouTubeUploadOAuthState({
      uid,
      nonce: newYouTubeUploadOAuthNonce(),
      exp: Date.now() + 10 * 60 * 1000,
    });
    const url = buildYouTubeUploadAuthorizeUrl({ appBaseUrl, state });
    return Response.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "AUTH_REQUIRED") {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    if (msg.includes("GOOGLE_DRIVE_CLIENT")) {
      return Response.json(
        { error: "Google OAuth client is not configured." },
        { status: 500 },
      );
    }
    console.error("[youtube/oauth/start]", err);
    return Response.json({ error: "Could not start YouTube connect." }, { status: 500 });
  }
}
