import { randomBytes } from "node:crypto";
import { requireTeamDriveAdmin, driveAuthErrorResponse } from "@/lib/drive/auth";
import { appBaseUrlFromRequest } from "@/lib/drive/app-url";
import {
  buildDriveAuthorizeUrl,
  signDriveOAuthState,
} from "@/lib/drive/oauth";

export const runtime = "nodejs";

/**
 * Start Drive offline OAuth for a team vault.
 * Body: { teamId: string }
 * Auth: Bearer Firebase ID token (coach/admin).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      teamId?: unknown;
    } | null;
    const teamId =
      typeof body?.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return Response.json({ error: "teamId is required." }, { status: 400 });
    }

    const { uid } = await requireTeamDriveAdmin(request, teamId);
    const appBaseUrl = appBaseUrlFromRequest(request);
    const state = signDriveOAuthState({
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
