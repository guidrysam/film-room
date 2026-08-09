import {
  requireTeamDriveAdmin,
  driveAuthErrorResponse,
} from "@/lib/drive/auth";
import { clearTeamDriveConnection } from "@/lib/drive/team-vault";
import { clearUserDriveConnection } from "@/lib/drive/user-vault";
import { requireBearerUid } from "@/lib/ai/auth";

export const runtime = "nodejs";

/**
 * Disconnect Drive vault.
 * Body: { teamId } for team vault, or { mode: "user" } for personal My Film.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      teamId?: unknown;
      mode?: unknown;
    } | null;

    if (body?.mode === "user") {
      const uid = await requireBearerUid(request);
      await clearUserDriveConnection(uid);
      return Response.json({ ok: true });
    }

    const teamId =
      typeof body?.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return Response.json(
        { error: "Pass mode: \"user\" or a teamId." },
        { status: 400 },
      );
    }
    await requireTeamDriveAdmin(request, teamId);
    await clearTeamDriveConnection(teamId);
    return Response.json({ ok: true });
  } catch (err) {
    return driveAuthErrorResponse(err);
  }
}
