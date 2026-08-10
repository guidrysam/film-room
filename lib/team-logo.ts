import { auth } from "@/lib/firebase";
import { updateTeam } from "@/lib/teams";

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
/** Keep under Firestore field limits and share-payload size. */
const MAX_LOGO_DATA_URL_CHARS = 180_000;
const LOGO_MAX_PX = 512;

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

function firestoreErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown };
    const code = typeof o.code === "string" ? o.code : "";
    const msg = typeof o.message === "string" ? o.message.trim() : "";
    if (code === "permission-denied") {
      return "Permission denied — you need to be a team coach or parent to save the logo.";
    }
    if (msg && code) return `${msg} (${code})`;
    if (msg) return msg;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

async function loadImageFromFile(file: File): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to HTMLImageElement */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file."));
    };
    img.src = url;
  });
}

/** Resize and compress a logo for storage on the team Firestore doc. */
export async function resizeLogoToDataUrl(file: File): Promise<string> {
  resolveLogoFile(file);
  const source = await loadImageFromFile(file);
  const srcW =
    "width" in source && typeof source.width === "number" ? source.width : 1;
  const srcH =
    "height" in source && typeof source.height === "number" ? source.height : 1;
  const scale = Math.min(1, LOGO_MAX_PX / Math.max(srcW, srcH, 1));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare logo image.");
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source && typeof source.close === "function") {
    source.close();
  }

  let quality = 0.88;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_LOGO_DATA_URL_CHARS && quality > 0.45) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > MAX_LOGO_DATA_URL_CHARS) {
    throw new Error("Logo is too detailed — try a simpler square image.");
  }
  return dataUrl;
}

export type LogoUploadStage = "auth" | "prepare" | "save";

/** Save a team logo on the team doc (resized client-side, no Storage upload). */
export async function uploadTeamLogo(
  teamId: string,
  file: File,
  onStage?: (stage: LogoUploadStage) => void,
): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Logo must be 2 MB or smaller.");
  }

  onStage?.("auth");
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sign in to upload a logo.");
  }
  await user.getIdToken(true);

  try {
    onStage?.("prepare");
    const dataUrl = await resizeLogoToDataUrl(file);
    onStage?.("save");
    await updateTeam(teamId, { logoUrl: dataUrl });
    return dataUrl;
  } catch (err) {
    throw new Error(firestoreErrorMessage(err, "Could not upload logo."));
  }
}
