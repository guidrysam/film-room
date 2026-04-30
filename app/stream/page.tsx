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
  | "live_ready"
  | "waiting_offline"
  | "invalid_url"
  | "not_embeddable";

/** Temporary Stream Room diagnostics (UI + console). */
type StreamAngleDebug = {
  videoId: string;
  embedResult: "ready" | "offline_or_not_started" | "error";
  metaResponse: unknown;
  computed: {
    isLive?: boolean;
    liveBroadcastContent?: string;
    streamPhase?: string;
    uploadStatus?: string;
    privacyStatus?: string;
    publishedAt?: string;
    embeddable?: boolean;
  };
  finalStatus: AngleStatus;
};

type StreamAngleRow = {
  id: string;
  name: string;
  url: string;
  videoId: string | null;
  status: AngleStatus;
  /** Populated after embed + meta settle (cleared when URL changes). */
  debug?: StreamAngleDebug | null;
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
    case "live_ready":
      return "border-red-400/35 bg-red-500/15 text-red-100";
    case "checking":
      return "border-blue-400/30 bg-blue-500/15 text-blue-200";
    case "waiting_offline":
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
    case "live_ready":
      return "Live · Ready";
    case "invalid_url":
      return "Invalid URL";
    case "not_embeddable":
      return "Not embeddable";
    case "waiting_offline":
      return "Waiting / Offline";
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

type MetaApiJson = {
  ok?: boolean;
  meta?: {
    isLive?: boolean;
    liveBroadcastContent?: string;
    streamPhase?: string;
    uploadStatus?: string;
    privacyStatus?: string;
    publishedAt?: string;
    embeddable?: boolean;
  };
  error?: string;
};

function computeStreamAngleStatus(
  embed: "ready" | "offline_or_not_started",
  metaJson: MetaApiJson | null,
): AngleStatus {
  const metaOk =
    metaJson &&
    metaJson.ok === true &&
    metaJson.meta &&
    typeof metaJson.meta === "object";
  const m = metaOk ? metaJson.meta! : null;

  if (!m) {
    return embed === "offline_or_not_started" ? "waiting_offline" : "ready";
  }

  const phase = m.streamPhase;
  if (phase === "active") {
    return "live_ready";
  }
  if (phase === "upcoming" || embed === "offline_or_not_started") {
    return "waiting_offline";
  }
  if (phase === "ended") {
    return "waiting_offline";
  }
  /* vod / none: embed offline already mapped above */
  return "ready";
}

/**
 * Fetches `/api/youtube-video-meta` and runs an off-screen embed probe; merges into final status + debug.
 */
function StreamAngleValidationPipeline({
  angleId,
  videoId,
  onSettled,
}: {
  angleId: string;
  videoId: string;
  onSettled: (rowId: string, patch: Pick<StreamAngleRow, "status" | "debug">) => void;
}) {
  const decidedRef = useRef(false);
  const metaRef = useRef<MetaApiJson | "pending">("pending");
  const embedRef = useRef<"ready" | "offline_or_not_started" | null>(null);

  const finalize = useCallback(() => {
    if (decidedRef.current) return;
    const meta = metaRef.current;
    const emb = embedRef.current;
    if (meta === "pending" || emb === null) return;
    decidedRef.current = true;

    const metaResponse: unknown = meta;

    const m = meta.ok === true ? meta.meta : undefined;
    const computed = {
      isLive: m?.isLive,
      liveBroadcastContent: m?.liveBroadcastContent,
      streamPhase: m?.streamPhase,
      uploadStatus: m?.uploadStatus,
      privacyStatus: m?.privacyStatus,
      publishedAt: m?.publishedAt,
      embeddable: m?.embeddable,
    };

    const finalStatus = computeStreamAngleStatus(emb, meta);

    const debug: StreamAngleDebug = {
      videoId,
      embedResult: emb,
      metaResponse,
      computed,
      finalStatus,
    };

    console.log("[Stream Room] angle settled", angleId, {
      videoId,
      embed: emb,
      meta: metaResponse,
      isLive: computed.isLive,
      liveBroadcastContent: computed.liveBroadcastContent,
      uploadStatus: computed.uploadStatus,
      privacyStatus: computed.privacyStatus,
      publishedAt: computed.publishedAt,
      finalStatus,
    });

    onSettled(angleId, { status: finalStatus, debug });
  }, [angleId, onSettled, videoId]);

  useEffect(() => {
    decidedRef.current = false;
    metaRef.current = "pending";
    embedRef.current = null;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/youtube-video-meta?videoId=${encodeURIComponent(videoId)}`,
        );
        let data: MetaApiJson = {};
        try {
          data = (await res.json()) as MetaApiJson;
        } catch {
          data = { ok: false, error: "Invalid JSON from youtube-video-meta" };
        }
        if (cancelled) return;
        metaRef.current = data;
        console.log("[Stream Room] youtube-video-meta", videoId, data);
      } catch (e) {
        if (cancelled) return;
        metaRef.current = {
          ok: false,
          error: e instanceof Error ? e.message : "Meta fetch failed",
        };
        console.warn("[Stream Room] meta fetch error", videoId, e);
      }
      finalize();
    })();

    return () => {
      cancelled = true;
    };
  }, [videoId, finalize]);

  const handlePlayerReady = useCallback(
    async (evt: { target: YouTubePlayer }) => {
      if (decidedRef.current) return;
      try {
        const state = await evt.target.getPlayerState();
        if (state === -1 || state === 5) {
          embedRef.current = "offline_or_not_started";
        } else {
          embedRef.current = "ready";
        }
      } catch {
        embedRef.current = "ready";
      }
      console.log("[Stream Room] embed probe", videoId, embedRef.current);
      finalize();
    },
    [finalize, videoId],
  );

  const handlePlayerError = useCallback(() => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    const meta = metaRef.current;
    const metaResponse: unknown =
      meta === "pending"
        ? { ok: false, error: "Embed error (meta still loading)" }
        : meta;
    const debug: StreamAngleDebug = {
      videoId,
      embedResult: "error",
      metaResponse,
      computed: {},
      finalStatus: "not_embeddable",
    };
    console.warn("[Stream Room] embed error", videoId, metaResponse);
    onSettled(angleId, { status: "not_embeddable", debug });
  }, [angleId, onSettled, videoId]);

  return (
    <div className="pointer-events-none absolute -left-[99999px] -top-[99999px] h-px w-px overflow-hidden opacity-0">
      <YouTube
        videoId={videoId}
        opts={{ height: "1", width: "1", playerVars: { playsinline: 1 } }}
        onReady={handlePlayerReady}
        onError={handlePlayerError}
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

  const handleStreamAngleSettled = useCallback(
    (rowId: string, patch: Pick<StreamAngleRow, "status" | "debug">) => {
      setAngles((prev) =>
        prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

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
              return { ...a, videoId: null, status: "idle", debug: null };
            }
            if (!vid) {
              return { ...a, videoId: null, status: "invalid_url", debug: null };
            }
            // If unchanged, keep status (e.g., ready / live_ready / waiting_offline).
            if (a.videoId === vid && a.status !== "invalid_url") return a;
            return { ...a, videoId: vid, status: "checking", debug: null };
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
        videoId: a.videoId!,
        offsetFromGameTime: 0,
      })),
      updatedAt: serverTimestamp(),
      action: "init",
      actionId: 1,
    };

    try {
      await set(ref(db, `rooms/${roomId}`), payload);
      router.push(`/room/${roomId}?view=sync`);
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
                className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-12 md:items-start"
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

                {a.videoId && a.status === "checking" ? (
                  <StreamAngleValidationPipeline
                    key={`${a.id}-${a.videoId}`}
                    angleId={a.id}
                    videoId={a.videoId}
                    onSettled={handleStreamAngleSettled}
                  />
                ) : null}

                {a.debug ? (
                  <div className="md:col-span-12">
                    <details className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-zinc-300">
                        Live detection debug (temporary)
                      </summary>
                      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-zinc-500">
                        {JSON.stringify(
                          {
                            videoId: a.debug.videoId,
                            embedResult: a.debug.embedResult,
                            metaResponse: a.debug.metaResponse,
                            isLive: a.debug.computed.isLive,
                            liveBroadcastContent:
                              a.debug.computed.liveBroadcastContent,
                            streamPhase: a.debug.computed.streamPhase,
                            uploadStatus: a.debug.computed.uploadStatus,
                            privacyStatus: a.debug.computed.privacyStatus,
                            publishedAt: a.debug.computed.publishedAt,
                            embeddableFromApi: a.debug.computed.embeddable,
                            finalStreamRoomStatus: a.debug.finalStatus,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-zinc-400">
              {angles.some((a) => a.status === "waiting_offline") ? (
                <span className="text-amber-200">
                  Some angles are waiting or offline (not yet live). You can still
                  start the session; playback may begin when the stream does.
                </span>
              ) : (
                <span>
                  Start is enabled when at least one angle has a valid, embeddable
                  YouTube video (live metadata can be uncertain — embed check is what
                  matters).
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

