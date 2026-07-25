import "server-only";

import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { Innertube } from "youtubei.js";

export const AUDIO_SYNC_SAMPLE_RATE = 16000;

/** Clients that often return direct googlevideo URLs (no decipher). */
const STREAM_CLIENTS = ["ANDROID_VR", "TV", "ANDROID"] as const;

function ffmpegPath(): string {
  if (!ffmpegStatic) throw new Error("ffmpeg-static binary not found.");
  return ffmpegStatic;
}

function runFfmpegToFloat32(args: string[]): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        const errText = Buffer.concat(errChunks).toString("utf8").slice(-800);
        reject(new Error(`ffmpeg failed (${code}): ${errText || "no stderr"}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      if (buf.byteLength < AUDIO_SYNC_SAMPLE_RATE * 4) {
        reject(new Error("ffmpeg produced too little audio."));
        return;
      }
      const samples = new Float32Array(
        buf.buffer,
        buf.byteOffset,
        Math.floor(buf.byteLength / 4),
      );
      resolve(samples.slice());
    });
  });
}

let innertubePromise: Promise<Innertube> | null = null;

function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) {
    innertubePromise = Innertube.create({ retrieve_player: true });
  }
  return innertubePromise;
}

async function streamingAudioUrl(videoId: string): Promise<string> {
  const yt = await getInnertube();
  let lastError: unknown;

  for (const client of STREAM_CLIENTS) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      const audioFormats = (info.streaming_data?.adaptive_formats ?? [])
        .filter((f) => f.has_audio && !f.has_video && typeof f.url === "string")
        .sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0));
      const url = audioFormats[0]?.url;
      if (url) return url;
    } catch (err) {
      lastError = err;
    }
  }

  // Last resort: default download path (may fail when YouTube rotates nsig).
  try {
    const format = await yt.getStreamingData(videoId, {
      type: "audio",
      quality: "bestefficiency",
    });
    const url =
      (typeof format.url === "string" && format.url) ||
      (await format.decipher(yt.session.player));
    if (url) return url;
  } catch (err) {
    lastError = err;
  }

  const detail =
    lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(
    `Could not get a YouTube audio stream for ${videoId}.${detail ? ` (${detail})` : ""}`,
  );
}

/**
 * Decode a mono float32 PCM window from a YouTube video via ffmpeg + Innertube.
 * Works for public and typically unlisted videos when you have the id.
 */
export async function extractYoutubePcmWindow(input: {
  videoId: string;
  /** Start time within the YouTube video (seconds). */
  startSec?: number;
  /** Window length (seconds). */
  durationSec?: number;
}): Promise<Float32Array> {
  const videoId = input.videoId.trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error("Invalid YouTube video id.");
  }
  const startSec = Math.max(0, input.startSec ?? 45);
  const durationSec = Math.min(180, Math.max(20, input.durationSec ?? 90));

  const url = await streamingAudioUrl(videoId);

  // -ss after -i is slower but more accurate on googlevideo URLs that reject early seek.
  return runFfmpegToFloat32([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    url,
    "-ss",
    String(startSec),
    "-t",
    String(durationSec),
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(AUDIO_SYNC_SAMPLE_RATE),
    "-f",
    "f32le",
    "pipe:1",
  ]);
}
