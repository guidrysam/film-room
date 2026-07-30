import {
  requireTeamDriveAdmin,
  driveAuthErrorResponse,
} from "@/lib/drive/auth";
import { clearTeamDriveConnection } from "@/lib/drive/team-vault";

export const runtime = "nodejs";

/** Disconnect team Drive vault (clears refresh token + team.drive). */
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
    await requireTeamDriveAdmin(request, teamId);
    await clearTeamDriveConnection(teamId);
    return Response.json({ ok: true });
  } catch (err) {
    return driveAuthErrorResponse(err);
  }
}
