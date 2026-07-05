"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import YouTubeOnboarding from "@/components/YouTubeOnboarding";
import { getYouTubeOAuthAccessToken } from "@/lib/auth-google";
import {
  addGameSourceFromYouTubeUpload,
  updateGameSourceYouTubeMetadata,
  type Game,
} from "@/lib/games";
import { estimateClockSync } from "@/lib/game-timeline";
import { createUploadJob, updateUploadJob } from "@/lib/upload-jobs";
import type { Team } from "@/lib/teams";
import {
  captureSourceLabel,
  readVideoCaptureTime,
  type CaptureTimeResult,
} from "@/lib/video-capture-time";
import { setYouTubeVideoEmbeddable } from "@/lib/youtube-embeddable";
import { diagnoseFromYouTubeMeta } from "@/lib/youtube-playback-issue";
import YouTubePlaybackIssuePanel from "@/components/YouTubePlaybackIssuePanel";
import {
  buildYouTubeUploadDescription,
  buildYouTubeUploadTitle,
  uploadVideoToYouTube,
} from "@/lib/youtube-upload";
import {
  fetchYouTubeVideoMeta,
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
  const [resultSourceId, setResultSourceId] = useState<string | null>(null);
  const [resultPrivacy, setResultPrivacy] = useState<
    "private" | "unlisted" | "public"
  >("unlisted");
  // null = embeddability not yet confirmed (e.g. still processing).
  const [embeddable, setEmbeddable] = useState<boolean | null>(null);
  const [repairPhase, setRepairPhase] = useState<
    "idle" | "fixing" | "fixed" | "failed"
  >("idle");
  const [repairError, setRepairError] = useState<string | null>(null);
  const [captureTime, setCaptureTime] = useState<CaptureTimeResult | null>(null);
  const [autoAligned, setAutoAligned] = useState(false);

  const clockSyncPreview = useMemo(
    () =>
      captureTime && game.scheduledStartAt
        ? estimateClockSync(
            { scheduledStartAt: game.scheduledStartAt },
            { recordedStartTime: captureTime.recordedStartTime },
          )
        : null,
    [captureTime, game.scheduledStartAt],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0] ?? null;
      setFile(picked);
      setError(null);
      setCaptureTime(null);
      setAutoAligned(false);
      if (phase === "complete" || phase === "failed") {
        setPhase("idle");
        setResultVideoId(null);
        setProgressPct(0);
        setYoutubeStillProcessing(false);
        setResultSourceId(null);
        setEmbeddable(null);
        setRepairPhase("idle");
        setRepairError(null);
      }
      if (picked) {
        void readVideoCaptureTime(picked)
          .then((result) => setCaptureTime(result))
          .catch(() => setCaptureTime(null));
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
    setEmbeddable(null);
    setRepairPhase("idle");
    setRepairError(null);
    setResultSourceId(null);
    setAutoAligned(false);
    setPhase("authorizing");
    setProgressPct(0);

    let activeJobId: string | null = null;
    try {
      const { accessToken } = await getYouTubeOAuthAccessToken();

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
      const privacy = metaPatch.youtubePrivacyStatus ?? "unlisted";

      const clockSync =
        captureTime && game.scheduledStartAt
          ? estimateClockSync(
              { scheduledStartAt: game.scheduledStartAt },
              { recordedStartTime: captureTime.recordedStartTime },
            )
          : null;

      const sourceId = await addGameSourceFromYouTubeUpload(
        game.id,
        currentUid,
        {
          videoId: uploadResult.videoId,
          label: trimmedLabel,
          ...(currentDisplayName ? { createdByName: currentDisplayName } : {}),
          ...metaPatch,
          ...(metaPatch.youtubePrivacyStatus
            ? {}
            : { youtubePrivacyStatus: "unlisted" }),
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
        },
      );
      setAutoAligned(Boolean(clockSync));

      await updateUploadJob(currentUid, activeJobId, {
        status: "complete",
        progressPct: 100,
        youtubeVideoId: uploadResult.videoId,
      });

      setResultVideoId(uploadResult.videoId);
      setResultSourceId(sourceId);
      setResultPrivacy(privacy);
      setEmbeddable(
        typeof metaPatch.youtubeEmbeddable === "boolean"
          ? metaPatch.youtubeEmbeddable
          : null,
      );
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
    captureTime,
    onComplete,
  ]);

  const handleAutoFixEmbedding = useCallback(async () => {
    if (!resultVideoId) return;
    setRepairPhase("fixing");
    setRepairError(null);
    try {
      const { accessToken } = await getYouTubeOAuthAccessToken();
      const updated = await setYouTubeVideoEmbeddable({
        accessToken,
        videoId: resultVideoId,
        privacyStatus: resultPrivacy,
      });

      // Confirm with a fresh read; the update response may lag.
      let confirmed = updated.embeddable;
      if (confirmed !== true) {
        const meta = await fetchYouTubeVideoMeta(resultVideoId);
        if (typeof meta?.embeddable === "boolean") confirmed = meta.embeddable;
      }
      const nowEmbeddable = confirmed === true;
      setEmbeddable(nowEmbeddable);

      if (resultSourceId) {
        void updateGameSourceYouTubeMetadata(game.id, resultSourceId, {
          youtubeEmbeddable: nowEmbeddable,
        });
      }

      if (nowEmbeddable) {
        setRepairPhase("fixed");
      } else {
        setRepairPhase("failed");
        setRepairError(
          "Still blocked — this usually means your whole channel is set to " +
            "'Made for Kids'. Change the channel audience in YouTube Studio, " +
            "then tap Re-check.",
        );
      }
    } catch (e) {
      setRepairPhase("failed");
      setRepairError(
        e instanceof Error ? e.message : "Couldn't update the embed setting.",
      );
    }
  }, [resultVideoId, resultSourceId, resultPrivacy, game.id]);

  const handleRecheckEmbedding = useCallback(async () => {
    if (!resultVideoId) return;
    setRepairPhase("fixing");
    setRepairError(null);
    try {
      const meta = await fetchYouTubeVideoMeta(resultVideoId);
      const value =
        typeof meta?.embeddable === "boolean" ? meta.embeddable : null;
      setEmbeddable(value);
      if (resultSourceId && typeof value === "boolean") {
        void updateGameSourceYouTubeMetadata(game.id, resultSourceId, {
          youtubeEmbeddable: value,
        });
      }
      setRepairPhase(value === true ? "fixed" : "idle");
    } catch {
      setRepairPhase("idle");
    }
  }, [resultVideoId, resultSourceId, game.id]);

  const busy =
    phase === "authorizing" ||
    phase === "uploading" ||
    phase === "processing";
  const repairing = repairPhase === "fixing";

  const uploadDiagnosis = useMemo(() => {
    if (!resultVideoId || phase !== "complete") return null;
    return diagnoseFromYouTubeMeta(
      {
        videoId: resultVideoId,
        privacyStatus: resultPrivacy,
        embeddable: embeddable ?? undefined,
        uploadStatus: youtubeStillProcessing ? "uploaded" : "processed",
      },
      {
        videoId: resultVideoId,
        autoFixFailed: repairPhase === "failed",
      },
    );
  }, [
    resultVideoId,
    phase,
    resultPrivacy,
    embeddable,
    youtubeStillProcessing,
    repairPhase,
  ]);

  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.02] p-2.5">
      <YouTubeOnboarding currentUid={currentUid} />

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
      <p className="mb-2 text-[10px] leading-snug text-zinc-500">
        We upload it unlisted and embeddable so it plays inside Film Room. If
        your channel is set to &ldquo;Made for Kids&rdquo;, YouTube blocks
        embedding — we&rsquo;ll flag it and offer a one-tap fix after upload.
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
          {captureTime ? (
            <p className="mb-2 rounded-md border border-sky-500/25 bg-sky-950/20 px-2 py-1.5 text-[10px] leading-snug text-sky-200/90">
              Recording start detected{" "}
              {`(${captureSourceLabel(captureTime.source)})`}:{" "}
              {new Date(captureTime.recordedStartTime).toLocaleString()}
              {clockSyncPreview ? (
                <span className="mt-0.5 block text-sky-200/70">
                  Will auto-align to this game&rsquo;s timeline on upload.
                </span>
              ) : game.scheduledStartAt ? null : (
                <span className="mt-0.5 block text-zinc-400">
                  Set the game&rsquo;s scheduled start to auto-align clips.
                </span>
              )}
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

      {phase === "complete" && resultVideoId && uploadDiagnosis ? (
        <div className="mb-2">
          <p className="mb-1 font-mono text-[10px] text-zinc-400">{resultVideoId}</p>
          <YouTubePlaybackIssuePanel
            diagnosis={
              repairPhase === "fixed"
                ? {
                    ...uploadDiagnosis,
                    code: "ok",
                    severity: "ok",
                    headline: "Upload complete — plays inside Film Room",
                    steps: [],
                    canAutoFix: false,
                  }
                : uploadDiagnosis.code === "ok"
                  ? {
                      ...uploadDiagnosis,
                      headline: youtubeStillProcessing
                        ? "Uploaded — YouTube is still processing"
                        : "Upload complete — plays inside Film Room",
                    }
                  : uploadDiagnosis
            }
            onAutoFix={
              uploadDiagnosis.canAutoFix
                ? () => void handleAutoFixEmbedding()
                : undefined
            }
            onRecheck={() => void handleRecheckEmbedding()}
            repairing={repairing}
            repairError={repairError}
            repairFixed={repairPhase === "fixed"}
          />
          {(uploadDiagnosis.code === "ok" || repairPhase === "fixed") &&
          !youtubeStillProcessing ? (
            <p className="mt-1.5 text-[10px] text-sky-200/80">
              {autoAligned
                ? "Auto-aligned to the game timeline from the clip's recording time. Fine-tune in Sources if needed."
                : "Add a sync point in Sources to line this clip up with the others."}
            </p>
          ) : null}
          {embeddable === null && !youtubeStillProcessing && repairPhase !== "fixed" ? (
            <button
              type="button"
              onClick={() => void handleRecheckEmbedding()}
              disabled={repairing}
              className="mt-1.5 rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              {repairing ? "Checking…" : "Check embedding"}
            </button>
          ) : null}
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
