import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import { updateTeam } from "@/lib/teams";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 45_000;

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
      return "Storage permission denied. Sign out and back in, then try again.";
    }
    if (code === "storage/canceled") {
      return "Upload was canceled.";
    }
    if (code === "storage/retry-limit-exceeded") {
      return "Upload timed out — check your connection and try a smaller image.";
    }
    const msg = typeof o.message === "string" ? o.message.trim() : "";
    if (msg && code) return `${msg} (${code})`;
    if (msg) return msg;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

export type LogoUploadStage = "auth" | "upload" | "save";

/** Upload a team logo and persist its download URL on the team doc. */
export async function uploadTeamLogo(
  teamId: string,
  file: File,
  onStage?: (stage: LogoUploadStage) => void,
): Promise<string> {
  const resolved = resolveLogoFile(file);
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo must be 2 MB or smaller.");
  }

  onStage?.("auth");
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sign in to upload a logo.");
  }
  await user.getIdToken(true);

  const path = `teams/${teamId}/logo.${resolved.ext}`;
  const storageRef = ref(storage, path);

  try {
    onStage?.("upload");
    await withTimeout(
      uploadBytes(storageRef, file, { contentType: resolved.contentType }),
      UPLOAD_TIMEOUT_MS,
      "Upload timed out — try a smaller PNG or JPG under 2 MB.",
    );

    const url = await withTimeout(
      getDownloadURL(storageRef),
      10_000,
      "Could not get the logo URL after upload.",
    );

    onStage?.("save");
    await withTimeout(
      updateTeam(teamId, { logoUrl: url }),
      15_000,
      "Logo uploaded but saving to the team failed — try again.",
    );
    return url;
  } catch (err) {
    throw new Error(storageErrorMessage(err, "Could not upload logo."));
  }
}
