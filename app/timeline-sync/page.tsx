"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import YouTube, { type YouTubePlayer } from "react-youtube";
import { ref, serverTimestamp, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { markRoomHost } from "@/lib/room-host";
import { extractYouTubeVideoId } from "@/lib/youtube-id";
import { getSportById } from "@/lib/sports";
import { useHydrated } from "@/lib/use-hydrated";
import {
  type CoachTimeline,
  type CoachTimelineEvent,
  formatClock,
  listTimelines,
  markEpochMs,
} from "@/lib/timelines";
import { fetchYouTubeVideoMeta } from "@/lib/youtube-video-meta-client";
import {
  recordedStartFromMeta,
  type RecordedStartSource,
} from "@/lib/youtube-clock-sync";

const cardClass =
  "w-full rounded-2xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-6";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-white/45 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/35";

const selectClass =
  "w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/35";

const ghostLink =
  "text-sm text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm";

const stepBadge =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/90 text-xs font-bold text-white";

function randomRoomId(): string {
  return Math.random().toString(36).substring(2, 8);
}

async function readPlayerTime(player: YouTubePlayer | null): Promise<number> {
  if (!player) return 0;
  try {
    const t = player.getCurrentTime?.();
    const resolved = t instanceof Promise ? await t : t;
    return typeof resolved === "number" && Number.isFinite(resolved)
      ? Math.max(0, resolved)
      : 0;
  } catch {
    return 0;
  }
}

function TimelineSyncInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectId = searchParams.get("timeline");

  const hydrated = useHydrated();
  const [timelines] = useState<CoachTimeline[]>(() => listTimelines());
  const [selectedId, setSelectedId] = useState<string>(() => {
    const all = listTimelines();
    if (preselectId && all.some((t) => t.id === preselectId)) return preselectId;
    return all[0]?.id ?? "";
  });
  const [urlInput, setUrlInput] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [anchorEventId, setAnchorEventId] = useState<string>("");
  /** Video time (sec) that lines up with the chosen anchor event. */
  const [anchorVideoSec, setAnchorVideoSec] = useState<number>(0);
  const [playerTime, setPlayerTime] = useState<number>(0);
  const [opening, setOpening] = useState(false);
  /** Video's real-world start (epoch ms), from YouTube metadata, if known. */
  const [videoStartMs, setVideoStartMs] = useState<number | null>(null);
  const [autoSource, setAutoSource] = useState<RecordedStartSource | null>(null);
  const [manualAnchor, setManualAnchor] = useState(false);
  const autoAppliedRef = useRef(false);
  const playerRef = useRef<YouTubePlayer | null>(null);

  const timeline = useMemo(
    () => timelines.find((t) => t.id === selectedId) ?? null,
    [selectedId, timelines],
  );

  const sortedEvents = useMemo(
    () =>
      timeline
        ? [...timeline.events].sort((a, b) => a.offsetSec - b.offsetSec)
        : [],
    [timeline],
  );

  // Reset the sync anchor when the coach picks a different timeline
  // (render-phase reset — the documented alternative to an effect).
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setAnchorEventId("");
    setAnchorVideoSec(0);
  }

  // Falls back to the first event (often "Start"/kickoff) until the coach picks one.
  const effectiveAnchorId =
    anchorEventId && sortedEvents.some((e) => e.id === anchorEventId)
      ? anchorEventId
      : sortedEvents[0]?.id ?? "";

  // Poll player time so "Set sync point" reflects the current frame.
  useEffect(() => {
    if (!videoId) return;
    const id = window.setInterval(async () => {
      setPlayerTime(await readPlayerTime(playerRef.current));
    }, 400);
    return () => window.clearInterval(id);
  }, [videoId]);

  const handleResolveUrl = useCallback(() => {
    const vid = extractYouTubeVideoId(urlInput);
    if (!vid) {
      window.alert("That doesn't look like a YouTube link.");
      return;
    }
    setVideoId(vid);
  }, [urlInput]);

  // Look up the video's real-world start time (live actualStartTime / recording
  // time) so the canon mark timestamps can auto-place onto it.
  useEffect(() => {
    if (!videoId) {
      setVideoStartMs(null);
      setAutoSource(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const meta = await fetchYouTubeVideoMeta(videoId);
      if (cancelled) return;
      const rs = meta ? recordedStartFromMeta(meta) : null;
      const ms = rs ? Date.parse(rs.recordedStartTime) : NaN;
      if (rs && Number.isFinite(ms)) {
        setVideoStartMs(ms);
        setAutoSource(rs.source);
      } else {
        setVideoStartMs(null);
        setAutoSource(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  // Reset manual / auto state when the timeline or video changes.
  useEffect(() => {
    setManualAnchor(false);
    autoAppliedRef.current = false;
  }, [selectedId, videoId]);

  const applyAutoLineup = useCallback(() => {
    if (videoStartMs == null || !timeline) return;
    const first = [...timeline.events].sort(
      (a, b) => a.offsetSec - b.offsetSec,
    )[0];
    if (!first) return;
    const sec = (markEpochMs(timeline.createdAt, first) - videoStartMs) / 1000;
    setAnchorEventId(first.id);
    setAnchorVideoSec(sec);
  }, [videoStartMs, timeline]);

  // Auto-line-up once when a clock is available and the coach hasn't set a
  // manual sync point.
  useEffect(() => {
    if (manualAnchor || autoAppliedRef.current) return;
    if (videoStartMs == null || !timeline) return;
    applyAutoLineup();
    autoAppliedRef.current = true;
  }, [manualAnchor, videoStartMs, timeline, applyAutoLineup]);

  const anchorEvent: CoachTimelineEvent | null = useMemo(() => {
    if (!timeline) return null;
    return timeline.events.find((e) => e.id === effectiveAnchorId) ?? null;
  }, [timeline, effectiveAnchorId]);

  /** Video time = (event offset) - (anchor offset) + (anchor video time). */
  const offsetSec = useMemo(() => {
    if (!anchorEvent) return anchorVideoSec;
    return anchorVideoSec - anchorEvent.offsetSec;
  }, [anchorEvent, anchorVideoSec]);

  const previewMarks = useMemo(() => {
    if (!timeline) return [];
    return [...timeline.events]
      .sort((a, b) => a.offsetSec - b.offsetSec)
      .map((e) => ({
        id: e.id,
        label: e.label,
        videoSec: Math.max(0, e.offsetSec + offsetSec),
      }));
  }, [timeline, offsetSec]);

  const handleSetSyncPoint = useCallback(async () => {
    const t = await readPlayerTime(playerRef.current);
    setAnchorVideoSec(t);
    setManualAnchor(true);
  }, []);

  const handleOpenSession = useCallback(async () => {
    if (!timeline || !videoId) return;
    setOpening(true);
    try {
      const roomId = randomRoomId();
      const chapters = previewMarks.map((m) => ({
        time: Math.round(m.videoSec * 100) / 100,
        label: m.label,
        videoId,
      }));
      await set(ref(db, `rooms/${roomId}`), {
        name: timeline.name,
        videoId,
        clips: [{ videoId }],
        currentClipIndex: 0,
        isPlaying: false,
        currentTime: 0,
        playbackRate: 1,
        playbackCommand: null,
        chapters,
        updatedAt: serverTimestamp(),
        action: "init",
        actionId: 1,
      });
      markRoomHost(roomId);
      router.push(`/room/${roomId}?video=${encodeURIComponent(videoId)}`);
    } catch (e) {
      setOpening(false);
      window.alert(
        e instanceof Error ? e.message : "Could not open the session. Try again.",
      );
    }
  }, [timeline, videoId, previewMarks, router]);

  if (!hydrated) {
    return <main className="min-h-screen" aria-hidden />;
  }

  if (timelines.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-12 text-white">
        <div className={cardClass}>
          <h1 className="text-2xl font-semibold">Line Up Videos</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            No saved timelines yet. Record one with Tag Plays first, then come
            back here to line it up with the video.
          </p>
          <Link
            href="/coach-mark"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500"
          >
            Open Tag Plays
          </Link>
        </div>
        <div className="text-center">
          <Link href="/" className={ghostLink}>
            Back to Film Room
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 py-8 text-white">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Line Up Videos</h1>
          <p className="text-sm text-white/65">
            Attach a recorded timeline to its video.
          </p>
        </div>
        <Link href="/" className={ghostLink}>
          Exit
        </Link>
      </header>

      <section className={cardClass}>
        <div className="mb-3 flex items-center gap-2">
          <span className={stepBadge}>1</span>
          <h2 className="text-sm font-semibold">Pick a timeline</h2>
        </div>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={selectClass}
        >
          {timelines.map((t) => (
            <option key={t.id} value={t.id} className="bg-zinc-900">
              {t.name} — {t.events.length} marks
            </option>
          ))}
        </select>
        {timeline ? (
          <p className="mt-2 text-xs text-white/50">
            {getSportById(timeline.sportId).name} ·{" "}
            {formatClock(timeline.durationSec)} · {timeline.events.length} marks
          </p>
        ) : null}
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center gap-2">
          <span className={stepBadge}>2</span>
          <h2 className="text-sm font-semibold">Paste the recorded video</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="YouTube link to the recording"
            className={inputClass}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleResolveUrl();
            }}
          />
          <button
            type="button"
            onClick={handleResolveUrl}
            className="shrink-0 rounded-xl border border-white/12 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.10]"
          >
            Load
          </button>
        </div>
        {videoId ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black">
            <div className="aspect-video w-full">
              <YouTube
                videoId={videoId}
                className="h-full w-full"
                iframeClassName="h-full w-full"
                opts={{ width: "100%", height: "100%", playerVars: { rel: 0 } }}
                onReady={(e) => {
                  playerRef.current = e.target;
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {timeline && videoId ? (
        <section className={cardClass}>
          <div className="mb-3 flex items-center gap-2">
            <span className={stepBadge}>3</span>
            <h2 className="text-sm font-semibold">Line them up</h2>
          </div>
          {videoStartMs != null && !manualAnchor ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-3">
              <p className="text-sm font-medium text-emerald-100">
                Lined up automatically.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-200/80">
                Matched your marks to the video&apos;s{" "}
                {autoSource === "live_actual_start"
                  ? "live‑stream start time"
                  : "recording time"}{" "}
                using the real clock — no scrubbing needed. Spot-check the
                preview below; adjust manually only if something looks off.
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-white/65">
              Scrub the video to the moment of one known event, choose that
              event below, then set the sync point.
              {videoStartMs != null ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={applyAutoLineup}
                    className="font-medium text-emerald-300 underline-offset-2 hover:underline"
                  >
                    Or auto line up by the real clock.
                  </button>
                </>
              ) : null}
            </p>
          )}

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-white/55">
              Anchor event
            </span>
            <select
              value={effectiveAnchorId}
              onChange={(e) => setAnchorEventId(e.target.value)}
              className={selectClass}
            >
              {sortedEvents.map((e) => (
                <option key={e.id} value={e.id} className="bg-zinc-900">
                  {e.label} @ {formatClock(e.offsetSec)}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <div className="text-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                Video position
              </div>
              <div className="font-mono text-lg tabular-nums">
                {formatClock(playerTime)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleSetSyncPoint()}
              className="ml-auto rounded-lg border border-blue-500/45 bg-blue-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Set sync point here
            </button>
          </div>

          <p className="mt-2 text-xs text-white/55">
            Lined up: <span className="font-medium text-white/80">
              {anchorEvent?.label ?? "anchor"}
            </span>{" "}
            happens at {formatClock(anchorVideoSec)} in the video.
          </p>

          <div className="mt-4 border-t border-white/[0.08] pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
              Preview — marks on the video
            </div>
            <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
              {previewMarks.map((m) => (
                <li
                  key={m.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-sm ${
                    m.id === effectiveAnchorId
                      ? "border-blue-500/40 bg-blue-950/30"
                      : "border-white/[0.06] bg-black/25"
                  }`}
                >
                  <span className="font-medium text-white">{m.label}</span>
                  <span className="ml-auto font-mono tabular-nums text-white/60">
                    {formatClock(m.videoSec)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {timeline && videoId ? (
        <section className={cardClass}>
          <div className="mb-3 flex items-center gap-2">
            <span className={stepBadge}>4</span>
            <h2 className="text-sm font-semibold">Open the film session</h2>
          </div>
          <p className="text-sm leading-relaxed text-white/65">
            This opens the video with every mark attached. From there you can
            jump between events and save it to your sessions like normal.
          </p>
          <button
            type="button"
            disabled={opening}
            onClick={() => void handleOpenSession()}
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {opening ? "Opening…" : "Open synced film session"}
          </button>
        </section>
      ) : null}

      <div className="text-center">
        <Link href="/coach-mark" className={ghostLink}>
          Record a new timeline
        </Link>
      </div>
    </main>
  );
}

export default function TimelineSyncPage() {
  return (
    <Suspense fallback={null}>
      <TimelineSyncInner />
    </Suspense>
  );
}
