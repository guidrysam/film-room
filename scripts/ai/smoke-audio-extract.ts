/**
 * Smoke: extract PCM from a public YouTube id and print length.
 *   npx tsx scripts/ai/smoke-audio-extract.ts [--video VIDEO_ID]
 */
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { Innertube } from "youtubei.js";

const videoId = process.argv.includes("--video")
  ? process.argv[process.argv.indexOf("--video") + 1]
  : "jNQXAC9IVRw";

async function main() {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error("Need --video <11-char id>");
  }
  const ffmpegBin = ffmpegStatic;
  if (!ffmpegBin) throw new Error("no ffmpeg-static");
  const yt = await Innertube.create({ retrieve_player: true });
  const info = await yt.getBasicInfo(videoId, { client: "ANDROID_VR" });
  const audio = (info.streaming_data?.adaptive_formats ?? [])
    .filter((f) => f.has_audio && !f.has_video && f.url)
    .sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0));
  const url = audio[0]?.url;
  if (!url) throw new Error("no url");
  console.log("got stream, decoding 12s…");

  const pcm: Buffer = await new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpegBin,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        url,
        "-ss",
        "0",
        "-t",
        "12",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "f32le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(err).toString("utf8")));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });

  console.log(
    "ok bytes",
    pcm.byteLength,
    "sec",
    (pcm.byteLength / 4 / 16000).toFixed(2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
