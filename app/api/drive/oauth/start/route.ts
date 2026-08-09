import { randomBytes } from "node:crypto";
import {
  driveAuthErrorResponse,
  requireTeamDriveAdmin,
} from "@/lib/drive/auth";
import { appBaseUrlFromRequest } from "@/lib/drive/app-url";
import {
  buildDriveAuthorizeUrl,
  signDriveOAuthState,
} from "@/lib/drive/oauth";
import { requireBearerUid } from "@/lib/ai/auth";

export const runtime = "nodejs";

/**
 * Start Drive offline OAuth.
 * Body: { teamId: string } for team vault, or { mode: "user" } for personal My Film.
 * Auth: Bearer Firebase ID token.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      teamId?: unknown;
      mode?: unknown;
    } | null;
    const mode =
      body?.mode === "user"
        ? "user"
        : typeof body?.teamId === "string" && body.teamId.trim()
          ? "team"
          : "";
    if (!mode) {
      return Response.json(
        { error: "Pass mode: \"user\" or a teamId." },
        { status: 400 },
      );
    }

    const appBaseUrl = appBaseUrlFromRequest(request);

    if (mode === "user") {
      const uid = await requireBearerUid(request);
      const state = signDriveOAuthState({
        kind: "user",
        teamId: "",
        uid,
        nonce: randomBytes(16).toString("hex"),
        exp: Date.now() + 10 * 60 * 1000,
      });
      const url = buildDriveAuthorizeUrl({ appBaseUrl, state });
      return Response.json({ url });
    }

    const teamId =
      typeof body?.teamId === "string" ? body.teamId.trim() : "";
    const { uid } = await requireTeamDriveAdmin(request, teamId);
    const state = signDriveOAuthState({
      kind: "team",
      teamId,
      uid,
      nonce: randomBytes(16).toString("hex"),
      exp: Date.now() + 10 * 60 * 1000,
    });
    const url = buildDriveAuthorizeUrl({ appBaseUrl, state });
    return Response.json({ url });
  } catch (err) {
    return driveAuthErrorResponse(err);
  }
}
