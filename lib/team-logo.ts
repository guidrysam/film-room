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

/** Upload a team logo and persist its download URL on the team doc. */
export async function uploadTeamLogo(
  teamId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    throw new Error("Logo must be PNG, JPG, WebP, or GIF.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo must be 2 MB or smaller.");
  }
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  const path = `teams/${teamId}/logo.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  await updateTeam(teamId, { logoUrl: url });
  return url;
}
