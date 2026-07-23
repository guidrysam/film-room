import "server-only";

import { adminFirestore } from "@/lib/firebase-admin";
import { verifyFirebaseIdTokenRest } from "@/lib/firebase-id-token";

export async function requireBearerUid(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) throw new Error("AUTH_REQUIRED");
  const decoded = await verifyFirebaseIdTokenRest(token);
  return decoded.uid;
}

export async function requireCoachForGame(
  request: Request,
  gameId: string,
): Promise<{ uid: string; teamId?: string }> {
  const uid = await requireBearerUid(request);
  const gameSnap = await adminFirestore.collection("games").doc(gameId).get();
  if (!gameSnap.exists) throw new Error("GAME_NOT_FOUND");
  const game = gameSnap.data() ?? {};
  const teamId =
    typeof game.teamId === "string" && game.teamId.trim()
      ? game.teamId.trim()
      : undefined;

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
    return { uid, ...(teamId ? { teamId } : {}) };
  }

  if (teamId) {
    const teamSnap = await adminFirestore.collection("teams").doc(teamId).get();
    if (teamSnap.exists) {
      const team = teamSnap.data() ?? {};
      const members =
        team.members && typeof team.members === "object"
          ? (team.members as Record<string, string>)
          : {};
      const role = team.ownerId === uid ? "owner" : members[uid];
      if (role === "owner" || role === "admin" || role === "coach") {
        return { uid, teamId };
      }
      const clubId =
        typeof team.clubId === "string" && team.clubId.trim()
          ? team.clubId.trim()
          : "";
      if (clubId) {
        const clubSnap = await adminFirestore.collection("clubs").doc(clubId).get();
        const club = clubSnap.data() ?? {};
        const clubMembers =
          club.members && typeof club.members === "object"
            ? (club.members as Record<string, string>)
            : {};
        if (
          club.ownerId === uid ||
          clubMembers[uid] === "club_admin"
        ) {
          return { uid, teamId };
        }
      }
    }
  }

  throw new Error("TEAM_ACCESS_DENIED");
}

export async function requireClubAdminOrOwner(
  request: Request,
  clubId: string,
): Promise<string> {
  const uid = await requireBearerUid(request);
  const clubSnap = await adminFirestore.collection("clubs").doc(clubId).get();
  if (!clubSnap.exists) throw new Error("CLUB_NOT_FOUND");
  const club = clubSnap.data() ?? {};
  const members =
    club.members && typeof club.members === "object"
      ? (club.members as Record<string, string>)
      : {};
  if (club.ownerId === uid || members[uid] === "club_admin") return uid;
  throw new Error("CLUB_ACCESS_DENIED");
}

/** Test grants: club admin, or wallet owner for user wallets; also allow when purchase disabled + self user wallet. */
export async function requireGrantActor(
  request: Request,
  wallet: { kind: "club"; clubId: string } | { kind: "user"; userId: string },
): Promise<string> {
  const uid = await requireBearerUid(request);
  if (wallet.kind === "club") {
    return requireClubAdminOrOwner(request, wallet.clubId);
  }
  if (wallet.userId !== uid) throw new Error("WALLET_ACCESS_DENIED");
  return uid;
}
