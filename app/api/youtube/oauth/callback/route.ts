import { appBaseUrlFromRequest } from "@/lib/drive/app-url";
import {
  connectUserYouTubeUpload,
  exchangeYouTubeUploadAuthCode,
  verifyYouTubeUploadOAuthState,
} from "@/lib/youtube/user-upload-oauth";

export const runtime = "nodejs";

function myFilmRedirect(appBaseUrl: string, query: string) {
  const base = `${appBaseUrl.replace(/\/$/, "")}/app/film`;
  return Response.redirect(`${base}?${query}`, 302);
}

export async function GET(request: Request) {
  const appBaseUrl = appBaseUrlFromRequest(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const stateRaw = url.searchParams.get("state")?.trim() ?? "";
  const oauthError = url.searchParams.get("error")?.trim();

  try {
    if (oauthError) throw new Error(`OAuth denied: ${oauthError}`);
    if (!code || !stateRaw) throw new Error("Missing OAuth code or state.");

    const state = verifyYouTubeUploadOAuthState(stateRaw);
    const tokens = await exchangeYouTubeUploadAuthCode({ code, appBaseUrl });
    if (!tokens.access_token) throw new Error("No access token from Google.");
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Disconnect Film Room YouTube upload in your Google Account permissions and try Connect again.",
      );
    }

    await connectUserYouTubeUpload({
      uid: state.uid,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
    });

    return myFilmRedirect(appBaseUrl, "youtube=connected");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "YouTube connect failed";
    console.error("[youtube/oauth/callback]", msg);
    return myFilmRedirect(
      appBaseUrl,
      `youtube=error&message=${encodeURIComponent(msg.slice(0, 180))}`,
    );
  }
}
