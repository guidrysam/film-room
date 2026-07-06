"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { YouTubePlayer } from "react-youtube";
import FacebookVideoPlayer from "@/components/FacebookVideoPlayer";
import {
  downloadRecording,
  isReelRecordingSupported,
  REEL_RECORD_OUTPUT,
  startReelRecording,
  type ReelRecordingController,
} from "@/lib/highlight-reel-record";

export type FacebookCaptureClip = {
  videoKey: string;
  href: string;
  label?: string;
};

export type FacebookCaptureChapter = {
  time: number;
  label: string;
};

export type FacebookLandscapeCaptureProps = {
  open: boolean;
  onClose: () => void;
  href: string;
  videoKey: string;
  clips?: FacebookCaptureClip[];
  clipIndex?: number;
  chapters?: FacebookCaptureChapter[];
  initialTime?: number;
  initialPlaying?: boolean;
  exportBaseName?: string;
};

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const btnClass =
  "rounded-lg border border-white/15 bg-zinc-950/85 px-3 py-2 text-xs font-semibold text-white shadow-md backdrop-blur-sm transition hover:border-white/25 hover:bg-zinc-900/90 disabled:cursor-not-allowed disabled:opacity-45";

/**
 * Full-screen landscape (16:9) capture stage for Facebook teaching clips.
 * Crops tab capture to the video frame, then saves a landscape file locally.
 */
export default function FacebookLandscapeCapture({
  open,
  onClose,
  href,
  videoKey,
  clips = [],
  clipIndex = 0,
  chapters = [],
  initialTime = 0,
  initialPlaying = false,
  exportBaseName = "facebook-capture",
}: FacebookLandscapeCaptureProps) {
  const captureRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const controllerRef = useRef<ReelRecordingController | null>(null);
  const recordingRef = useRef(false);
  const pendingSeekRef = useRef(initialTime);
  const pendingPlayRef = useRef(initialPlaying);

  const [activeClipIndex, setActiveClipIndex] = useState(clipIndex);
  const [activeHref, setActiveHref] = useState(href);
  const [recording, setRecording] = useState(false);
  const [recordMessage, setRecordMessage] = useState<string | null>(null);
  const [playbackTime, setPlaybackTime] = useState(initialTime);
  const [isPlaying, setIsPlaying] = useState(initialPlaying);

  const recordSupported = useMemo(() => isReelRecordingSupported(), []);

  useEffect(() => {
    if (!open) return;
    setActiveClipIndex(clipIndex);
    setActiveHref(href);
    pendingSeekRef.current = initialTime;
    pendingPlayRef.current = initialPlaying;
    setPlaybackTime(initialTime);
    setIsPlaying(initialPlaying);
    setRecordMessage(null);
  }, [open, href, videoKey, clipIndex, initialTime, initialPlaying]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      controllerRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!open || !isPlaying) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      try {
        const t = p.getCurrentTime();
        if (typeof t === "number" && Number.isFinite(t)) {
          setPlaybackTime(t);
        }
      } catch {
        /* player not ready */
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [open, isPlaying, activeHref]);

  const applyPendingTransport = useCallback((player: YouTubePlayer) => {
    const seek = pendingSeekRef.current;
    if (seek > 0) {
      try {
        player.seekTo?.(seek, true);
      } catch {
        /* ignore */
      }
    }
    if (pendingPlayRef.current) {
      try {
        player.playVideo?.();
      } catch {
        /* ignore */
      }
    }
    pendingSeekRef.current = 0;
    pendingPlayRef.current = false;
  }, []);

  const handlePlayerReady = useCallback(
    (player: YouTubePlayer) => {
      playerRef.current = player;
      applyPendingTransport(player);
    },
    [applyPendingTransport],
  );

  const handlePlayPause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (isPlaying) {
      p.pauseVideo?.();
      setIsPlaying(false);
    } else {
      p.playVideo?.();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeekDelta = useCallback((delta: number) => {
    const p = playerRef.current;
    if (!p?.getCurrentTime || !p.seekTo) return;
    try {
      const t = Math.max(0, (p.getCurrentTime() ?? 0) + delta);
      p.seekTo(t, true);
      setPlaybackTime(t);
    } catch {
      /* ignore */
    }
  }, []);

  const handleJumpChapter = useCallback((time: number) => {
    const p = playerRef.current;
    if (!p?.seekTo) return;
    const t = Math.max(0, time);
    try {
      p.seekTo(t, true);
      setPlaybackTime(t);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSelectClip = useCallback(
    (index: number) => {
      if (recordingRef.current) return;
      const clip = clips[index];
      if (!clip) return;
      setActiveClipIndex(index);
      setActiveHref(clip.href);
      pendingSeekRef.current = 0;
      pendingPlayRef.current = false;
      setPlaybackTime(0);
      setIsPlaying(false);
      playerRef.current = null;
    },
    [clips],
  );

  const stopRecording = useCallback(async () => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    recordingRef.current = false;
    setRecording(false);
    if (!controller) return;
    const rec = await controller.stop();
    if (rec) {
      downloadRecording(rec, exportBaseName);
      setRecordMessage("Saved landscape capture to your downloads.");
    } else {
      setRecordMessage("Recording was empty.");
    }
  }, [exportBaseName]);

  const startRecording = useCallback(async () => {
    setRecordMessage(null);
    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
      const cropElement = captureRef.current;
      if (!cropElement) {
        throw new Error("Capture frame is not ready.");
      }
      const controller = await startReelRecording({
        cropElement,
        outputSize: REEL_RECORD_OUTPUT,
        onAutoStop: () => {
          recordingRef.current = false;
          setRecording(false);
          setRecordMessage("Tab sharing ended — recording stopped.");
        },
      });
      controllerRef.current = controller;
      recordingRef.current = true;
      setRecording(true);
      setRecordMessage(
        "Recording… Choose “This Tab” when prompted. Play through your cued clips, then stop.",
      );
    } catch (e) {
      setRecording(false);
      setRecordMessage(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Tab capture was cancelled. Choose “This Tab” when prompted."
          : e instanceof Error
            ? e.message
            : "Could not start recording.",
      );
    }
  }, []);

  const handleClose = useCallback(() => {
    if (recordingRef.current) {
      void stopRecording();
    } else {
      controllerRef.current?.cancel();
    }
    onClose();
  }, [onClose, stopRecording]);

  if (!open) return null;

  const sortedChapters = [...chapters].sort((a, b) => a.time - b.time);

  return (
    <div className="fixed inset-0 z-[10100] flex flex-col bg-black text-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/90 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Landscape capture</p>
          <p className="text-[11px] text-zinc-400">
            Full screen · 16:9 crop · cue clips, then record this tab
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {recording ? (
            <span className="rounded-full border border-red-500/45 bg-red-950/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-100">
              REC
            </span>
          ) : null}
          <button type="button" onClick={handleClose} className={btnClass}>
            Exit
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black px-2 py-3 sm:px-6">
        <div
          ref={captureRef}
          className="relative aspect-video w-full max-h-full max-w-[min(100vw,177.78vh)] overflow-hidden bg-black shadow-2xl shadow-black/80 ring-1 ring-white/10"
          data-film-room-capture="facebook-landscape"
        >
          <FacebookVideoPlayer
            key={activeHref}
            href={activeHref}
            className="absolute inset-0 h-full w-full"
            onReady={handlePlayerReady}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-zinc-950/95 px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {recordMessage ? (
          <p className="mb-2 text-center text-[11px] leading-relaxed text-zinc-300">
            {recordMessage}
          </p>
        ) : null}

        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={handlePlayPause} className={btnClass}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => handleSeekDelta(-10)}
            className={btnClass}
          >
            -10s
          </button>
          <button
            type="button"
            onClick={() => handleSeekDelta(-30)}
            className={btnClass}
          >
            -30s
          </button>
          <span className="px-2 font-mono text-xs tabular-nums text-zinc-300">
            {formatMmSs(playbackTime)}
          </span>
          {recordSupported ? (
            recording ? (
              <button
                type="button"
                onClick={() => void stopRecording()}
                className={`${btnClass} border-red-500/45 bg-red-950/70 text-red-50`}
              >
                Stop & save
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startRecording()}
                className={`${btnClass} border-blue-500/45 bg-blue-950/70 text-blue-50`}
              >
                Record landscape
              </button>
            )
          ) : (
            <span className="text-[11px] text-zinc-500">
              Recording needs Chrome or Edge on desktop.
            </span>
          )}
        </div>

        {clips.length > 1 ? (
          <div className="mx-auto mt-3 flex max-w-4xl flex-wrap justify-center gap-1.5">
            {clips.map((clip, index) => (
              <button
                key={`${clip.videoKey}-${index}`}
                type="button"
                disabled={recording}
                onClick={() => handleSelectClip(index)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                  index === activeClipIndex
                    ? "border-blue-500/50 bg-blue-600/25 text-white"
                    : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                }`}
              >
                {clip.label?.trim() || `Clip ${index + 1}`}
              </button>
            ))}
          </div>
        ) : null}

        {sortedChapters.length > 0 ? (
          <div className="mx-auto mt-3 flex max-w-4xl flex-wrap justify-center gap-1.5">
            {sortedChapters.map((ch) => (
              <button
                key={`${ch.label}-${ch.time}`}
                type="button"
                disabled={recording}
                onClick={() => handleJumpChapter(ch.time)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40"
              >
                {ch.label}{" "}
                <span className="font-mono text-zinc-400">
                  {formatMmSs(ch.time)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
