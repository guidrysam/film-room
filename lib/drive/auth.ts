import "server-only";

import { adminFirestore } from "@/lib/firebase-admin";
import { requireBearerUid } from "@/lib/ai/auth";
import { requireVerifiedTeamActor } from "@/lib/firebase-admin";

export async function requireTeamDriveAdmin(
  request: Request,
  teamId: string,
): Promise<{ uid: string }> {
  const actor = await requireVerifiedTeamActor(request, teamId);
  if (!actor.canCoach) throw new Error("TEAM_ACCESS_DENIED");
  return { uid: actor.uid };
}

/** Game contributor or team admin/coach/parent may upload to vault. */
export async function requireGameVaultContributor(
  request: Request,
  gameId: string,
): Promise<{ uid: string; teamId: string }> {
  const uid = await requireBearerUid(request);
  const gameSnap = await adminFirestore.collection("games").doc(gameId).get();
  if (!gameSnap.exists) throw new Error("GAME_NOT_FOUND");
  const game = gameSnap.data() ?? {};
  const teamId =
    typeof game.teamId === "string" && game.teamId.trim()
      ? game.teamId.trim()
      : "";
  if (!teamId) throw new Error("GAME_HAS_NO_TEAM");

  const contributors =
    game.contributors && typeof game.contributors === "object"
      ? (game.contributors as Record<string, string>)
      : {};
  const contribRole = contributors[uid];
  if (
    game.ownerId === uid ||
    contribRole === "owner" ||
    contribRole === "editor"
  ) {
    return { uid, teamId };
  }

  const teamSnap = await adminFirestore.collection("teams").doc(teamId).get();
  if (!teamSnap.exists) throw new Error("TEAM_NOT_FOUND");
  const team = teamSnap.data() ?? {};
  const members =
    team.members && typeof team.members === "object"
      ? (team.members as Record<string, string>)
      : {};
  const role = team.ownerId === uid ? "owner" : members[uid];
  if (
    role === "owner" ||
    role === "admin" ||
    role === "coach" ||
    role === "parent"
  ) {
    return { uid, teamId };
  }

  throw new Error("TEAM_ACCESS_DENIED");
}

export function driveAuthErrorResponse(err: unknown): Response {
  const msg = err instanceof Error ? err.message : "UNKNOWN";
  if (msg === "AUTH_REQUIRED") {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  if (msg === "TEAM_ACCESS_DENIED" || msg === "CLUB_ACCESS_DENIED") {
    return Response.json({ error: "Not allowed." }, { status: 403 });
  }
  if (msg === "TEAM_NOT_FOUND" || msg === "GAME_NOT_FOUND") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (msg === "DRIVE_NOT_CONNECTED") {
    return Response.json(
      { error: "Connect Google Drive for this team first." },
      { status: 400 },
    );
  }
  if (msg === "USER_DRIVE_NOT_CONNECTED") {
    return Response.json(
      {
        error:
          "Connect your Google Drive in My Film first, then upload without a game.",
      },
      { status: 400 },
    );
  }
  if (msg === "GAME_HAS_NO_TEAM" || msg === "GAME_TEAM_MISMATCH") {
    return Response.json(
      { error: "This game is not linked to a team vault." },
      { status: 400 },
    );
  }
  console.error("[drive]", msg);
  return Response.json(
    { error: "Drive request failed." },
    { status: 500 },
  );
}
