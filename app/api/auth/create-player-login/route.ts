import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, adminFirestore } from "@/lib/firebase-admin";
import { verifyFirebaseIdTokenRest } from "@/lib/firebase-id-token";
import {
  playerUsernameToAuthEmail,
  validatePlayerPassword,
  validatePlayerUsername,
} from "@/lib/player-auth";

type Body = {
  username?: string;
  password?: string;
  displayName?: string;
  teamId?: string;
  playerId?: string;
  parentEmail?: string;
};

async function requireParentOrCoach(input: {
  uid: string;
  email?: string;
  teamId: string;
  playerId: string;
}): Promise<{ parentEmail: string; playerName: string }> {
  const teamSnap = await adminFirestore.collection("teams").doc(input.teamId).get();
  if (!teamSnap.exists) throw new Error("TEAM_NOT_FOUND");
  const team = teamSnap.data() ?? {};
  const members =
    team.members && typeof team.members === "object"
      ? (team.members as Record<string, string>)
      : {};
  const role =
    team.ownerId === input.uid ? "owner" : members[input.uid];
  const canManage =
    role === "owner" ||
    role === "admin" ||
    role === "coach" ||
    role === "parent";
  if (!canManage) throw new Error("TEAM_ACCESS_DENIED");

  const playerSnap = await adminFirestore
    .collection("teams")
    .doc(input.teamId)
    .collection("players")
    .doc(input.playerId)
    .get();
  if (!playerSnap.exists) throw new Error("PLAYER_NOT_FOUND");
  const player = playerSnap.data() ?? {};
  const parentUids = Array.isArray(player.parentUids)
    ? player.parentUids.filter((uid): uid is string => typeof uid === "string")
    : [];
  if (role === "parent" && !parentUids.includes(input.uid)) {
    throw new Error("NOT_LINKED_PARENT");
  }
  if (typeof player.linkedUid === "string" && player.linkedUid.trim()) {
    throw new Error("PLAYER_LOGIN_EXISTS");
  }

  let parentEmail = input.email?.trim();
  if (!parentEmail) {
    const auth = await getAdminAuth();
    const parentUser = await auth.getUser(input.uid);
    parentEmail = parentUser.email?.trim();
  }
  if (!parentEmail) throw new Error("PARENT_EMAIL_REQUIRED");

  return {
    parentEmail,
    playerName:
      typeof player.name === "string" && player.name.trim()
        ? player.name.trim()
        : "Player",
  };
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!token) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const decoded = await verifyFirebaseIdTokenRest(token);
    const body = (await request.json()) as Body;
    const teamId = body.teamId?.trim() ?? "";
    const playerId = body.playerId?.trim() ?? "";
    if (!teamId || !playerId) {
      return NextResponse.json(
        { error: "teamId and playerId are required." },
        { status: 400 },
      );
    }

    const usernameCheck = validatePlayerUsername(body.username ?? "");
    if (!usernameCheck.ok) {
      return NextResponse.json(
        { error: usernameCheck.error ?? "Invalid username." },
        { status: 400 },
      );
    }
    const passwordCheck = validatePlayerPassword(body.password ?? "");
    if (!passwordCheck.ok) {
      return NextResponse.json(
        { error: passwordCheck.error ?? "Invalid password." },
        { status: 400 },
      );
    }

    const { parentEmail, playerName } = await requireParentOrCoach({
      uid: decoded.uid,
      email: decoded.email,
      teamId,
      playerId,
    });

    const username = usernameCheck.username;
    const authEmail = playerUsernameToAuthEmail(username);
    const usernameRef = adminFirestore.collection("usernames").doc(username);
    const existingUsername = await usernameRef.get();
    if (existingUsername.exists) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 },
      );
    }

    const displayName =
      body.displayName?.trim() || playerName || username;

    const auth = await getAdminAuth();
    const created = await auth.createUser({
      email: authEmail,
      password: body.password,
      displayName,
      emailVerified: false,
      disabled: false,
    });

    const batch = adminFirestore.batch();
    batch.set(usernameRef, {
      uid: created.uid,
      username,
      parentUid: decoded.uid,
      parentEmail,
      teamId,
      playerId,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(
      adminFirestore.collection("users").doc(created.uid),
      {
        email: authEmail,
        displayName,
        username,
        parentUid: decoded.uid,
        parentEmail,
        accountKind: "player",
        signupRoles: ["player"],
        onboardingCompletedAt: FieldValue.serverTimestamp(),
        linkedTeamId: teamId,
        linkedPlayerId: playerId,
      },
      { merge: true },
    );
    batch.update(adminFirestore.collection("teams").doc(teamId), {
      [`members.${created.uid}`]: "player",
      memberUids: FieldValue.arrayUnion(created.uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.update(
      adminFirestore
        .collection("teams")
        .doc(teamId)
        .collection("players")
        .doc(playerId),
      {
        linkedUid: created.uid,
        parentUids: FieldValue.arrayUnion(decoded.uid),
      },
    );
    await batch.commit();

    return NextResponse.json({
      ok: true,
      uid: created.uid,
      username,
      parentEmail,
      displayName,
      authEmail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status =
      message === "AUTH_REQUIRED" || message.includes("auth/")
        ? 401
        : message === "TEAM_ACCESS_DENIED" || message === "NOT_LINKED_PARENT"
          ? 403
          : message === "PLAYER_LOGIN_EXISTS" || message.includes("already")
            ? 409
            : message === "TEAM_NOT_FOUND" || message === "PLAYER_NOT_FOUND"
              ? 404
              : message === "PARENT_EMAIL_REQUIRED"
                ? 400
                : 500;
    const friendly: Record<string, string> = {
      TEAM_ACCESS_DENIED: "You do not have permission on this team.",
      NOT_LINKED_PARENT: "You must be linked as this player's parent.",
      PLAYER_LOGIN_EXISTS: "This player already has a login.",
      TEAM_NOT_FOUND: "Team not found.",
      PLAYER_NOT_FOUND: "Player not found.",
      PARENT_EMAIL_REQUIRED:
        "Your account needs an email address before creating a player login.",
    };
    return NextResponse.json(
      { error: friendly[message] ?? "Could not create player login." },
      { status },
    );
  }
}
