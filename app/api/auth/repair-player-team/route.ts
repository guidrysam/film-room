import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { verifyFirebaseIdTokenRest } from "@/lib/firebase-id-token";

/**
 * Ensures a player account is on team.memberUids (query + read mirror).
 * Fixes logins created before create-player-login wrote memberUids.
 */
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
    const userSnap = await adminFirestore.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }
    const user = userSnap.data() ?? {};
    if (user.accountKind !== "player") {
      return NextResponse.json(
        { error: "Only player accounts can repair team links." },
        { status: 403 },
      );
    }
    const teamId =
      typeof user.linkedTeamId === "string" ? user.linkedTeamId.trim() : "";
    if (!teamId) {
      return NextResponse.json(
        { error: "No linked team on this player profile." },
        { status: 400 },
      );
    }

    const teamRef = adminFirestore.collection("teams").doc(teamId);
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) {
      return NextResponse.json({ error: "Linked team not found." }, { status: 404 });
    }
    const team = teamSnap.data() ?? {};
    const members =
      team.members && typeof team.members === "object"
        ? (team.members as Record<string, string>)
        : {};
    const memberUids = Array.isArray(team.memberUids)
      ? team.memberUids.filter((id): id is string => typeof id === "string")
      : [];

    const alreadyListed = memberUids.includes(decoded.uid);
    const alreadyMember = members[decoded.uid] === "player" || members[decoded.uid];

    if (alreadyListed && alreadyMember) {
      return NextResponse.json({
        ok: true,
        teamId,
        repaired: false,
      });
    }

    await teamRef.update({
      [`members.${decoded.uid}`]: members[decoded.uid] || "player",
      memberUids: FieldValue.arrayUnion(decoded.uid),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      teamId,
      repaired: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "REPAIR_FAILED";
    if (message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[repair-player-team]", error);
    return NextResponse.json(
      { error: "Could not repair team link." },
      { status: 500 },
    );
  }
}
