#!/usr/bin/env node
/**
 * Local clean highlight render from Film Room clean-cut EDL.
 *
 * v1: mark-window highlight pack only (concat clip windows; no full-game multicam).
 *
 * Usage:
 *   node scripts/render-clean-highlight.mjs \
 *     --edl path/to/reel-edl.json \
 *     --raws ./raws \
 *     --out ./master.mp4
 *
 * Raw resolution (first match wins per row):
 *   1. {raws}/{driveFileId}.mov|.mp4|.mkv
 *   2. {raws}/{angleSlot}.mov|.mp4|.mkv   (main, goal_a, …)
 *   3. {raws}/{sourceId}.mov|.mp4|.mkv
 *
 * Optional Drive download (needs GOOGLE_DRIVE_ACCESS_TOKEN):
 *   --download-missing
 *
 * Requires: ffmpeg on PATH.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

function usage() {
  console.error(`Usage:
  node scripts/render-clean-highlight.mjs --edl <edl.json> --raws <dir> --out <master.mp4>
    [--handle <sec>] [--download-missing]

Environment:
  GOOGLE_DRIVE_ACCESS_TOKEN  Bearer token when using --download-missing
`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {
    edl: null,
    raws: null,
    out: null,
    handle: null,
    downloadMissing: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--edl") out.edl = argv[++i];
    else if (a === "--raws") out.raws = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--handle") out.handle = Number(argv[++i]);
    else if (a === "--download-missing") out.downloadMissing = true;
    else if (a === "-h" || a === "--help") usage();
    else {
      console.error(`Unknown arg: ${a}`);
      usage();
    }
  }
  if (!out.edl || !out.raws || !out.out) usage();
  return out;
}

const VIDEO_EXTS = [".mov", ".mp4", ".mkv", ".m4v", ".webm"];

function findRaw(rawsDir, row) {
  const keys = [
    row.driveFileId,
    row.angleSlot,
    row.sourceId,
  ].filter((k) => typeof k === "string" && k.trim());

  for (const key of keys) {
    for (const ext of VIDEO_EXTS) {
      const p = join(rawsDir, `${key}${ext}`);
      if (existsSync(p)) return p;
    }
  }

  // Fuzzy: any file starting with key
  try {
    const files = readdirSync(rawsDir);
    for (const key of keys) {
      const hit = files.find(
        (f) =>
          f === key ||
          f.startsWith(`${key}.`) ||
          f.startsWith(`${key}_`),
      );
      if (hit) return join(rawsDir, hit);
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function downloadDriveRange(fileId, destPath, startSec, endSec) {
  // Drive API does not support byte-range by time; download full file then ffmpeg cut.
  const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "GOOGLE_DRIVE_ACCESS_TOKEN required for --download-missing",
    );
  }
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Drive download failed (${res.status}) for ${fileId}: ${text.slice(0, 200)}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return destPath;
}

function runFfmpeg(args) {
  const r = spawnSync("ffmpeg", ["-y", ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || "ffmpeg failed");
    throw new Error(`ffmpeg exited ${r.status}`);
  }
}

function cutClip(inputPath, startSec, endSec, outPath) {
  const dur = Math.max(0.1, endSec - startSec);
  runFfmpeg([
    "-ss",
    String(Math.max(0, startSec)),
    "-i",
    inputPath,
    "-t",
    String(dur),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outPath,
  ]);
}

async function main() {
  const args = parseArgs(process.argv);
  const edlPath = resolve(args.edl);
  const rawsDir = resolve(args.raws);
  const outPath = resolve(args.out);

  if (!existsSync(edlPath)) {
    console.error(`EDL not found: ${edlPath}`);
    process.exit(1);
  }
  if (!existsSync(rawsDir)) {
    mkdirSync(rawsDir, { recursive: true });
  }

  const edl = JSON.parse(readFileSync(edlPath, "utf8"));
  if (edl.schema !== "film_room_clean_edl_v1" || !Array.isArray(edl.rows)) {
    console.error("Invalid EDL: expected schema film_room_clean_edl_v1 with rows[]");
    process.exit(1);
  }

  const handle =
    typeof args.handle === "number" && Number.isFinite(args.handle)
      ? Math.max(0, args.handle)
      : typeof edl.handleSec === "number"
        ? Math.max(0, edl.handleSec)
        : 1;

  const workDir = join(
    tmpdir(),
    `film-room-edl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(workDir, { recursive: true });

  const clipPaths = [];
  let i = 0;
  for (const row of edl.rows) {
    i += 1;
    const start = Math.max(0, Number(row.sourceStartTime) - handle);
    const end = Math.max(start + 0.1, Number(row.sourceEndTime) + handle);
    let raw = findRaw(rawsDir, row);

    if (!raw && args.downloadMissing && row.driveFileId) {
      const dest = join(rawsDir, `${row.driveFileId}.mp4`);
      console.log(`Downloading Drive ${row.driveFileId} → ${dest}`);
      await downloadDriveRange(row.driveFileId, dest, start, end);
      raw = dest;
    }

    if (!raw) {
      console.error(
        `Missing raw for row ${i} (driveFileId=${row.driveFileId ?? "—"} angleSlot=${row.angleSlot ?? "—"} sourceId=${row.sourceId}). Place file under ${rawsDir} or use --download-missing.`,
      );
      rmSync(workDir, { recursive: true, force: true });
      process.exit(1);
    }

    const repeat = Math.max(1, Math.min(10, Math.round(Number(row.repeat) || 1)));
    const speed = Number(row.speed) > 0 ? Number(row.speed) : 1;

    for (let r = 0; r < repeat; r++) {
      const clip = join(workDir, `clip_${String(i).padStart(3, "0")}_${r}.mp4`);
      console.log(
        `Cut ${basename(raw)} ${start.toFixed(2)}–${end.toFixed(2)}s → ${basename(clip)}`,
      );
      if (speed !== 1) {
        // Re-encode with tempo for non-1x (v1 simple: setpts only, audio atempo capped).
        const pts = 1 / speed;
        const atempo = Math.max(0.5, Math.min(2, speed));
        runFfmpeg([
          "-ss",
          String(start),
          "-i",
          raw,
          "-t",
          String(Math.max(0.1, end - start)),
          "-filter:v",
          `setpts=${pts}*PTS`,
          "-filter:a",
          `atempo=${atempo}`,
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "18",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          clip,
        ]);
      } else {
        cutClip(raw, start, end, clip);
      }
      clipPaths.push(clip);
    }
  }

  if (clipPaths.length === 0) {
    console.error("No clips to concat.");
    rmSync(workDir, { recursive: true, force: true });
    process.exit(1);
  }

  const listFile = join(workDir, "concat.txt");
  writeFileSync(
    listFile,
    clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n",
  );

  console.log(`Concat ${clipPaths.length} clips → ${outPath}`);
  runFfmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c",
    "copy",
    outPath,
  ]);

  rmSync(workDir, { recursive: true, force: true });
  console.log(`Done: ${outPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
