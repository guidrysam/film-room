"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  ANGLE_SLOTS,
  ANGLE_SLOT_LABELS,
  type AngleSlot,
  labelForAngleSlot,
} from "@/lib/drive/angle-slots";
import {
  addGameSourceFromDriveUpload,
  bootstrapGameAccessForAttach,
  type Game,
} from "@/lib/games";
import { estimateClockSync } from "@/lib/game-timeline";
import { createUploadJob, updateUploadJob } from "@/lib/upload-jobs";
import { uploadVideoToDrive } from "@/lib/google-drive-upload";
import type { Team } from "@/lib/teams";
import {
  readVideoCaptureTime,
  type CaptureTimeResult,
} from "@/lib/video-capture-time";

export type GameCapVaultUploadProps = {
  game: Game;
  team?: Team | null;
  /** True when the signed-in user connected My Film Drive. */
  userDriveConnected?: boolean;
  currentUid: string;
  currentDisplayName?: string | null;
  /** Preselect slot from query `?angle=main`. */
  initialAngleSlot?: AngleSlot | null;
  onComplete?: () => void;
};

type UploadPhase =
  | "idle"
  | "authorizing"
  | "uploading"
  | "attaching"
  | "complete"
  | "failed";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

const slotChip =
  "rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

/**
 * Upload a kit angle into your personal Drive (My Film) and attach as a game source.
 * Team vault is only used if personal Drive is not connected.
 */
export default function GameCapVaultUpload({
  game,
  team,
  userDriveConnected = false,
  currentUid,
  currentDisplayName,
  initialAngleSlot,
  onComplete,
}: GameCapVaultUploadProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [angleSlot, setAngleSlot] = useState<AngleSlot>(
    initialAngleSlot ?? "main",
  );
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resultFileId, setResultFileId] = useState<string | null>(null);
  const [captureTime, setCaptureTime] = useState<CaptureTimeResult | null>(
    null,
  );

  const driveConnected =
    userDriveConnected || Boolean(team?.drive?.rootFolderId);

  const onFileChosen = useCallback(async (next: File | null) => {
    setFile(next);
    setError(null);
    setResultFileId(null);
    setPhase("idle");
    setProgressPct(0);
    if (!next) {
      setCaptureTime(null);
      return;
    }
    try {
      setCaptureTime(await readVideoCaptureTime(next));
    } catch {
      setCaptureTime(null);
    }
  }, []);

  const startUpload = useCallback(async () => {
    if (!user || !file) return;
    if (!driveConnected) {
      setError("Connect Google Drive in My Film first.");
      return;
    }

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setPhase("authorizing");
    setError(null);
    setProgressPct(0);
    setResultFileId(null);

    let jobId: string | null = null;
    try {
      await bootstrapGameAccessForAttach(game, currentUid);

      const idToken = await user.getIdToken();
      const sessionRes = await fetch("/api/drive/upload-session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameId: game.id,
          angleSlot,
          fileName: file.name,
          mimeType: file.type || "video/mp4",
          sizeBytes: file.size,
        }),
        signal: abort.signal,
      });
      const session = (await sessionRes.json().catch(() => null)) as {
        accessToken?: string;
        rawFolderId?: string;
        uploadName?: string;
        angleLabel?: string;
        error?: string;
      } | null;
      if (!sessionRes.ok || !session?.accessToken || !session.rawFolderId) {
        throw new Error(session?.error || "Could not start Drive upload.");
      }

      jobId = await createUploadJob(currentUid, {
        gameId: game.id,
        ...(team?.id ? { teamId: team.id } : {}),
        label: session.angleLabel || labelForAngleSlot(angleSlot),
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type || "video/mp4",
        createdBy: currentUid,
        ...(currentDisplayName
          ? { createdByName: currentDisplayName }
          : {}),
      });

      setPhase("uploading");
      const uploaded = await uploadVideoToDrive({
        accessToken: session.accessToken,
        file,
        parentFolderId: session.rawFolderId,
        name: session.uploadName || file.name,
        signal: abort.signal,
        onProgress: (p) => {
          setProgressPct(p.pct);
          if (jobId) {
            void updateUploadJob(currentUid, jobId, {
              status: "uploading",
              progressPct: p.pct,
            });
          }
        },
      });

      setPhase("attaching");
      const clockSync =
        captureTime && game.scheduledStartAt
          ? estimateClockSync(game, {
              recordedStartTime: captureTime.recordedStartTime,
            })
          : null;

      const sourceId = await addGameSourceFromDriveUpload(game.id, currentUid, {
        driveFileId: uploaded.fileId,
        label: session.angleLabel || labelForAngleSlot(angleSlot),
        angleSlot,
        createdByName: currentDisplayName ?? undefined,
        ...(captureTime
          ? { recordedStartTime: captureTime.recordedStartTime }
          : {}),
        ...(clockSync
          ? {
              offsetFromGameTime: clockSync.offsetFromGameTime,
              syncStatus: clockSync.syncStatus,
              syncConfidence: clockSync.syncConfidence,
            }
          : {}),
      });

      if (jobId) {
        await updateUploadJob(currentUid, jobId, {
          status: "complete",
          progressPct: 100,
          sourceId,
        });
      }

      setResultFileId(uploaded.fileId);
      setPhase("complete");
      setProgressPct(100);
      onComplete?.();
    } catch (e) {
      if (abort.signal.aborted) {
        setPhase("idle");
        setError("Upload cancelled.");
      } else {
        const msg = e instanceof Error ? e.message : "Upload failed.";
        setError(msg);
        setPhase("failed");
        if (jobId) {
          void updateUploadJob(currentUid, jobId, {
            status: "failed",
            error: msg,
          });
        }
      }
    }
  }, [
    user,
    file,
    driveConnected,
    game,
    currentUid,
    angleSlot,
    captureTime,
    currentDisplayName,
    onComplete,
  ]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  if (!driveConnected) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-3 text-sm text-amber-100">
        <p className="font-medium">Connect your Drive</p>
        <p className="mt-1 text-xs text-amber-200/90">
          Film uploads use your personal Google Drive.{" "}
          <a className="underline hover:text-white" href="/app/film">
            Connect in My Film
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Angle slot
        </p>
        <div className="flex flex-wrap gap-2">
          {ANGLE_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              disabled={phase === "uploading" || phase === "authorizing"}
              onClick={() => setAngleSlot(slot)}
              className={`${slotChip} ${
                angleSlot === slot
                  ? "border-blue-500/50 bg-blue-950/35 text-white"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
              }`}
            >
              {ANGLE_SLOT_LABELS[slot]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mov,.mp4,.m4v"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            void onFileChosen(f);
          }}
        />
        <button
          type="button"
          className={ghostBtn}
          disabled={phase === "uploading" || phase === "authorizing"}
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? "Choose a different file" : "Choose video file"}
        </button>
        {file ? (
          <p className="mt-2 text-xs text-zinc-400">
            {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB →{" "}
            {labelForAngleSlot(angleSlot)}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {phase === "uploading" || phase === "authorizing" || phase === "attaching" ? (
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-blue-500 transition-[width]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-zinc-400">
            {phase === "authorizing"
              ? "Preparing vault upload…"
              : phase === "attaching"
                ? "Attaching to game…"
                : `Uploading to Drive… ${progressPct}%`}
          </p>
          <button type="button" className={ghostBtn} onClick={cancel}>
            Cancel
          </button>
        </div>
      ) : null}

      {phase === "complete" && resultFileId ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-200">
          Uploaded {labelForAngleSlot(angleSlot)}.{" "}
          <a
            className="underline hover:text-white"
            href={`https://drive.google.com/file/d/${encodeURIComponent(resultFileId)}/view`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Drive
          </a>
        </div>
      ) : null}

      {phase === "idle" || phase === "failed" || phase === "complete" ? (
        <button
          type="button"
          className={primaryBtn}
          disabled={!file}
          onClick={() => void startUpload()}
        >
          Upload to team vault
        </button>
      ) : null}

      {team?.drive?.rootFolderId ? (
        <p className="text-[11px] text-zinc-500">
          Vault:{" "}
          <a
            className="text-zinc-400 underline hover:text-zinc-200"
            href={`https://drive.google.com/drive/folders/${encodeURIComponent(
              game.driveFolderId || team.drive.rootFolderId,
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            {game.driveFolderId ? "Open game folder" : "Open team vault"}
          </a>
        </p>
      ) : null}
    </div>
  );
}
