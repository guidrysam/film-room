"use client";

import YouTube from "react-youtube";
import type { YouTubePlayer } from "react-youtube";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ref, serverTimestamp, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { markRoomHost } from "@/lib/room-host";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

type AngleStatus =
  | "idle"
  | "checking"
  | "ready"
  | "invalid_url"
  | "not_embeddable"
  | "offline_or_not_started";

type StreamAngleRow = {
  id: string;
  name: string;
  url: string;
  videoId: string | null;
  status: AngleStatus;
};

type SavedSetupV1 = {
  v: 1;
  angles: Array<{ id: string; name: string; url: string }>;
  playerViewAngleId?: string;
};

const STORAGE_KEY = "filmroom.streamSetup.v1";

const panelClass =
  "rounded-2xl border border-white/[0.07] bg-zinc-950/40 p-6 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/55 transition focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/35";

const ghostBtn =
  "rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const primaryBtn =
  "inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]";

function newId(prefix = "a"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function pillClasses(status: AngleStatus): string {
  switch (status) {
    case "ready":
      return "border-emerald-400/30 bg-emerald-500/15 text-emerald-200";
    case "checking":
      return "border-blue-400/30 bg-blue-500/15 text-blue-200";
    case "offline_or_not_started":
      return "border-amber-400/30 bg-amber-500/15 text-amber-200";
    case "invalid_url":
    case "not_embeddable":
      return "border-rose-400/30 bg-rose-500/15 text-rose-200";
    default:
      return "border-white/15 bg-white/[0.03] text-zinc-300";
  }
}

function pillLabel(status: AngleStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "checking":
      return "Checking";
    case "ready":
      return "Ready";
    case "invalid_url":
      return "Invalid URL";
    case "not_embeddable":
      return "Not embeddable";
    case "offline_or_not_started":
      return "Offline / not started";
    default: {
      const _exhaustive: never = status;
      return String(_exhaustive);
    }
  }
}

function StatusPill({ status }: { status: AngleStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${pillClasses(status)}`}
    >
      {pillLabel(status)}
    </span>
  );
}

function ValidationProbe({
  videoId,
  onReady,
  onError,
}: {
  videoId: string;
  onReady: (result: "ready" | "offline_or_not_started") => void;
  onError: () => void;
}) {
  const decidedRef = useRef(false);

  const handleReady = useCallback(
    async (evt: { target: YouTubePlayer }) => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      try {
        const state = await evt.target.getPlayerState();
        // Heuristic: if the player is ready but still "unstarted/cued", treat as offline/not-started warning.
        if (state === -1 || state === 5) {
          onReady("offline_or_not_started");
          return;
        }
      } catch {
        // If we can't read state, still treat as ready (player loaded).
      }
      onReady("ready");
    },
    [onReady],
  );

  const handleError = useCallback(() => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    onError();
  }, [onError]);

  return (
    <div className="pointer-events-none absolute -left-[99999px] -top-[99999px] h-px w-px overflow-hidden opacity-0">
      <YouTube
        videoId={videoId}
        opts={{ height: "1", width: "1", playerVars: { playsinline: 1 } }}
        onReady={handleReady}
        onError={handleError}
      />
    </div>
  );
}

function defaultRows(): StreamAngleRow[] {
  return [
    { id: newId("endzone"), name: "End Zone", url: "", videoId: null, status: "idle" },
    { id: newId("sideline"), name: "Sideline", url: "", videoId: null, status: "idle" },
  ];
}

function safeParseSavedSetup(raw: string): SavedSetupV1 | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Partial<SavedSetupV1>;
    if (p.v !== 1) return null;
    if (!Array.isArray(p.angles)) return null;
    const angles = p.angles
      .map((a) => {
        if (!a || typeof a !== "object") return null;
        const row = a as { id?: unknown; name?: unknown; url?: unknown };
        if (typeof row.id !== "string") return null;
        if (typeof row.name !== "string") return null;
        if (typeof row.url !== "string") return null;
        return { id: row.id, name: row.name, url: row.url };
      })
      .filter(Boolean) as SavedSetupV1["angles"];
    if (angles.length === 0) return null;
    return {
      v: 1,
      angles,
      ...(typeof p.playerViewAngleId === "string" ? { playerViewAngleId: p.playerViewAngleId } : {}),
    };
  } catch {
    return null;
  }
}

export default function StreamRoomPage() {
  const router = useRouter();
  const [angles, setAngles] = useState<StreamAngleRow[]>(() => defaultRows());
  const [starting, setStarting] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [loadableSetup, setLoadableSetup] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    window.setTimeout(() => {
      setLoadableSetup(Boolean(raw && safeParseSavedSetup(raw)));
    }, 0);
  }, []);

  const saveSetup = useCallback(() => {
    if (typeof window === "undefined") return;
    const payload: SavedSetupV1 = {
      v: 1,
      angles: angles.map((a) => ({ id: a.id, name: a.name.trim() || "Angle", url: a.url })),
      playerViewAngleId:
        angles.find((a) => a.videoId && a.status !== "invalid_url" && a.status !== "not_embeddable")
          ?.id ?? angles[0]?.id,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setLoadableSetup(true);
    setSaveToast(true);
    window.setTimeout(() => setSaveToast(false), 1800);
  }, [angles]);

  const loadSetup = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = safeParseSavedSetup(raw);
    if (!parsed) return;
    setAngles(
      parsed.angles.map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        videoId: null,
        status: "idle",
      })),
    );
  }, []);

  const setAngleField = useCallback(
    (id: string, patch: Partial<Pick<StreamAngleRow, "name" | "url">>) => {
      setAngles((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );
    },
    [],
  );

  const addAngle = useCallback(() => {
    setAngles((prev) => [
      ...prev,
      {
        id: newId("angle"),
        name: `Angle ${prev.length + 1}`,
        url: "",
        videoId: null,
        status: "idle",
      },
    ]);
  }, []);

  const removeAngle = useCallback((id: string) => {
    setAngles((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Debounced URL → videoId extraction + "checking" state.
  useEffect(() => {
    const timers: number[] = [];
    for (const row of angles) {
      const t = window.setTimeout(() => {
        const vid = row.url.trim() ? extractYouTubeVideoId(row.url) : null;
        setAngles((prev) =>
          prev.map((a) => {
            if (a.id !== row.id) return a;
            if (!a.url.trim()) {
              return { ...a, videoId: null, status: "idle" };
            }
            if (!vid) {
              return { ...a, videoId: null, status: "invalid_url" };
            }
            // If unchanged, keep status (e.g., ready/offline).
            if (a.videoId === vid && a.status !== "invalid_url") return a;
            return { ...a, videoId: vid, status: "checking" };
          }),
        );
      }, 500);
      timers.push(t);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [angles]);

  const launchableAngles = useMemo(
    () =>
      angles.filter(
        (a) =>
          Boolean(a.videoId) &&
          a.status !== "invalid_url" &&
          a.status !== "not_embeddable",
      ),
    [angles],
  );

  const startEnabled = launchableAngles.length > 0 && !starting;

  const startLiveSession = useCallback(async () => {
    if (!startEnabled) return;
    const valid = launchableAngles;
    const primary = valid[0]!;
    const roomId = Math.random().toString(36).substring(2, 8);
    markRoomHost(roomId);
    setStarting(true);

    const payload = {
      roomViewMode: "sync",
      sourceType: "live",
      manualSyncLocked: true,
      syncAnchorTime: 0,
      playerViewAngleId: primary.id,
      currentAngleId: primary.id,
      videoId: primary.videoId,
      clips: [{ videoId: primary.videoId }],
      currentClipIndex: 0,
      chapters: [],
      isPlaying: false,
      currentTime: 0,
      playbackRate: 1,
      playbackCommand: null,
      angles: valid.map((a) => ({
        id: a.id,
        name: a.name.trim() || "Angle",
        url: a.url,
        videoId: a.videoId,
        offsetFromGameTime: 0,
        sourceType: "youtube_live",
      })),
      updatedAt: serverTimestamp(),
      action: "init",
      actionId: 1,
    };

    try {
      await set(ref(db, `rooms/${roomId}`), payload);
      router.push(`/room/${roomId}?view=live`);
    } catch (err) {
      console.error("[Stream Room] create room failed", err);
      alert("Could not start live session. Check Firebase permissions.");
      setStarting(false);
    }
  }, [launchableAngles, router, startEnabled]);

  return (
    <div className="min-h-screen px-4 py-14 text-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
              Film Room
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Stream Room</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-300">
              Set up live angles before starting a synced session.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-sm text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]"
          >
            ← Home
          </Link>
        </div>

        <div className={panelClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white">Saved setup</h2>
              <p className="text-xs text-zinc-400">
                Save angle names and URLs locally for quick reuse.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {loadableSetup ? (
                <button type="button" onClick={loadSetup} className={ghostBtn}>
                  Load Previous Setup
                </button>
              ) : null}
              <button type="button" onClick={saveSetup} className={ghostBtn}>
                Save Setup
              </button>
              {saveToast ? (
                <span className="text-xs text-emerald-200">Saved</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className={panelClass}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Angles</h2>
            <button type="button" onClick={addAngle} className={ghostBtn}>
              Add Angle
            </button>
          </div>

          <div className="space-y-4">
            {angles.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-12 md:items-center"
              >
                <div className="md:col-span-3">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                    Angle name
                  </label>
                  <input
                    value={a.name}
                    onChange={(e) => setAngleField(a.id, { name: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. End Zone"
                  />
                </div>
                <div className="md:col-span-6">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                    YouTube URL
                  </label>
                  <input
                    value={a.url}
                    onChange={(e) => setAngleField(a.id, { url: e.target.value })}
                    className={inputClass}
                    placeholder="youtube.com/live/... or youtu.be/..."
                  />
                </div>
                <div className="flex items-center justify-between gap-3 md:col-span-3 md:justify-end">
                  <StatusPill status={a.status} />
                  <button
                    type="button"
                    onClick={() => removeAngle(a.id)}
                    className={ghostBtn}
                    disabled={angles.length <= 1}
                    aria-disabled={angles.length <= 1}
                  >
                    Remove
                  </button>
                </div>

                {/* Per-row validation probe: only mounts when we have a videoId and need to check readiness/embeddability. */}
                {a.videoId && a.status === "checking" ? (
                  <ValidationProbe
                    key={a.videoId}
                    videoId={a.videoId}
                    onReady={(result) => {
                      setAngles((prev) =>
                        prev.map((row) =>
                          row.id === a.id ? { ...row, status: result } : row,
                        ),
                      );
                    }}
                    onError={() => {
                      setAngles((prev) =>
                        prev.map((row) =>
                          row.id === a.id
                            ? { ...row, status: "not_embeddable" }
                            : row,
                        ),
                      );
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-zinc-400">
              {angles.some((a) => a.status === "offline_or_not_started") ? (
                <span className="text-amber-200">
                  Some angles look offline/not started yet. You can still start the
                  session, but playback may be unavailable until the stream begins.
                </span>
              ) : (
                <span>
                  Start is enabled when at least one angle has a valid, embeddable
                  YouTube video.
                </span>
              )}
            </div>
            <button
              type="button"
              className={primaryBtn}
              disabled={!startEnabled}
              onClick={() => void startLiveSession()}
            >
              {starting ? "Starting…" : "Start Live Session"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

