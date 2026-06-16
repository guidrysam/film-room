"use client";

import { useCallback, useRef, useState } from "react";
import { getYouTubeUploadAccessToken } from "@/lib/auth-google";
import {
  addGameSourceFromYouTubeUpload,
  type Game,
} from "@/lib/games";
import { createUploadJob, updateUploadJob } from "@/lib/upload-jobs";
import type { Team } from "@/lib/teams";
import {
  buildYouTubeUploadDescription,
  buildYouTubeUploadTitle,
  uploadVideoToYouTube,
} from "@/lib/youtube-upload";
import {
  fetchYouTubeVideoMetaWithRetry,
  isYouTubeVideoProcessing,
  metaToSourcePatch,
} from "@/lib/youtube-video-meta-client";

export type GameCapUploadProps = {
  game: Game;
  team?: Team | null;
  currentUid: string;
  currentDisplayName?: string | null;
  onComplete?: () => void;
  onSwitchToPaste?: () => void;
};

const LABEL_SUGGESTIONS = [
  "Main sideline",
  "Parent cam",
  "Goal cam",
  "End zone",
  "Opposite sideline",
] as const;

const ONE_GB = 1024 * 1024 * 1024;

type UploadPhase =
  | "idle"
  | "authorizing"
  | "uploading"
  | "processing"
  | "complete"
  | "failed";

/**
 * Game Cap YouTube upload: pick a video file, upload to the signed-in user's
 * channel (unlisted + embeddable), attach as a Game source.
 */
export default function GameCapUpload({
  game,
  team,
  currentUid,
  currentDisplayName,
  onComplete,
  onSwitchToPaste,
}: GameCapUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resultVideoId, setResultVideoId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [youtubeStillProcessing, setYoutubeStillProcessing] = useState(false);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0] ?? null;
      setFile(picked);
      setError(null);
      if (phase === "complete" || phase === "failed") {
        setPhase("idle");
        setResultVideoId(null);
        setProgressPct(0);
        setYoutubeStillProcessing(false);
      }
    },
    [phase],
  );

  const handleUpload = useCallback(async () => {
    if (!file) {
      setError("Choose a video file first.");
      return;
    }
    const trimmedLabel = label.trim() || "Parent cam";
    setError(null);
    setYoutubeStillProcessing(false);
    setPhase("authorizing");
    setProgressPct(0);

    let activeJobId: string | null = null;
    try {
      const { accessToken } = await getYouTubeUploadAccessToken();

      activeJobId = await createUploadJob(currentUid, {
        gameId: game.id,
        teamId: game.teamId,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type || "video/*",
        label: trimmedLabel,
        createdBy: currentUid,
        ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
      });
      setJobId(activeJobId);

      const controller = new AbortController();
      abortRef.current = controller;

      setPhase("uploading");
      await updateUploadJob(currentUid, activeJobId, {
        status: "uploading",
        progressPct: 0,
      });

      const uploadResult = await uploadVideoToYouTube({
        accessToken,
        file,
        metadata: {
          title: buildYouTubeUploadTitle(game.title, trimmedLabel),
          description: buildYouTubeUploadDescription({
            teamName: team?.name,
            gameTitle: game.title,
            date: game.date,
          }),
        },
        signal: controller.signal,
        onProgress: ({ pct }) => {
          setProgressPct(pct);
          void updateUploadJob(currentUid, activeJobId!, {
            progressPct: pct,
          });
        },
      });

      setPhase("processing");
      await updateUploadJob(currentUid, activeJobId, {
        status: "processing",
        progressPct: 100,
        youtubeVideoId: uploadResult.videoId,
      });

      const meta = await fetchYouTubeVideoMetaWithRetry(uploadResult.videoId);
      const metaPatch = meta ? metaToSourcePatch(meta) : {};
      const stillProcessing = isYouTubeVideoProcessing(meta);

      await addGameSourceFromYouTubeUpload(game.id, currentUid, {
        videoId: uploadResult.videoId,
        label: trimmedLabel,
        ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
        ...metaPatch,
        ...(metaPatch.youtubePrivacyStatus
          ? {}
          : { youtubePrivacyStatus: "unlisted" }),
      });

      await updateUploadJob(currentUid, activeJobId, {
        status: "complete",
        progressPct: 100,
        youtubeVideoId: uploadResult.videoId,
      });

      setResultVideoId(uploadResult.videoId);
      setYoutubeStillProcessing(stillProcessing);
      setPhase("complete");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onComplete?.();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Upload failed. Try again.";
      setError(message);
      setPhase("failed");
      if (activeJobId) {
        void updateUploadJob(currentUid, activeJobId, {
          status: "failed",
          error: message,
        });
      }
    } finally {
      abortRef.current = null;
    }
  }, [
    file,
    label,
    currentUid,
    currentDisplayName,
    game,
    team,
    onComplete,
  ]);

  const busy =
    phase === "authorizing" ||
    phase === "uploading" ||
    phase === "processing";

  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.02] p-2.5">
      <p className="mb-1.5 text-[10px] font-medium text-zinc-400">
        Upload to your YouTube channel
      </p>
      <p className="mb-1 text-[10px] leading-snug text-amber-200/90">
        Keep this tab open while uploading. Large videos may take time.
      </p>
      <p className="mb-2 text-[10px] leading-snug text-zinc-500">
        YouTube upload quota is limited during beta. If upload fails, paste a
        YouTube link instead.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        disabled={busy}
        onChange={handleFileChange}
        className="mb-2 block w-full text-[11px] text-zinc-300 file:mr-2 file:rounded-md file:border file:border-white/10 file:bg-zinc-900 file:px-2 file:py-1 file:text-[11px] file:font-medium file:text-zinc-200"
      />

      {file ? (
        <>
          <p className="mb-2 text-[10px] text-zinc-500">
            {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>
          {file.size > ONE_GB ? (
            <p className="mb-2 rounded-md border border-amber-500/30 bg-amber-950/25 px-2 py-1.5 text-[10px] leading-snug text-amber-200">
              Large uploads may take a long time. Keep this tab open and use
              Wi-Fi when possible.
            </p>
          ) : null}
        </>
      ) : null}

      <div className="mb-2 flex flex-wrap gap-1">
        {LABEL_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => setLabel(s)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-zinc-300 transition hover:bg-white/[0.09] disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
        placeholder="Label (e.g. Parent cam)"
        maxLength={60}
        className="mb-2 w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50 disabled:opacity-50"
      />

      {busy ? (
        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-400">
            <span>
              {phase === "authorizing"
                ? "Connecting to YouTube…"
                : phase === "processing"
                  ? "Attaching to game…"
                  : "Uploading…"}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {phase === "complete" && resultVideoId ? (
        <div className="mb-2 rounded-md border border-emerald-500/35 bg-emerald-950/30 px-2.5 py-2">
          <p className="text-[11px] font-medium text-emerald-100">
            {youtubeStillProcessing
              ? "Uploaded. YouTube is still processing."
              : "Upload complete — source attached"}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-emerald-200/80">
            {resultVideoId}
          </p>
          <p className="mt-1 text-[10px] text-emerald-200/70">
            {youtubeStillProcessing
              ? "Source attached — refresh metadata in Sources below once playback is ready."
              : "Unlisted on your YouTube channel. Open in Film Room below."}
          </p>
        </div>
      ) : null}

      {phase === "failed" && error ? (
        <div className="mb-2 rounded-md border border-rose-500/35 bg-rose-950/25 px-2.5 py-2">
          <p className="text-[11px] text-rose-200">{error}</p>
          {onSwitchToPaste ? (
            <button
              type="button"
              onClick={onSwitchToPaste}
              className="mt-1.5 text-[10px] font-semibold text-blue-300 underline-offset-2 hover:underline"
            >
              Paste a YouTube link instead
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void handleUpload()}
        disabled={busy || !file}
        className="rounded-md border border-blue-500/40 bg-blue-950/50 px-2.5 py-1 text-[11px] font-semibold text-blue-100 transition hover:bg-blue-900/55 disabled:opacity-40"
      >
        {busy
          ? phase === "authorizing"
            ? "Authorizing…"
            : phase === "processing"
              ? "Finishing…"
              : "Uploading…"
          : "Upload to YouTube"}
      </button>

      {jobId && phase !== "idle" ? (
        <p className="mt-1.5 text-[9px] text-zinc-600">
          Job {jobId.slice(0, 8)}…
        </p>
      ) : null}

      {error && phase !== "failed" ? (
        <p className="mt-2 text-[10px] text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
