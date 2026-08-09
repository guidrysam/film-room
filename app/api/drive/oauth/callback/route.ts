import { appBaseUrlFromRequest } from "@/lib/drive/app-url";
import {
  exchangeDriveAuthCode,
  verifyDriveOAuthState,
} from "@/lib/drive/oauth";
import { connectTeamDriveVault } from "@/lib/drive/team-vault";
import { connectUserDriveVault } from "@/lib/drive/user-vault";
import { adminFirestore } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function setupRedirect(teamId: string, appBaseUrl: string, query: string) {
  const base = `${appBaseUrl.replace(/\/$/, "")}/team/${encodeURIComponent(teamId)}/setup`;
  return Response.redirect(`${base}?${query}`, 302);
}

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

  let teamId = "";
  let kind: "team" | "user" = "team";
  try {
    if (oauthError) {
      throw new Error(`OAuth denied: ${oauthError}`);
    }
    if (!code || !stateRaw) throw new Error("Missing OAuth code or state.");

    const state = verifyDriveOAuthState(stateRaw);
    kind = state.kind;
    teamId = state.teamId;

    const tokens = await exchangeDriveAuthCode({ code, appBaseUrl });
    if (!tokens.access_token) throw new Error("No access token from Google.");
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Disconnect Film Room in your Google Account permissions and try Connect again.",
      );
    }

    if (state.kind === "user") {
      await connectUserDriveVault({
        uid: state.uid,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
      });
      return myFilmRedirect(appBaseUrl, "drive=connected");
    }

    const teamSnap = await adminFirestore.collection("teams").doc(teamId).get();
    if (!teamSnap.exists) throw new Error("TEAM_NOT_FOUND");
    const team = teamSnap.data() ?? {};
    const members =
      team.members && typeof team.members === "object"
        ? (team.members as Record<string, string>)
        : {};
    const role =
      team.ownerId === state.uid ? "owner" : members[state.uid];
    if (role !== "owner" && role !== "admin" && role !== "coach") {
      throw new Error("TEAM_ACCESS_DENIED");
    }

    await connectTeamDriveVault({
      teamId,
      uid: state.uid,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
    });

    return setupRedirect(teamId, appBaseUrl, "drive=connected");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Drive connect failed";
    console.error("[drive/oauth/callback]", msg);
    if (kind === "user") {
      return myFilmRedirect(
        appBaseUrl,
        `drive=error&message=${encodeURIComponent(msg.slice(0, 180))}`,
      );
    }
    if (teamId) {
      return setupRedirect(
        teamId,
        appBaseUrl,
        `drive=error&message=${encodeURIComponent(msg.slice(0, 180))}`,
      );
    }
    return Response.redirect(
      `${appBaseUrl.replace(/\/$/, "")}/app/film?drive=error`,
      302,
    );
  }
}
