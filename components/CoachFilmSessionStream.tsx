"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ref, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { getYouTubeOAuthAccessToken } from "@/lib/auth-google";
import {
  isCoachFilmSessionCaptureSupported,
  startCoachFilmSessionCapture,
  type CoachFilmSessionController,
} from "@/lib/coach-film-session-capture";
import { uploadVideoToYouTube } from "@/lib/youtube-upload";
import { addGameSourceFromYouTubeUpload } from "@/lib/games";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";
const liveBtn =
  "rounded-lg border border-rose-500/45 bg-rose-950/55 px-3 py-1.5 text-xs font-semibold text-rose-50 transition hover:border-rose-400/55 hover:bg-rose-900/55 disabled:opacity-50";
const stopBtn =
  "rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:border-amber-400/50 disabled:opacity-50";

export type CoachFilmSessionStreamProps = {
  roomId: string;
  gameId?: string | null;
  gameTitle?: string | null;
  currentUid: string;
  displayName?: string | null;
};

type Phase =
  | "idle"
  | "starting"
  | "live"
  | "stopping"
  | "uploading"
  | "done"
  | "error";

/**
 * Host control: capture Watch together + coach mic, publish unlisted to YouTube
 * so parents who missed the film session can watch the archive.
 */
export default function CoachFilmSessionStream({
  roomId,
  gameId,
  gameTitle,
  currentUid,
  displayName,
}: CoachFilmSessionStreamProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [liveWatchUrl, setLiveWatchUrl] = useState<string | null>(null);
  const [rtmpHint, setRtmpHint] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const controllerRef = useRef<CoachFilmSessionController | null>(null);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const stopAndPublishRef = useRef<() => Promise<void>>(async () => undefined);

  const supported = isCoachFilmSessionCaptureSupported();

  const clearTick = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearTick();
    controllerRef.current?.cancel();
    controllerRef.current = null;
  }, [clearTick]);

  const writeRoomSession = useCallback(
    async (patch: Record<string, unknown>) => {
      try {
        await update(ref(db, `rooms/${roomId}/coachFilmSession`), {
          ...patch,
          updatedAt: Date.now(),
        });
      } catch {
        /* best-effort for viewers */
      }
    },
    [roomId],
  );

  const stopAndPublish = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    controllerRef.current = null;
    clearTick();
    setPhase("stopping");
    setMessage("Stopping capture…");

    let recording;
    try {
      recording = await controller.stop();
    } catch (e) {
      setPhase("error");
      setMessage(
        e instanceof Error ? e.message : "Could not finalize recording.",
      );
      await writeRoomSession({ status: "error" });
      return;
    }

    if (!recording) {
      setPhase("error");
      setMessage("No video was captured. Try again and share this tab.");
      await writeRoomSession({ status: "error" });
      return;
    }

    setPhase("uploading");
    setMessage("Uploading coach film session to YouTube…");
    await writeRoomSession({ status: "uploading" });

    try {
      const { accessToken, user } = await getYouTubeOAuthAccessToken();
      const titleBase =
        gameTitle?.trim()
          ? `Coach film — ${gameTitle.trim()}`
          : "Coach film session";
      const when = new Date().toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const title = `${titleBase} · ${when}`.slice(0, 95);
      const file = new File(
        [recording.blob],
        `coach-film-session.${recording.ext}`,
        { type: recording.mimeType },
      );
      const uploaded = await uploadVideoToYouTube({
        accessToken,
        file,
        privacyStatus: "unlisted",
        metadata: {
          title,
          description: [
            "Coach film session recorded in Film Room Watch together.",
            gameTitle?.trim() ? `Game: ${gameTitle.trim()}` : null,
            displayName ? `Coach: ${displayName}` : null,
            "Unlisted — share with your team only.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
        onProgress: (p) => setUploadPct(p.pct),
      });

      const url = `https://www.youtube.com/watch?v=${uploaded.videoId}`;
      setWatchUrl(url);

      if (gameId?.trim()) {
        try {
          await addGameSourceFromYouTubeUpload(gameId.trim(), user.uid, {
            videoId: uploaded.videoId,
            label: "Coach film session",
            youtubePrivacyStatus: "unlisted",
            durationSec: recording.durationSec,
            createdByName: displayName ?? undefined,
          });
        } catch {
          /* still share the watch URL */
        }
      }

      await writeRoomSession({
        status: "ready",
        videoId: uploaded.videoId,
        watchUrl: url,
        endedAt: Date.now(),
      });

      setPhase("done");
      setMessage(
        "Published unlisted to your YouTube channel. Parents who missed can watch the link below.",
      );
    } catch (e) {
      setPhase("error");
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not upload to YouTube. Connect YouTube (full youtube scope) and try again.",
      );
      await writeRoomSession({ status: "error" });
    }
  }, [
    clearTick,
    writeRoomSession,
    gameTitle,
    displayName,
    gameId,
  ]);

  stopAndPublishRef.current = stopAndPublish;

  const start = useCallback(async () => {
    if (!supported) {
      setMessage(
        "Use Chrome or Edge to stream a film session (needs screen + mic).",
      );
      setPhase("error");
      return;
    }
    setPhase("starting");
    setMessage(null);
    setWatchUrl(null);
    setLiveWatchUrl(null);
    setRtmpHint(null);
    setUploadPct(0);
    try {
      // Best-effort Live event so parents can open a YouTube watch page during the session.
      // Browser capture cannot push RTMP; concurrent YouTube viewers need OBS with the key below.
      try {
        const { accessToken } = await getYouTubeOAuthAccessToken();
        const title =
          gameTitle?.trim()
            ? `Coach film LIVE — ${gameTitle.trim()}`
            : "Coach film session LIVE";
        const res = await fetch("/api/youtube/create-live-stream", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            description:
              "Film Room coach film session. Unlisted. Archive also uploads when the coach stops.",
            privacyStatus: "unlisted",
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          watchUrl?: string;
          ingestionAddress?: string;
          streamName?: string;
          error?: string;
        } | null;
        if (res.ok && json?.ok && json.watchUrl) {
          setLiveWatchUrl(json.watchUrl);
          if (json.ingestionAddress && json.streamName) {
            setRtmpHint(
              `Optional OBS for concurrent YouTube viewers — Server: ${json.ingestionAddress}  Key: ${json.streamName}`,
            );
          }
          await writeRoomSession({
            liveWatchUrl: json.watchUrl,
          });
        }
      } catch {
        /* Live create is optional; recording still works */
      }

      const controller = await startCoachFilmSessionCapture({
        onDisplayEnded: () => {
          void stopAndPublishRef.current();
        },
      });
      controllerRef.current = controller;
      startedAtRef.current = Date.now();
      setElapsedSec(0);
      clearTick();
      tickRef.current = window.setInterval(() => {
        setElapsedSec(
          Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)),
        );
      }, 1000);

      await writeRoomSession({
        status: "live",
        startedAt: Date.now(),
        startedBy: currentUid,
        ...(displayName ? { startedByName: displayName } : {}),
        title:
          gameTitle?.trim()
            ? `Coach film — ${gameTitle.trim()}`
            : "Coach film session",
      });

      setPhase("live");
      setMessage(
        "Mic + this tab are recording. Share the Film Room tab when prompted. Stop & publish uploads the archive to YouTube for anyone who missed it.",
      );
    } catch (e) {
      controllerRef.current = null;
      clearTick();
      setPhase("error");
      setMessage(
        e instanceof Error ? e.message : "Could not start film session capture.",
      );
    }
  }, [
    supported,
    clearTick,
    writeRoomSession,
    currentUid,
    displayName,
    gameTitle,
  ]);

  const copyWatch = useCallback(async () => {
    if (!watchUrl) return;
    try {
      await navigator.clipboard.writeText(watchUrl);
      setMessage("Watch link copied.");
    } catch {
      setMessage(watchUrl);
    }
  }, [watchUrl]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex max-w-xl flex-wrap items-center gap-2">
      {phase === "idle" || phase === "done" || phase === "error" ? (
        <button
          type="button"
          className={liveBtn}
          disabled={!supported}
          onClick={() => void start()}
          title={
            supported
              ? "Record this film session with your mic and publish to YouTube"
              : "Screen + mic capture not supported here"
          }
        >
          ● Go live with coach voice
        </button>
      ) : null}

      {phase === "starting" ? (
        <span className="text-[11px] text-zinc-400">Starting…</span>
      ) : null}

      {phase === "live" ? (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
            Live {formatElapsed(elapsedSec)}
          </span>
          <button
            type="button"
            className={stopBtn}
            onClick={() => void stopAndPublish()}
          >
            Stop & publish
          </button>
        </>
      ) : null}

      {phase === "stopping" || phase === "uploading" ? (
        <span className="text-[11px] text-zinc-400">
          {phase === "uploading"
            ? `Uploading… ${Math.round(uploadPct)}%`
            : "Finishing…"}
        </span>
      ) : null}

      {watchUrl ? (
        <button type="button" className={ghostBtn} onClick={() => void copyWatch()}>
          Copy YouTube link
        </button>
      ) : null}

      {liveWatchUrl && phase === "live" ? (
        <a
          href={liveWatchUrl}
          target="_blank"
          rel="noreferrer"
          className={ghostBtn}
        >
          Live watch page
        </a>
      ) : null}

      {message ? (
        <p className="basis-full text-[10px] leading-snug text-zinc-400">
          {message}
          {watchUrl ? (
            <>
              {" "}
              <a
                href={watchUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 underline decoration-blue-500/40 hover:text-blue-200"
              >
                Open archive
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {rtmpHint && phase === "live" ? (
        <p className="basis-full text-[10px] leading-snug text-zinc-500">
          {rtmpHint}
        </p>
      ) : null}
    </div>
  );
}
