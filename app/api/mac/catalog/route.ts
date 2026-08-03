import { adminFirestore } from "@/lib/firebase-admin";
import { requireBearerUid } from "@/lib/ai/auth";

export const runtime = "nodejs";

type CatalogGame = { id: string; title: string; date?: string };
type CatalogTeam = {
  id: string;
  name: string;
  role: string;
  driveConnected: boolean;
  games: CatalogGame[];
};

function roleOnTeam(
  uid: string,
  data: Record<string, unknown>,
): string | null {
  const members =
    data.members && typeof data.members === "object"
      ? (data.members as Record<string, string>)
      : {};
  if (data.ownerId === uid) return "owner";
  const role = members[uid];
  return typeof role === "string" ? role : null;
}

function canVaultUpload(role: string | null): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "coach" ||
    role === "parent"
  );
}

async function gamesForTeam(teamId: string): Promise<CatalogGame[]> {
  const gamesSnap = await adminFirestore
    .collection("games")
    .where("teamId", "==", teamId)
    .limit(40)
    .get();
  return gamesSnap.docs
    .map((g) => {
      const gd = g.data() ?? {};
      return {
        id: g.id,
        title:
          typeof gd.title === "string" && gd.title.trim()
            ? gd.title.trim()
            : g.id,
        ...(typeof gd.date === "string" ? { date: gd.date } : {}),
      };
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/**
 * List teams the signed-in user can vault-upload for, and recent games.
 * GET /api/mac/catalog
 */
export async function GET(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const byId = new Map<string, CatalogTeam>();

    const memberSnap = await adminFirestore
      .collection("teams")
      .where("memberUids", "array-contains", uid)
      .get();
    for (const doc of memberSnap.docs) {
      const data = doc.data() ?? {};
      const role = roleOnTeam(uid, data);
      if (!canVaultUpload(role)) continue;
      byId.set(doc.id, {
        id: doc.id,
        name:
          typeof data.name === "string" && data.name.trim()
            ? data.name.trim()
            : doc.id,
        role: role!,
        driveConnected: Boolean(
          data.drive &&
            typeof data.drive === "object" &&
            typeof (data.drive as { rootFolderId?: unknown }).rootFolderId ===
              "string",
        ),
        games: [],
      });
    }

    const ownedSnap = await adminFirestore
      .collection("teams")
      .where("ownerId", "==", uid)
      .get();
    for (const doc of ownedSnap.docs) {
      if (byId.has(doc.id)) continue;
      const data = doc.data() ?? {};
      byId.set(doc.id, {
        id: doc.id,
        name:
          typeof data.name === "string" && data.name.trim()
            ? data.name.trim()
            : doc.id,
        role: "owner",
        driveConnected: Boolean(
          data.drive &&
            typeof data.drive === "object" &&
            typeof (data.drive as { rootFolderId?: unknown }).rootFolderId ===
              "string",
        ),
        games: [],
      });
    }

    const teams = [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const team of teams) {
      try {
        team.games = await gamesForTeam(team.id);
      } catch {
        team.games = [];
      }
    }

    return Response.json({ teams });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "AUTH_REQUIRED") {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[mac/catalog]", err);
    return Response.json({ error: "Failed to load catalog." }, { status: 500 });
  }
}
