import "server-only";

const FOLDER_MIME = "application/vnd.google-apps.folder";

async function driveJson<T>(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Drive API ${res.status}${text ? `: ${text.slice(0, 240)}` : ""}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type DriveListedFile = {
  id: string;
  name: string;
  mimeType?: string;
};

/** Non-trashed files directly in a folder (not recursive). */
export async function listDriveFolderFiles(opts: {
  accessToken: string;
  folderId: string;
  pageSize?: number;
}): Promise<DriveListedFile[]> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 100, 1), 200);
  const out: DriveListedFile[] = [];
  let pageToken: string | undefined;
  do {
    const q = [
      `'${opts.folderId}' in parents`,
      "trashed = false",
      `mimeType != 'application/vnd.google-apps.folder'`,
    ].join(" and ");
    const params = new URLSearchParams({
      q,
      spaces: "drive",
      fields: "nextPageToken,files(id,name,mimeType)",
      pageSize: String(pageSize),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const json = await driveJson<{
      files?: Array<{ id?: string; name?: string; mimeType?: string }>;
      nextPageToken?: string;
    }>(
      opts.accessToken,
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    );
    for (const f of json.files ?? []) {
      const id = typeof f.id === "string" ? f.id.trim() : "";
      const name = typeof f.name === "string" ? f.name.trim() : "";
      if (!id || !name) continue;
      out.push({
        id,
        name,
        ...(typeof f.mimeType === "string" ? { mimeType: f.mimeType } : {}),
      });
    }
    pageToken = json.nextPageToken?.trim() || undefined;
  } while (pageToken && out.length < 400);
  return out;
}

async function listDriveChildFolders(opts: {
  accessToken: string;
  folderId: string;
}): Promise<Array<{ id: string; name: string }>> {
  const out: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;
  do {
    const q = [
      `'${opts.folderId}' in parents`,
      "trashed = false",
      `mimeType = '${FOLDER_MIME}'`,
    ].join(" and ");
    const params = new URLSearchParams({
      q,
      spaces: "drive",
      fields: "nextPageToken,files(id,name)",
      pageSize: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const json = await driveJson<{
      files?: Array<{ id?: string; name?: string }>;
      nextPageToken?: string;
    }>(
      opts.accessToken,
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    );
    for (const f of json.files ?? []) {
      const id = typeof f.id === "string" ? f.id.trim() : "";
      const name = typeof f.name === "string" ? f.name.trim() : "";
      if (id && name) out.push({ id, name });
    }
    pageToken = json.nextPageToken?.trim() || undefined;
  } while (pageToken && out.length < 200);
  return out;
}

/**
 * Walk a Drive folder tree for ordinary files (default depth 4, max 500 files).
 */
export async function listDriveFolderFilesRecursive(opts: {
  accessToken: string;
  folderId: string;
  maxDepth?: number;
  maxFiles?: number;
}): Promise<DriveListedFile[]> {
  const maxDepth = Math.min(Math.max(opts.maxDepth ?? 4, 1), 6);
  const maxFiles = Math.min(Math.max(opts.maxFiles ?? 500, 50), 1000);
  const out: DriveListedFile[] = [];
  const seenFolders = new Set<string>();

  async function walk(folderId: string, depth: number): Promise<void> {
    if (depth > maxDepth || out.length >= maxFiles) return;
    if (seenFolders.has(folderId)) return;
    seenFolders.add(folderId);

    const files = await listDriveFolderFiles({
      accessToken: opts.accessToken,
      folderId,
      pageSize: 100,
    });
    for (const f of files) {
      out.push(f);
      if (out.length >= maxFiles) return;
    }
    if (depth >= maxDepth) return;
    const kids = await listDriveChildFolders({
      accessToken: opts.accessToken,
      folderId,
    });
    for (const kid of kids) {
      await walk(kid.id, depth + 1);
      if (out.length >= maxFiles) return;
    }
  }

  await walk(opts.folderId, 1);
  return out;
}

function escapeDriveQueryLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Drive-wide name search (user's Drive) for files whose name contains `needle`.
 */
export async function searchDriveFilesByNameContains(opts: {
  accessToken: string;
  needle: string;
  pageSize?: number;
}): Promise<DriveListedFile[]> {
  const needle = opts.needle.trim();
  if (needle.length < 3) return [];
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 100);
  const out: DriveListedFile[] = [];
  let pageToken: string | undefined;
  do {
    const q = [
      `name contains '${escapeDriveQueryLiteral(needle)}'`,
      "trashed = false",
      `mimeType != 'application/vnd.google-apps.folder'`,
    ].join(" and ");
    const params = new URLSearchParams({
      q,
      spaces: "drive",
      fields: "nextPageToken,files(id,name,mimeType)",
      pageSize: String(pageSize),
      corpora: "user",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const json = await driveJson<{
      files?: Array<{ id?: string; name?: string; mimeType?: string }>;
      nextPageToken?: string;
    }>(
      opts.accessToken,
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    );
    for (const f of json.files ?? []) {
      const id = typeof f.id === "string" ? f.id.trim() : "";
      const name = typeof f.name === "string" ? f.name.trim() : "";
      if (!id || !name) continue;
      out.push({
        id,
        name,
        ...(typeof f.mimeType === "string" ? { mimeType: f.mimeType } : {}),
      });
    }
    pageToken = json.nextPageToken?.trim() || undefined;
  } while (pageToken && out.length < 200);
  return out;
}

export async function downloadDriveFileJson(opts: {
  accessToken: string;
  fileId: string;
}): Promise<unknown> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(opts.fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${opts.accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Drive download ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  const text = await res.text();
  return JSON.parse(text) as unknown;
}

export async function findChildFolder(opts: {
  accessToken: string;
  parentId: string;
  name: string;
}): Promise<string | null> {
  const q = [
    `'${opts.parentId}' in parents`,
    `name = '${opts.name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
  ].join(" and ");
  const url =
    "https://www.googleapis.com/drive/v3/files?" +
    new URLSearchParams({
      q,
      spaces: "drive",
      fields: "files(id,name)",
      pageSize: "1",
    }).toString();
  const json = await driveJson<{ files?: Array<{ id?: string }> }>(
    opts.accessToken,
    url,
  );
  const id = json.files?.[0]?.id?.trim();
  return id || null;
}

export async function createFolder(opts: {
  accessToken: string;
  name: string;
  parentId?: string;
}): Promise<string> {
  const body: { name: string; mimeType: string; parents?: string[] } = {
    name: opts.name,
    mimeType: FOLDER_MIME,
  };
  if (opts.parentId) body.parents = [opts.parentId];
  const json = await driveJson<{ id?: string }>(
    opts.accessToken,
    "https://www.googleapis.com/drive/v3/files",
    { method: "POST", body: JSON.stringify(body) },
  );
  const id = json.id?.trim();
  if (!id) throw new Error("Drive did not return a folder id.");
  return id;
}

export async function ensureChildFolder(opts: {
  accessToken: string;
  parentId: string;
  name: string;
}): Promise<string> {
  const existing = await findChildFolder(opts);
  if (existing) return existing;
  return createFolder({
    accessToken: opts.accessToken,
    name: opts.name,
    parentId: opts.parentId,
  });
}

/** Root “My Drive” is represented as parent `root` in the Drive API. */
export async function ensureTeamVaultRoot(opts: {
  accessToken: string;
  teamName: string;
}): Promise<string> {
  const filmRoom = await ensureChildFolder({
    accessToken: opts.accessToken,
    parentId: "root",
    name: "Film Room",
  });
  const safeName = opts.teamName.trim() || "Team";
  return ensureChildFolder({
    accessToken: opts.accessToken,
    parentId: filmRoom,
    name: safeName,
  });
}

/**
 * Personal vault: Film Room / My Film /
 * Inbox uploads land in Film Room / My Film / Inbox /
 */
export async function ensureUserVaultRoot(opts: {
  accessToken: string;
}): Promise<string> {
  const filmRoom = await ensureChildFolder({
    accessToken: opts.accessToken,
    parentId: "root",
    name: "Film Room",
  });
  return ensureChildFolder({
    accessToken: opts.accessToken,
    parentId: filmRoom,
    name: "My Film",
  });
}

export async function ensureUserInboxFolder(opts: {
  accessToken: string;
  rootFolderId: string;
}): Promise<string> {
  return ensureChildFolder({
    accessToken: opts.accessToken,
    parentId: opts.rootFolderId,
    name: "Inbox",
  });
}

export { gameFolderDisplayName } from "@/lib/drive/naming";
