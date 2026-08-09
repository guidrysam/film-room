import { adminFirestore } from "@/lib/firebase-admin";
import { requireBearerUid } from "@/lib/ai/auth";
import { readUserDrivePublicConfig } from "@/lib/drive/user-vault";
import { readUserYouTubeUploadPublic } from "@/lib/youtube/user-upload-oauth";

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
 * Catalog for Game Cap Mac client.
 * Personal inbox upload works when `inbox.driveConnected` is true —
 * games list may be empty without blocking upload.
 *
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

    const userDrive = await readUserDrivePublicConfig(uid);
    const userYouTube = await readUserYouTubeUploadPublic(uid);
    const inboxSnap = await adminFirestore
      .collection("users")
      .doc(uid)
      .collection("filmSources")
      .orderBy("createdAt", "desc")
      .limit(8)
      .get()
      .catch(() => null);

    const recentInbox =
      inboxSnap?.docs.map((d) => {
        const data = d.data() ?? {};
        return {
          id: d.id,
          label:
            typeof data.label === "string" && data.label.trim()
              ? data.label.trim()
              : d.id,
          organizeKind:
            data.organizeKind === "game" ||
            data.organizeKind === "practice" ||
            data.organizeKind === "other"
              ? data.organizeKind
              : "other",
          status:
            typeof data.status === "string" ? data.status : "ready",
          kind: data.kind === "youtube" ? "youtube" : "upload",
        };
      }) ?? [];

    return Response.json({
      teams,
      inbox: {
        driveConnected: Boolean(userDrive?.rootFolderId),
        rootFolderId: userDrive?.rootFolderId ?? null,
        inboxFolderId: userDrive?.inboxFolderId ?? null,
        accountEmail: userDrive?.accountEmail ?? null,
        /** Prefer this path: upload without gameId when true. */
        uploadWithoutGame: Boolean(userDrive?.rootFolderId),
        openPath: "/app/film",
        recent: recentInbox,
        youtubeUploadConnected: Boolean(userYouTube?.connectedAt),
        youtubeChannelTitle: userYouTube?.channelTitle ?? null,
      },
      /** Alias for Game Cap sync docs that expect userDrive. */
      userDrive: {
        driveConnected: Boolean(userDrive?.rootFolderId),
        uploadWithoutGame: Boolean(userDrive?.rootFolderId),
        inboxFolderId: userDrive?.inboxFolderId ?? null,
        rootFolderId: userDrive?.rootFolderId ?? null,
        youtubeUploadConnected: Boolean(userYouTube?.connectedAt),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "AUTH_REQUIRED") {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    console.error("[mac/catalog]", err);
    return Response.json({ error: "Failed to load catalog." }, { status: 500 });
  }
}
