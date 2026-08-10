/** Highlight reel soundtrack uploaded to personal Drive (My Film / Music). */

export type HighlightSoundtrack = {
  driveFileId: string;
  name: string;
  mimeType?: string;
  /** Wall-clock seconds — the length we shoot the reel for. */
  durationSec: number;
};

const AUDIO_MIME_PREFIXES = ["audio/"] as const;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i;

export function isHighlightAudioFile(file: Pick<File, "name" | "type">): boolean {
  const mime = file.type.trim().toLowerCase();
  if (AUDIO_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  return AUDIO_EXT.test(file.name);
}

export function guessAudioMimeType(file: Pick<File, "name" | "type">): string {
  const mime = file.type.trim();
  if (mime) return mime;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg") || lower.endsWith(".opus")) return "audio/ogg";
  if (lower.endsWith(".flac")) return "audio/flac";
  return "audio/mpeg";
}

export function normalizeHighlightSoundtrack(
  raw: unknown,
): HighlightSoundtrack | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const driveFileId =
    typeof o.driveFileId === "string" ? o.driveFileId.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const durationSec =
    typeof o.durationSec === "number" && Number.isFinite(o.durationSec)
      ? Math.max(0, o.durationSec)
      : NaN;
  if (!driveFileId || !name || !Number.isFinite(durationSec) || durationSec <= 0) {
    return null;
  }
  return {
    driveFileId,
    name,
    durationSec,
    ...(typeof o.mimeType === "string" && o.mimeType.trim()
      ? { mimeType: o.mimeType.trim() }
      : {}),
  };
}

/** Probe duration via a temporary object URL (browser only). */
export function probeAudioDurationSec(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => {
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      cleanup();
      if (!Number.isFinite(d) || d <= 0) {
        reject(new Error("Could not read song length."));
        return;
      }
      resolve(d);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Could not read this audio file."));
    };
    audio.src = url;
  });
}

/** How far the current reel is from the soundtrack target. */
export function soundtrackLengthDelta(
  reelSec: number,
  songSec: number,
): { deltaSec: number; ratio: number; status: "short" | "fit" | "long" } {
  const target = Math.max(0.1, songSec);
  const reel = Math.max(0, reelSec);
  const deltaSec = reel - target;
  const ratio = Math.min(1.5, reel / target);
  const abs = Math.abs(deltaSec);
  if (abs <= 1.5) return { deltaSec, ratio, status: "fit" };
  return {
    deltaSec,
    ratio,
    status: deltaSec < 0 ? "short" : "long",
  };
}
