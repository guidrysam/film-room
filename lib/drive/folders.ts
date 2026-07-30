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

export { gameFolderDisplayName } from "@/lib/drive/naming";
