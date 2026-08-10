import "server-only";

import { getUserVaultAccessToken } from "@/lib/drive/user-vault";
import { ensureChildFolder } from "@/lib/drive/folders";

export const MY_FILM_MUSIC_FOLDER = "Music";

/** Ensure Film Room / My Film / Music exists; return folder id + access token. */
export async function resolveUserMusicFolder(uid: string): Promise<{
  accessToken: string;
  musicFolderId: string;
  rootFolderId: string;
}> {
  const vault = await getUserVaultAccessToken(uid);
  const musicFolderId = await ensureChildFolder({
    accessToken: vault.accessToken,
    parentId: vault.rootFolderId,
    name: MY_FILM_MUSIC_FOLDER,
  });
  return {
    accessToken: vault.accessToken,
    musicFolderId,
    rootFolderId: vault.rootFolderId,
  };
}

/** Proxy a Drive file as a streaming Response (alt=media). */
export async function streamDriveFile(opts: {
  accessToken: string;
  driveFileId: string;
  mimeType?: string;
  fileName?: string;
}): Promise<Response> {
  const fileId = opts.driveFileId.trim();
  if (!fileId) {
    return Response.json({ error: "Missing Drive file id." }, { status: 400 });
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    },
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    return Response.json(
      {
        error:
          res.status === 404
            ? "Soundtrack file not found in Drive."
            : `Could not read soundtrack from Drive${detail ? `: ${detail}` : ""}.`,
      },
      { status: res.status === 404 ? 404 : 502 },
    );
  }
  const headers = new Headers();
  const mime =
    opts.mimeType?.trim() ||
    res.headers.get("content-type") ||
    "audio/mpeg";
  headers.set("Content-Type", mime);
  headers.set("Cache-Control", "private, max-age=300");
  if (opts.fileName?.trim()) {
    headers.set(
      "Content-Disposition",
      `inline; filename="${opts.fileName.replace(/"/g, "")}"`,
    );
  }
  const len = res.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new Response(res.body, { status: 200, headers });
}
