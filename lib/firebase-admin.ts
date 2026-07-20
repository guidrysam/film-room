import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getOrCreateAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;
  const serialized = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (serialized) {
    const serviceAccount = JSON.parse(serialized) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    return initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replaceAll("\\n", "\n"),
      }),
    });
  }
  return initializeApp({ projectId: "film-room-b7780" });
}

const adminApp = getOrCreateAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminFirestore = getFirestore(adminApp);

export type VerifiedTeamActor = {
  uid: string;
  role: "owner" | "admin" | "coach" | "parent" | "player" | "viewer";
  canCoach: boolean;
};

export async function requireVerifiedTeamActor(
  request: Request,
  teamId: string,
): Promise<VerifiedTeamActor> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) throw new Error("AUTH_REQUIRED");
  const decoded = await adminAuth.verifyIdToken(token);
  const team = await adminFirestore.collection("teams").doc(teamId).get();
  if (!team.exists) throw new Error("TEAM_NOT_FOUND");
  const data = team.data() ?? {};
  const members =
    data.members && typeof data.members === "object"
      ? (data.members as Record<string, string>)
      : {};
  const role =
    data.ownerId === decoded.uid
      ? "owner"
      : members[decoded.uid];
  if (
    role !== "owner" &&
    role !== "admin" &&
    role !== "coach" &&
    role !== "parent" &&
    role !== "player" &&
    role !== "viewer"
  ) {
    throw new Error("TEAM_ACCESS_DENIED");
  }
  return {
    uid: decoded.uid,
    role,
    canCoach: role === "owner" || role === "admin" || role === "coach",
  };
}
