import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { updateTeam } from "@/lib/teams";

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type ResolvedLogoFile = {
  contentType: string;
  ext: "png" | "jpg" | "webp" | "gif";
};

/** Resolve MIME type and extension (Safari often leaves file.type empty). */
export function resolveLogoFile(file: Pick<File, "name" | "type">): ResolvedLogoFile {
  const type = file.type.trim().toLowerCase();
  if (type === "image/png") return { contentType: type, ext: "png" };
  if (type === "image/jpeg" || type === "image/jpg") {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (type === "image/webp") return { contentType: type, ext: "webp" };
  if (type === "image/gif") return { contentType: type, ext: "gif" };

  const lower = file.name.trim().toLowerCase();
  if (lower.endsWith(".png")) return { contentType: "image/png", ext: "png" };
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (lower.endsWith(".webp")) return { contentType: "image/webp", ext: "webp" };
  if (lower.endsWith(".gif")) return { contentType: "image/gif", ext: "gif" };

  throw new Error("Logo must be PNG, JPG, WebP, or GIF.");
}

function storageErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown };
    const code = typeof o.code === "string" ? o.code : "";
    if (code === "storage/unauthorized") {
      return "Storage permission denied — ask a team admin to upload the logo, or redeploy Firebase Storage rules.";
    }
    if (code === "storage/canceled") {
      return "Upload was canceled.";
    }
    const msg = typeof o.message === "string" ? o.message.trim() : "";
    if (msg && code) return `${msg} (${code})`;
    if (msg) return msg;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/** Upload a team logo and persist its download URL on the team doc. */
export async function uploadTeamLogo(
  teamId: string,
  file: File,
): Promise<string> {
  const resolved = resolveLogoFile(file);
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo must be 2 MB or smaller.");
  }

  const path = `teams/${teamId}/logo.${resolved.ext}`;
  const storageRef = ref(storage, path);
  try {
    await uploadBytes(storageRef, file, { contentType: resolved.contentType });
    const url = await getDownloadURL(storageRef);
    await updateTeam(teamId, { logoUrl: url });
    return url;
  } catch (err) {
    throw new Error(storageErrorMessage(err, "Could not upload logo."));
  }
}
