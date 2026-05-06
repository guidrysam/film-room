"use client";

import YouTube from "react-youtube";
import type { YouTubePlayer } from "react-youtube";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ref, serverTimestamp, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { markRoomHost } from "@/lib/room-host";
import { getYouTubeOAuthAccessToken } from "@/lib/auth-google";
import {
  isPersistentYouTubeLiveUrl,
  isYoutubeWatchVideoUrl,
  parsePersistentLiveUrlTarget,
} from "@/lib/youtube-id";

type AngleStatus =
  | "idle"
  | "checking"
  | "ready"
  | "live_ready"
  | "waiting_for_signal"
  | "waiting_offline"
  | "stream_ended"
  | "invalid_url"
  | "not_embeddable";

/** Temporary Stream Room diagnostics (UI + console). */
type StreamAngleDebug = {
  videoId: string;
  embedResult: "ready" | "offline_or_not_started" | "error";
  metaResponse: unknown;
  computed: {
    /** API `isLive` (includes upcoming / chat / viewers); not used for strict LIVE UI. */
    broadIsLive?: boolean;
    liveBroadcastContent?: string;
    streamPhase?: string;
    actualStartTime?: string;
    actualEndTime?: string;
    uploadStatus?: string;
    privacyStatus?: string;
    publishedAt?: string;
    embeddable?: boolean;
    channelId?: string;
    channelCustomUrl?: string;
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
  /** Meta says VOD / past broadcast while Stream Room expects live. */
  pastBroadcastWarning?: boolean;
  /** Prefer `channel/…/live` or `@handle/live` (from watch?v= or meta). */
  persistentLiveHint?: string | null;
  /** When /live URL resolves but no broadcast id yet. */
  urlResolveNote?: string | null;
};

function isLaunchableStreamAngle(a: StreamAngleRow): boolean {
  if (
    a.status === "invalid_url" ||
    a.status === "not_embeddable" ||
    a.status === "stream_ended"
  ) {
    return false;
  }
  if (Boolean(a.videoId)) return true;
  if (a.status !== "waiting_for_signal") return false;
  const t = parsePersistentLiveUrlTarget(a.url.trim());
  return Boolean(t && (t.kind === "channel_live" || t.kind === "handle_live"));
}

type SavedSetupV1 = {
  v: 1;
  angles: Array<{ id: string; name: string; url: string }>;
  playerViewAngleId?: string;
};

const STORAGE_KEY = "filmroom.streamSetup.v1";

const CAMERAS_STORAGE_KEY = "filmRoomYouTubeCameras";

/**
 * Saved YouTube RTMP camera preset (localStorage only).
 * Broadcast/watch URL is created per session via create-broadcast-from-stream.
 */
type YouTubeCameraPreset = {
  id: string;
  name: string;
  streamId: string;
  ingestionAddress: string;
  streamName: string;
  channelId?: string;
  channelHandle?: string;
  persistentLiveUrl?: string;
  lastWatchUrl?: string;
  /** For ordering saved list (optional on legacy rows). */
  createdAt: string;
};

const CHANNEL_ID_PRESET_RE = /^UC[a-zA-Z0-9_-]{22}$/;

function optionalTrimString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/**
 * Persistent /live URL only — never `watch?v=` (used for angles + Load into Angle).
 * Priority: stored persistent → channel UC…/live → @handle/live.
 */
function persistentLiveViewUrlFromPreset(cam: YouTubeCameraPreset): string | null {
  const p = cam.persistentLiveUrl?.trim();
  if (p) return p;
  const c = cam.channelId?.trim();
  if (c && CHANNEL_ID_PRESET_RE.test(c))
    return `https://www.youtube.com/channel/${c}/live`;
  const h = cam.channelHandle?.trim();
  if (h) return `https://www.youtube.com/@${h.replace(/^@/, "")}/live`;
  return null;
}

/** If preset lacks `persistentLiveUrl` but channel fields imply one, return preset + flag to persist. */
function augmentPresetPersistentForStorage(cam: YouTubeCameraPreset): {
  preset: YouTubeCameraPreset;
  didAddPersistent: boolean;
} {
  if (cam.persistentLiveUrl?.trim()) {
    return { preset: cam, didAddPersistent: false };
  }
  const derived = persistentLiveViewUrlFromPreset(cam);
  if (!derived) return { preset: cam, didAddPersistent: false };
  return {
    preset: { ...cam, persistentLiveUrl: derived },
    didAddPersistent: true,
  };
}

function pickAngleIndexForPresetLoad(rows: StreamAngleRow[]): number {
  const emptyIdx = rows.findIndex((a) => !a.url.trim());
  if (emptyIdx >= 0) return emptyIdx;
  return 0;
}

function parseCamerasFromStorage(raw: string | null): YouTubeCameraPreset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: YouTubeCameraPreset[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim() : "";
      const name = typeof o.name === "string" ? o.name.trim() : "";
      const streamId = typeof o.streamId === "string" ? o.streamId.trim() : "";
      if (!id || !name || !streamId) continue;
      const ingestionAddress =
        typeof o.ingestionAddress === "string" ? o.ingestionAddress : "";
      const streamName =
        typeof o.streamName === "string" ? o.streamName : "";
      const createdAt =
        typeof o.createdAt === "string" && o.createdAt.trim() !== ""
          ? o.createdAt.trim()
          : new Date(0).toISOString();
      const channelId = optionalTrimString(o.channelId);
      const channelHandle = optionalTrimString(o.channelHandle);
      let persistentLiveUrl = optionalTrimString(o.persistentLiveUrl);
      if (!persistentLiveUrl) {
        if (channelId && CHANNEL_ID_PRESET_RE.test(channelId)) {
          persistentLiveUrl = `https://www.youtube.com/channel/${channelId}/live`;
        } else if (channelHandle) {
          persistentLiveUrl = `https://www.youtube.com/@${channelHandle.replace(/^@/, "")}/live`;
        }
      }
      const lastWatchUrl = optionalTrimString(o.lastWatchUrl);
      out.push({
        id,
        name,
        streamId,
        ingestionAddress,
        streamName,
        ...(channelId && CHANNEL_ID_PRESET_RE.test(channelId)
          ? { channelId }
          : {}),
        ...(channelHandle ? { channelHandle } : {}),
        ...(persistentLiveUrl ? { persistentLiveUrl } : {}),
        ...(lastWatchUrl ? { lastWatchUrl } : {}),
        createdAt,
      });
    }
    return out;
  } catch {
    return [];
  }
}

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
    case "waiting_for_signal":
      return "border-sky-400/35 bg-sky-500/15 text-sky-100";
    case "waiting_offline":
      return "border-amber-400/30 bg-amber-500/15 text-amber-200";
    case "stream_ended":
      return "border-rose-400/35 bg-rose-950/40 text-rose-100";
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
    case "waiting_for_signal":
      return "Waiting for live signal";
    case "invalid_url":
      return "Invalid URL";
    case "not_embeddable":
      return "Not embeddable";
    case "waiting_offline":
      return "Waiting / Offline";
    case "stream_ended":
      return "Stream ended — restart stream source";
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
    actualStartTime?: string;
    actualEndTime?: string;
    uploadStatus?: string;
    privacyStatus?: string;
    publishedAt?: string;
    embeddable?: boolean;
    channelId?: string;
    channelCustomUrl?: string;
  };
  error?: string;
};

function computeStreamAngleStatus(
  embed: "ready" | "offline_or_not_started",
  metaJson: MetaApiJson | null,
  opts?: { persistentLiveUrl?: boolean },
): AngleStatus {
  const persist = opts?.persistentLiveUrl === true;
  const metaOk =
    metaJson &&
    metaJson.ok === true &&
    metaJson.meta &&
    typeof metaJson.meta === "object";
  const m = metaOk ? metaJson.meta! : null;

  if (!m) {
    if (persist) {
      return embed === "offline_or_not_started"
        ? "waiting_for_signal"
        : "live_ready";
    }
    return embed === "offline_or_not_started" ? "waiting_offline" : "ready";
  }

  if (m.streamPhase === "ended") {
    return "stream_ended";
  }
  if (m.streamPhase === "active" || m.liveBroadcastContent === "live") {
    return "live_ready";
  }
  if (
    m.streamPhase === "upcoming" ||
    m.liveBroadcastContent === "upcoming"
  ) {
    return persist ? "waiting_for_signal" : "waiting_offline";
  }
  if (embed === "offline_or_not_started") {
    return persist ? "waiting_for_signal" : "waiting_offline";
  }
  return "ready";
}

/**
 * Fetches `/api/youtube-video-meta` and runs an off-screen embed probe; merges into final status + debug.
 */
function StreamAngleValidationPipeline({
  angleId,
  videoId,
  sourceUrl,
  onSettled,
}: {
  angleId: string;
  videoId: string;
  sourceUrl: string;
  onSettled: (
    rowId: string,
    patch: Pick<
      StreamAngleRow,
      | "status"
      | "debug"
      | "pastBroadcastWarning"
      | "persistentLiveHint"
    >,
  ) => void;
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
      broadIsLive: m?.isLive,
      liveBroadcastContent: m?.liveBroadcastContent,
      streamPhase: m?.streamPhase,
      actualStartTime: m?.actualStartTime,
      actualEndTime: m?.actualEndTime,
      uploadStatus: m?.uploadStatus,
      privacyStatus: m?.privacyStatus,
      publishedAt: m?.publishedAt,
      embeddable: m?.embeddable,
      channelId: m?.channelId,
      channelCustomUrl: m?.channelCustomUrl,
    };

    const finalStatus = computeStreamAngleStatus(emb, meta, {
      persistentLiveUrl: isPersistentYouTubeLiveUrl(sourceUrl),
    });

    const pastBroadcastWarning =
      meta.ok === true &&
      m?.streamPhase === "vod" &&
      m.liveBroadcastContent !== "live" &&
      m.liveBroadcastContent !== "upcoming";

    let persistentLiveHint: string | null | undefined;
    if (sourceUrl.trim() && isYoutubeWatchVideoUrl(sourceUrl)) {
      const cid = m?.channelId;
      const cu = m?.channelCustomUrl;
      if (meta.ok === true && cid) {
        const lines = [`https://www.youtube.com/channel/${cid}/live`];
        if (cu) {
          lines.push(`https://www.youtube.com/@${cu.replace(/^@/, "")}/live`);
        }
        persistentLiveHint = `Prefer a persistent live URL (follows the current live broadcast):\n${lines.join("\n")}`;
      } else if (meta.ok === true) {
        persistentLiveHint =
          "Prefer `youtube.com/channel/CHANNEL_ID/live` or `@handle/live` so one URL always tracks the current live stream.";
      }
    }

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
      broadIsLive: computed.broadIsLive,
      liveBroadcastContent: computed.liveBroadcastContent,
      streamPhase: computed.streamPhase,
      uploadStatus: computed.uploadStatus,
      privacyStatus: computed.privacyStatus,
      publishedAt: computed.publishedAt,
      finalStatus,
    });

    onSettled(angleId, {
      status: finalStatus,
      debug,
      pastBroadcastWarning,
      persistentLiveHint: isYoutubeWatchVideoUrl(sourceUrl)
        ? (persistentLiveHint ?? null)
        : null,
    });
  }, [angleId, onSettled, sourceUrl, videoId]);

  useEffect(() => {
    decidedRef.current = false;
    metaRef.current = "pending";
    embedRef.current = null;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/youtube-video-meta?videoId=${encodeURIComponent(videoId)}&includeChannel=1`,
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
    onSettled(angleId, {
      status: "not_embeddable",
      debug,
      pastBroadcastWarning: false,
      persistentLiveHint: null,
    });
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
  const [creatingYt, setCreatingYt] = useState(false);
  const [ytCreateResult, setYtCreateResult] = useState<{
    watchUrl: string;
    embedUrl: string;
    ingestionAddress: string;
    streamName: string;
    broadcastId: string;
    streamId: string;
    videoId: string;
    channelId?: string;
    channelHandle?: string;
    persistentLiveUrl?: string;
    lastWatchUrl?: string;
  } | null>(null);
  const [ytCreateError, setYtCreateError] = useState<string | null>(null);
  const [cameraPresetName, setCameraPresetName] = useState("Practice Cam");
  const [savedCameras, setSavedCameras] = useState<YouTubeCameraPreset[]>([]);
  const [sessionFromCameraLoadingId, setSessionFromCameraLoadingId] = useState<
    string | null
  >(null);
  const [cameraCopyToast, setCameraCopyToast] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState(false);
  const [loadableSetup, setLoadableSetup] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    window.setTimeout(() => {
      setLoadableSetup(Boolean(raw && safeParseSavedSetup(raw)));
    }, 0);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSavedCameras(
      parseCamerasFromStorage(window.localStorage.getItem(CAMERAS_STORAGE_KEY)),
    );
  }, []);

  const copyText = useCallback(async (label: string, text: string) => {
    const t = text.trim();
    if (!t) {
      window.alert("Nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(t);
      setCameraCopyToast(`Copied ${label}`);
      window.setTimeout(() => setCameraCopyToast(null), 2000);
    } catch {
      window.alert("Could not copy to clipboard.");
    }
  }, []);

  const savedCamerasSorted = useMemo(
    () =>
      [...savedCameras].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [savedCameras],
  );

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
    (
      rowId: string,
      patch: Pick<
        StreamAngleRow,
        | "status"
        | "debug"
        | "pastBroadcastWarning"
        | "persistentLiveHint"
      >,
    ) => {
      setAngles((prev) =>
        prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  // Debounced URL → videoId (watch, /live/, or channel/@ persistent URLs) + checking.
  useEffect(() => {
    const timers: number[] = [];
    for (const row of angles) {
      const rowId = row.id;
      const urlAtSchedule = row.url.trim();
      const tid = window.setTimeout(() => {
        void (async () => {
          const trimmed = urlAtSchedule;
          const applyIfUrl = (next: (a: StreamAngleRow) => StreamAngleRow) => {
            setAngles((prev) => {
              const cur = prev.find((x) => x.id === rowId);
              if (!cur || cur.url.trim() !== urlAtSchedule) return prev;
              return prev.map((a) => (a.id === rowId ? next(a) : a));
            });
          };

          if (!trimmed) {
            applyIfUrl((a) => ({
              ...a,
              videoId: null,
              status: "idle",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: null,
              urlResolveNote: null,
            }));
            return;
          }

          const target = parsePersistentLiveUrlTarget(trimmed);
          if (!target) {
            applyIfUrl((a) => ({
              ...a,
              videoId: null,
              status: "invalid_url",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: null,
              urlResolveNote: null,
            }));
            return;
          }

          if (target.kind === "video") {
            const vid = target.videoId;
            setAngles((prev) => {
              const cur = prev.find((x) => x.id === rowId);
              if (!cur || cur.url.trim() !== urlAtSchedule) return prev;
              return prev.map((a) => {
                if (a.id !== rowId) return a;
                if (a.videoId === vid && a.status !== "invalid_url") return a;
                return {
                  ...a,
                  videoId: vid,
                  status: "checking",
                  debug: null,
                  pastBroadcastWarning: false,
                  persistentLiveHint: isYoutubeWatchVideoUrl(trimmed)
                    ? "Checking channel…"
                    : null,
                  urlResolveNote: null,
                };
              });
            });
            return;
          }

          const q =
            target.kind === "channel_live"
              ? `channelId=${encodeURIComponent(target.channelId)}`
              : `handle=${encodeURIComponent(target.handle)}`;
          let res: Response;
          try {
            res = await fetch(`/api/youtube-resolve-live?${q}`);
          } catch {
            applyIfUrl((a) => ({
              ...a,
              videoId: null,
              status: "invalid_url",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: null,
              urlResolveNote: "Could not reach resolve-live API.",
            }));
            return;
          }
          let data: {
            ok?: boolean;
            videoId?: string | null;
            message?: string;
            mode?: string;
            error?: string;
          } = {};
          try {
            data = (await res.json()) as typeof data;
          } catch {
            data = { ok: false, error: "Invalid JSON" };
          }
          if (!res.ok || data.ok === false) {
            applyIfUrl((a) => ({
              ...a,
              videoId: null,
              status: "invalid_url",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: null,
              urlResolveNote:
                typeof data.error === "string"
                  ? data.error
                  : "Could not resolve /live URL.",
            }));
            return;
          }
          if (!data.videoId) {
            const hintUrl =
              target.kind === "channel_live"
                ? `https://www.youtube.com/channel/${target.channelId}/live`
                : `https://www.youtube.com/@${target.handle}/live`;
            applyIfUrl((a) => ({
              ...a,
              videoId: null,
              status: "waiting_for_signal",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: hintUrl,
              urlResolveNote: "Waiting for live signal from YouTube…",
            }));
            return;
          }

          setAngles((prev) => {
            const cur = prev.find((x) => x.id === rowId);
            if (!cur || cur.url.trim() !== urlAtSchedule) return prev;
            return prev.map((a) => {
              if (a.id !== rowId) return a;
              if (a.videoId === data.videoId && a.status !== "invalid_url")
                return a;
              return {
                ...a,
                videoId: data.videoId!,
                status: "checking",
                debug: null,
                pastBroadcastWarning: false,
                persistentLiveHint:
                  data.mode === "upcoming"
                    ? "Upcoming broadcast — embed will go live at start."
                    : null,
                urlResolveNote: null,
              };
            });
          });
        })();
      }, 500);
      timers.push(tid);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [angles]);

  const launchableAngles = useMemo(
    () => angles.filter(isLaunchableStreamAngle),
    [angles],
  );

  const startEnabled = launchableAngles.length > 0 && !starting;

  const startLiveSession = useCallback(async () => {
    if (!startEnabled) return;
    const candidates = angles.filter(isLaunchableStreamAngle);
    if (candidates.length === 0) return;

    const roomId = Math.random().toString(36).substring(2, 8);
    markRoomHost(roomId);
    setStarting(true);

    const resolved: Array<{ id: string; name: string; videoId: string }> = [];
    try {
      for (const a of candidates) {
        if (a.videoId && /^[a-zA-Z0-9_-]{11}$/.test(a.videoId)) {
          resolved.push({
            id: a.id,
            name: a.name.trim() || "Angle",
            videoId: a.videoId,
          });
          continue;
        }
        const target = parsePersistentLiveUrlTarget(a.url.trim());
        if (!target || target.kind === "video") {
          throw new Error("Unexpected angle without video id.");
        }
        const q =
          target.kind === "channel_live"
            ? `channelId=${encodeURIComponent(target.channelId)}`
            : `handle=${encodeURIComponent(target.handle)}`;
        let res: Response;
        try {
          res = await fetch(`/api/youtube-resolve-live?${q}`);
        } catch {
          throw new Error("Could not reach resolve-live API.");
        }
        let data: { ok?: boolean; videoId?: string | null; error?: string } =
          {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = { ok: false };
        }
        if (!res.ok || data.ok === false) {
          const msg =
            typeof data.error === "string" && data.error.trim() !== ""
              ? data.error
              : "Could not resolve /live URL.";
          throw new Error(msg);
        }
        const vid =
          typeof data.videoId === "string" ? data.videoId.trim() : "";
        if (!/^[a-zA-Z0-9_-]{11}$/.test(vid)) {
          throw new Error(
            "Waiting for live signal from YouTube — no broadcast id yet. Try again shortly.",
          );
        }
        resolved.push({
          id: a.id,
          name: a.name.trim() || "Angle",
          videoId: vid,
        });
      }

      const primary = resolved[0]!;
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
        angles: resolved.map((row) => ({
          id: row.id,
          name: row.name,
          videoId: row.videoId,
          offsetFromGameTime: 0,
        })),
        updatedAt: serverTimestamp(),
        action: "init",
        actionId: 1,
      };

      await set(ref(db, `rooms/${roomId}`), payload);
      router.push(`/room/${roomId}?view=sync`);
    } catch (err) {
      console.error("[Stream Room] create room failed", err);
      window.alert(
        err instanceof Error
          ? err.message
          : "Could not start live session. Check Firebase permissions.",
      );
      setStarting(false);
    }
  }, [angles, router, startEnabled]);

  const saveCameraPreset = useCallback(() => {
    if (!ytCreateResult) return;
    const nameTrim = cameraPresetName.trim() || "Practice Cam";
    let persistentUrl = ytCreateResult.persistentLiveUrl?.trim();
    if (!persistentUrl) {
      const cid = ytCreateResult.channelId?.trim();
      if (cid && CHANNEL_ID_PRESET_RE.test(cid)) {
        persistentUrl = `https://www.youtube.com/channel/${cid}/live`;
      } else if (ytCreateResult.channelHandle?.trim()) {
        const h = ytCreateResult.channelHandle.trim().replace(/^@/, "");
        persistentUrl = `https://www.youtube.com/@${h}/live`;
      }
    }
    const preset: YouTubeCameraPreset = {
      id: newId("cam"),
      name: nameTrim,
      streamId: ytCreateResult.streamId,
      ingestionAddress: ytCreateResult.ingestionAddress,
      streamName: ytCreateResult.streamName,
      ...(ytCreateResult.channelId?.trim() &&
      CHANNEL_ID_PRESET_RE.test(ytCreateResult.channelId.trim())
        ? { channelId: ytCreateResult.channelId.trim() }
        : {}),
      ...(ytCreateResult.channelHandle?.trim()
        ? { channelHandle: ytCreateResult.channelHandle.trim().replace(/^@/, "") }
        : {}),
      ...(persistentUrl ? { persistentLiveUrl: persistentUrl } : {}),
      ...(ytCreateResult.lastWatchUrl?.trim() || ytCreateResult.watchUrl?.trim()
        ? {
            lastWatchUrl: (
              ytCreateResult.lastWatchUrl ?? ytCreateResult.watchUrl
            ).trim(),
          }
        : {}),
      createdAt: new Date().toISOString(),
    };
    setSavedCameras((prev) => {
      const next = [preset, ...prev];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CAMERAS_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [ytCreateResult, cameraPresetName]);

  const fillFirstAngleWithUrl = useCallback((url: string) => {
    const finalUrl = url.trim();
    console.log("FILM_ROOM_LOAD_LIVE_URL", {
      source: "fillFirstAngleWithUrl",
      inputUrl: url,
      finalUrl,
      length: finalUrl.length,
    });
    setAngles((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((a, i) =>
        i === 0
          ? {
              ...a,
              url: finalUrl,
              videoId: null,
              status: "idle",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: null,
              urlResolveNote: null,
            }
          : a,
      );
    });
  }, []);

  const loadCameraPresetIntoAngle = useCallback((cam: YouTubeCameraPreset) => {
    const { preset: augmented, didAddPersistent } =
      augmentPresetPersistentForStorage(cam);
    if (didAddPersistent) {
      setSavedCameras((prev) => {
        const next = prev.map((c) => (c.id === augmented.id ? augmented : c));
        if (typeof window !== "undefined") {
          window.localStorage.setItem(CAMERAS_STORAGE_KEY, JSON.stringify(next));
        }
        return next;
      });
    }
    const url = persistentLiveViewUrlFromPreset(augmented);
    if (!url) {
      window.alert(
        "This camera preset does not have a persistent live URL. Recreate the camera preset or use Start Session with Camera to generate one.",
      );
      return;
    }
    const inputUrl =
      augmented.persistentLiveUrl?.trim() ??
      (augmented.channelId?.trim() &&
      CHANNEL_ID_PRESET_RE.test(augmented.channelId.trim())
        ? `https://www.youtube.com/channel/${augmented.channelId.trim()}/live`
        : augmented.channelHandle?.trim()
          ? `https://www.youtube.com/@${augmented.channelHandle.replace(/^@/, "")}/live`
          : "");
    const finalUrl = url.trim();
    console.log("FILM_ROOM_LOAD_LIVE_URL", {
      source: "loadCameraPresetIntoAngle",
      inputUrl: inputUrl || finalUrl,
      finalUrl,
      length: finalUrl.length,
    });
    setAngles((prev) => {
      if (prev.length === 0) return prev;
      const idx = pickAngleIndexForPresetLoad(prev);
      return prev.map((a, i) =>
        i === idx
          ? {
              ...a,
              name: augmented.name.trim() || a.name,
              url: finalUrl,
              videoId: null,
              status: "idle",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: null,
              urlResolveNote: null,
            }
          : a,
      );
    });
  }, [setSavedCameras]);

  const startSessionWithCamera = useCallback(
    async (cam: YouTubeCameraPreset) => {
      if (!cam.streamId.trim()) {
        window.alert(
          "This preset has no stream id. Create a camera stream again and save the preset.",
        );
        return;
      }
      if (sessionFromCameraLoadingId) return;
      setSessionFromCameraLoadingId(cam.id);
      try {
        const { accessToken } = await getYouTubeOAuthAccessToken();
        const res = await fetch("/api/youtube/create-broadcast-from-stream", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            streamId: cam.streamId,
            title: "Practice Session",
            description: "Film Room session",
            privacyStatus: "unlisted",
          }),
        });
        let data: unknown = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (!res.ok) {
          const e = data as { error?: unknown; reason?: unknown };
          const msg =
            typeof e?.error === "string" && e.error.trim() !== ""
              ? e.error.trim()
              : `create-broadcast-from-stream failed (HTTP ${res.status}).`;
          const extra =
            typeof e?.reason === "string" && e.reason.trim() !== ""
              ? ` (${e.reason.trim()})`
              : "";
          throw new Error(`${msg}${extra}`);
        }
        const ok = data as {
          ok?: boolean;
          watchUrl?: string;
          channelId?: string;
          channelHandle?: string;
          persistentLiveUrl?: string;
        };
        if (ok.ok !== true || typeof ok.watchUrl !== "string") {
          throw new Error("Invalid response from create-broadcast-from-stream.");
        }
        const watch = ok.watchUrl.trim();
        const merged: YouTubeCameraPreset = {
          ...cam,
          ...(typeof ok.channelId === "string" &&
          CHANNEL_ID_PRESET_RE.test(ok.channelId.trim())
            ? { channelId: ok.channelId.trim() }
            : {}),
          ...(typeof ok.channelHandle === "string" && ok.channelHandle.trim() !== ""
            ? { channelHandle: ok.channelHandle.trim().replace(/^@/, "") }
            : {}),
          ...(typeof ok.persistentLiveUrl === "string" &&
          ok.persistentLiveUrl.trim() !== ""
            ? { persistentLiveUrl: ok.persistentLiveUrl.trim() }
            : {}),
          lastWatchUrl: watch,
        };
        const { preset: mergedWithDerived, didAddPersistent } =
          augmentPresetPersistentForStorage(merged);
        const storedPreset = didAddPersistent ? mergedWithDerived : merged;
        const angleUrl = persistentLiveViewUrlFromPreset(storedPreset);
        if (angleUrl) {
          fillFirstAngleWithUrl(angleUrl);
        } else {
          window.alert(
            "This camera preset does not have a persistent live URL. The new broadcast was saved as Last archive URL only. Recreate the camera preset or add channel / @handle metadata so a /live URL can be used for angles.",
          );
        }
        setSavedCameras((prev) => {
          const next = prev.map((c) => (c.id === cam.id ? storedPreset : c));
          if (typeof window !== "undefined") {
            window.localStorage.setItem(CAMERAS_STORAGE_KEY, JSON.stringify(next));
          }
          return next;
        });
      } catch (err) {
        window.alert(
          err instanceof Error && err.message.trim()
            ? err.message
            : "Could not start session with camera.",
        );
      } finally {
        setSessionFromCameraLoadingId(null);
      }
    },
    [sessionFromCameraLoadingId, fillFirstAngleWithUrl],
  );

  const createYouTubeStream = useCallback(async () => {
    if (creatingYt) return;
    setCreatingYt(true);
    setYtCreateResult(null);
    setYtCreateError(null);
    try {
      const { accessToken } = await getYouTubeOAuthAccessToken();
      const res = await fetch("/api/youtube/create-live-stream", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Practice Stream",
          description: "Created by Film Room",
          privacyStatus: "unlisted",
        }),
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        const e = data as { error?: unknown; reason?: unknown; status?: unknown };
        const msg =
          typeof e?.error === "string" && e.error.trim() !== ""
            ? e.error.trim()
            : `YouTube create-live-stream failed (HTTP ${res.status}).`;
        const extra =
          typeof e?.reason === "string" && e.reason.trim() !== ""
            ? ` (${e.reason.trim()})`
            : "";
        throw new Error(`${msg}${extra}`);
      }
      const ok = data as {
        ok?: boolean;
        watchUrl?: string;
        embedUrl?: string;
        ingestionAddress?: string;
        streamName?: string;
        broadcastId?: string;
        streamId?: string;
        videoId?: string;
        channelId?: string;
        channelHandle?: string;
        persistentLiveUrl?: string;
        lastWatchUrl?: string;
      };
      if (ok.ok !== true) {
        throw new Error("YouTube create-live-stream returned ok=false.");
      }
      if (
        typeof ok.watchUrl !== "string" ||
        typeof ok.embedUrl !== "string" ||
        typeof ok.broadcastId !== "string" ||
        typeof ok.streamId !== "string"
      ) {
        throw new Error("YouTube create-live-stream response missing fields.");
      }
      const videoId =
        typeof ok.videoId === "string" && ok.videoId.trim() !== ""
          ? ok.videoId.trim()
          : ok.broadcastId.trim();
      setYtCreateResult({
        watchUrl: ok.watchUrl,
        embedUrl: ok.embedUrl,
        ingestionAddress: typeof ok.ingestionAddress === "string" ? ok.ingestionAddress : "",
        streamName: typeof ok.streamName === "string" ? ok.streamName : "",
        broadcastId: ok.broadcastId,
        streamId: ok.streamId,
        videoId,
        ...(typeof ok.channelId === "string" && ok.channelId.trim() !== ""
          ? { channelId: ok.channelId.trim() }
          : {}),
        ...(typeof ok.channelHandle === "string" && ok.channelHandle.trim() !== ""
          ? { channelHandle: ok.channelHandle.trim() }
          : {}),
        ...(typeof ok.persistentLiveUrl === "string" &&
        ok.persistentLiveUrl.trim() !== ""
          ? { persistentLiveUrl: ok.persistentLiveUrl.trim() }
          : {}),
        ...(typeof ok.lastWatchUrl === "string" && ok.lastWatchUrl.trim() !== ""
          ? { lastWatchUrl: ok.lastWatchUrl.trim() }
          : { lastWatchUrl: ok.watchUrl.trim() }),
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Could not create YouTube live stream.";
      setYtCreateError(msg);
    } finally {
      setCreatingYt(false);
    }
  }, [creatingYt]);

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
          <h2 className="text-sm font-semibold text-white">Camera Setup</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            Open Larix Broadcaster, Streamlabs, or another RTMP camera app. Paste the
            RTMP Server URL and Stream Key once and save the preset — your phone stays
            configured. Each practice, use <strong className="text-zinc-200">Start Session with Camera</strong>{" "}
            to create a <em>new</em> YouTube broadcast bound to the same RTMP stream, then
            start your Film Room when ready.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Creating a stream signs you in with Google (YouTube scope) and does not start
            a Film Room session.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-[200px] flex-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
              Camera name (saved preset)
              <input
                type="text"
                value={cameraPresetName}
                onChange={(e) => setCameraPresetName(e.target.value)}
                placeholder="Practice Cam"
                className={`${inputClass} mt-1 normal-case tracking-normal`}
              />
            </label>
            <button
              type="button"
              onClick={() => void createYouTubeStream()}
              className={ghostBtn}
              disabled={creatingYt}
            >
              {creatingYt ? "Creating…" : "Create / Reuse YouTube Camera Stream"}
            </button>
          </div>

          {cameraCopyToast ? (
            <p className="mt-2 text-xs text-emerald-200">{cameraCopyToast}</p>
          ) : null}

          {ytCreateError ? (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {ytCreateError}
            </div>
          ) : null}

          {ytCreateResult ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                      RTMP Server URL
                    </div>
                    <div className="mt-1 break-all font-mono text-zinc-200">
                      {ytCreateResult.ingestionAddress || "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${ghostBtn} shrink-0`}
                    onClick={() =>
                      void copyText("RTMP Server", ytCreateResult.ingestionAddress)
                    }
                  >
                    Copy RTMP Server
                  </button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                      Stream Key
                    </div>
                    <div className="mt-1 break-all font-mono text-zinc-200">
                      {ytCreateResult.streamName || "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${ghostBtn} shrink-0`}
                    onClick={() =>
                      void copyText("Stream Key", ytCreateResult.streamName)
                    }
                  >
                    Copy Stream Key
                  </button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                      Watch URL
                    </div>
                    <a
                      href={ytCreateResult.watchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all text-blue-200 hover:text-blue-100"
                    >
                      {ytCreateResult.watchUrl}
                    </a>
                  </div>
                  <button
                    type="button"
                    className={`${ghostBtn} shrink-0`}
                    onClick={() => void copyText("Watch URL", ytCreateResult.watchUrl)}
                  >
                    Copy Watch URL
                  </button>
                </div>
                {ytCreateResult.persistentLiveUrl ? (
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    <span className="font-medium text-emerald-200">Persistent live: </span>
                    <span className="break-all">{ytCreateResult.persistentLiveUrl}</span>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={saveCameraPreset} className={ghostBtn}>
                  Save camera preset
                </button>
                <span className="text-xs text-zinc-500">
                  Saves stream id, RTMP, persistent /live URL when available, and last
                  archive watch URL (reference only) in {CAMERAS_STORAGE_KEY}.
                </span>
              </div>
            </div>
          ) : null}

          {savedCamerasSorted.length > 0 ? (
            <div className="mt-6 border-t border-white/[0.06] pt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Saved cameras
              </h3>
              <ul className="mt-3 space-y-3">
                {savedCamerasSorted.map((cam) => {
                  const liveUrlDisplay = persistentLiveViewUrlFromPreset(cam);
                  return (
                  <li
                    key={cam.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{cam.name}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          RTMP/key already configured on phone
                        </p>
                        {liveUrlDisplay ? (
                          <p className="mt-1 break-all text-[11px] text-emerald-200/90">
                            Live view (/live): {liveUrlDisplay}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-amber-200/85">
                            No /live URL yet — add channel metadata or recreate the preset.
                          </p>
                        )}
                        {cam.lastWatchUrl ? (
                          <p className="mt-1 break-all text-[11px] text-zinc-500">
                            Last archive URL: {cam.lastWatchUrl}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          className={ghostBtn}
                          onClick={() =>
                            void copyText("RTMP Server", cam.ingestionAddress)
                          }
                        >
                          Copy RTMP Server
                        </button>
                        <button
                          type="button"
                          className={ghostBtn}
                          onClick={() => void copyText("Stream Key", cam.streamName)}
                        >
                          Copy Stream Key
                        </button>
                        <button
                          type="button"
                          className={ghostBtn}
                          onClick={() => loadCameraPresetIntoAngle(cam)}
                        >
                          Load into Angle
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-blue-500/35 bg-blue-600/25 px-3 py-2 text-xs font-semibold text-white transition hover:border-blue-400/50 hover:bg-blue-600/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={sessionFromCameraLoadingId !== null}
                          onClick={() => void startSessionWithCamera(cam)}
                        >
                          {sessionFromCameraLoadingId === cam.id
                            ? "Creating session…"
                            : "Start Session with Camera"}
                        </button>
                      </div>
                    </div>
                  </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
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
                    placeholder="youtube.com/channel/…/live, @handle/live, watch?v=…"
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
                    sourceUrl={a.url}
                    onSettled={handleStreamAngleSettled}
                  />
                ) : null}

                {(a.persistentLiveHint ||
                  a.urlResolveNote ||
                  a.pastBroadcastWarning) ? (
                  <div className="md:col-span-12 space-y-2 text-[11px] leading-snug">
                    {a.persistentLiveHint ? (
                      <p className="rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-amber-100/95">
                        {a.persistentLiveHint}
                      </p>
                    ) : null}
                    {a.urlResolveNote ? (
                      <p className="rounded-lg border border-zinc-500/25 bg-zinc-900/50 px-3 py-2 text-zinc-300">
                        {a.urlResolveNote}
                      </p>
                    ) : null}
                    {a.pastBroadcastWarning ? (
                      <p className="rounded-lg border border-rose-500/35 bg-rose-950/30 px-3 py-2 text-rose-100">
                        This link is pointing to a past broadcast (VOD), not the
                        current live feed. Prefer a channel or @handle /live URL for
                        Stream Room.
                      </p>
                    ) : null}
                  </div>
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
                            liveBroadcastContent:
                              a.debug.computed.liveBroadcastContent,
                            streamPhase: a.debug.computed.streamPhase,
                            actualStartTime: a.debug.computed.actualStartTime,
                            actualEndTime: a.debug.computed.actualEndTime,
                            broadIsLive: a.debug.computed.broadIsLive,
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
              {angles.some(
                (a) =>
                  a.status === "waiting_offline" || a.status === "stream_ended",
              ) ? (
                <span className="text-amber-200">
                  Some angles are waiting, offline, or the last broadcast ended.
                  Persistent /live URLs stay valid — you can still start, then use
                  Live / Go Live in the room when the feed is up.
                </span>
              ) : angles.some((a) => a.status === "waiting_for_signal") ? (
                <span className="text-sky-200/95">
                  Channel / @handle /live angles may show “waiting for signal” while
                  YouTube catches up — you can still start; playback in the room is
                  not blocked by that label.
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

