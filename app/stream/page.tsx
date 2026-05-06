"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SetStateAction,
} from "react";
import { ref, serverTimestamp, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { markRoomHost } from "@/lib/room-host";
import { getYouTubeOAuthAccessToken } from "@/lib/auth-google";
import {
  isPersistentChannelOrHandleLiveUrl,
  parsePersistentLiveUrlTarget,
} from "@/lib/youtube-id";

type AngleStatus =
  | "idle"
  | "ready"
  | "live_ready"
  | "waiting_for_signal"
  | "waiting_offline"
  | "app_created_live"
  | "stream_ended"
  | "invalid_url"
  | "not_embeddable";

/** Temporary Stream Room diagnostics (UI + console). */
type StreamAngleDebug = {
  /** Reserved for future Stream Room diagnostics. */
  note?: string;
};

type StreamAngleRow = {
  id: string;
  name: string;
  url: string;
  videoId: string | null;
  status: AngleStatus;
  /** Set when URL came from YouTube API (e.g. find-broadcast or manual). */
  appCreatedLive?: boolean;
  source?: "youtube_api_broadcast";
  createdBroadcastId?: string;
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
  if (a.status === "app_created_live") {
    const t = parsePersistentLiveUrlTarget(a.url.trim());
    return Boolean(t && t.kind === "video");
  }
  if (a.appCreatedLive === true) {
    const t = parsePersistentLiveUrlTarget(a.url.trim());
    return Boolean(t && t.kind === "video");
  }
  if (Boolean(a.videoId)) return true;
  return false;
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
 * Daily “Get Watch Link” only reads existing live broadcasts; it does not create new ones.
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
  /** Last time Verify Camera Stream succeeded (ISO string). */
  lastVerifiedAt?: string;
  lastVerifiedStreamTitle?: string;
  lastVerifiedStreamStatus?: string;
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

function isCameraPresetIncomplete(cam: YouTubeCameraPreset): boolean {
  return (
    !cam.streamId?.trim() ||
    !cam.ingestionAddress?.trim() ||
    !cam.streamName?.trim()
  );
}

type CameraSessionVerify = {
  broadcastId: string;
  requestedStreamId: string;
  boundStreamId: string;
  boundMatchesRequested: boolean;
  ingestionAddress: string;
  streamName: string;
  streamTitle: string;
  streamStatus: string;
};

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
      const lastVerifiedAt = optionalTrimString(o.lastVerifiedAt);
      const lastVerifiedStreamTitle = optionalTrimString(o.lastVerifiedStreamTitle);
      const lastVerifiedStreamStatus = optionalTrimString(o.lastVerifiedStreamStatus);
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
        ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
        ...(lastVerifiedStreamTitle ? { lastVerifiedStreamTitle } : {}),
        ...(lastVerifiedStreamStatus ? { lastVerifiedStreamStatus } : {}),
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
    case "waiting_for_signal":
      return "border-sky-400/35 bg-sky-500/15 text-sky-100";
    case "waiting_offline":
      return "border-amber-400/30 bg-amber-500/15 text-amber-200";
    case "app_created_live":
      return "border-violet-400/35 bg-violet-500/15 text-violet-100";
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
    case "app_created_live":
      return "Ready — app-created live link";
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
  const [angles, setAnglesState] = useState<StreamAngleRow[]>(() => defaultRows());

  const setAngles = useCallback((update: SetStateAction<StreamAngleRow[]>) => {
    setAnglesState((prev) => {
      const next =
        typeof update === "function"
          ? (update as (p: StreamAngleRow[]) => StreamAngleRow[])(prev)
          : update;
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const row of next) {
        const old = byId.get(row.id);
        if (old !== undefined && old.url !== row.url) {
          console.log("ANGLE_URL_WRITE", {
            angleId: row.id,
            before: old.url,
            after: row.url,
            lengthBefore: old.url.length,
            lengthAfter: row.url.length,
            stack: new Error().stack,
          });
        }
      }
      return next;
    });
  }, []);
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
  const [apiCallCounts, setApiCallCounts] = useState<{
    youtubeVideoMeta: number;
    youtubeResolveLive: number;
    findBroadcast: number;
  }>({ youtubeVideoMeta: 0, youtubeResolveLive: 0, findBroadcast: 0 });
  const bumpApiCount = useCallback(
    (key: keyof typeof apiCallCounts) => {
      setApiCallCounts((prev) => ({ ...prev, [key]: prev[key] + 1 }));
    },
    [setApiCallCounts],
  );
  const [sessionFromCameraLoadingId, setSessionFromCameraLoadingId] = useState<
    string | null
  >(null);
  const [cameraActiveLinkStatus, setCameraActiveLinkStatus] = useState<
    { kind: "resolving" | "success" | "warning"; message: string } | null
  >(null);
  const [cameraActiveResolveDebug, setCameraActiveResolveDebug] = useState<{
    foundActiveBoundCount: number;
    foundUpcomingBoundCount: number;
    selectedBroadcastId: string | null;
    selectedVideoId: string | null;
    noCreateAttempted: boolean;
    foundAcceptableLive?: boolean;
    foundOnlyUpcomingBound?: boolean;
    lifeCycleStatus?: string;
    finalAngleUrl?: string;
  } | null>(null);
  const [manualLiveLinkDraft, setManualLiveLinkDraft] = useState("");
  const [cameraSessionVerify, setCameraSessionVerify] =
    useState<CameraSessionVerify | null>(null);
  const [verifyCameraLoadingId, setVerifyCameraLoadingId] = useState<
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
  }, [setAngles]);

  const setAngleField = useCallback(
    (id: string, patch: Partial<Pick<StreamAngleRow, "name" | "url">>) => {
      setAngles((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          if (patch.url !== undefined) {
            const incoming = patch.url;
            const clearAppMeta = {
              appCreatedLive: undefined,
              source: undefined,
              createdBroadcastId: undefined,
            };
            if (incoming.trim() === "") {
              return { ...a, ...patch, ...clearAppMeta };
            }
            const prevUrl = a.url;
            if (
              isPersistentChannelOrHandleLiveUrl(prevUrl) &&
              incoming !== prevUrl &&
              prevUrl.startsWith(incoming.trim()) &&
              incoming.trim().length < prevUrl.trim().length
            ) {
              console.warn("FILM_ROOM blocked persistent /live URL truncation", {
                prevUrl,
                rejected: incoming,
              });
              return { ...a, ...patch, url: prevUrl };
            }
            if (incoming.trim() !== prevUrl.trim()) {
              return { ...a, ...patch, ...clearAppMeta };
            }
          }
          return { ...a, ...patch };
        }),
      );
    },
    [setAngles],
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
  }, [setAngles]);

  const removeAngle = useCallback((id: string) => {
    setAngles((prev) => prev.filter((a) => a.id !== id));
  }, [setAngles]);

  // Debounced URL → videoId (watch, /live/, or channel/@ persistent URLs) + checking.
  useEffect(() => {
    const timers: number[] = [];
    const clearedAppBroadcastMeta = {
      appCreatedLive: undefined,
      source: undefined,
      createdBroadcastId: undefined,
    } as const;
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
              url: a.url,
              videoId: null,
              status: "idle",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: null,
              urlResolveNote: null,
              ...clearedAppBroadcastMeta,
            }));
            return;
          }

          const target = parsePersistentLiveUrlTarget(trimmed);
          if (!target) {
            applyIfUrl((a) => ({
              ...a,
              url: a.url,
              videoId: null,
              status: "invalid_url",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: null,
              urlResolveNote: null,
              ...clearedAppBroadcastMeta,
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
                  url: a.url,
                  videoId: vid,
                  status: a.appCreatedLive === true ? "app_created_live" : "ready",
                  debug: null,
                  pastBroadcastWarning: false,
                  persistentLiveHint: null,
                  urlResolveNote:
                    a.appCreatedLive === true
                      ? "Film Room will load this YouTube live player directly."
                      : null,
                };
              });
            });
            return;
          }

          const hintUrl =
            target.kind === "channel_live"
              ? `https://www.youtube.com/channel/${target.channelId}/live`
              : `https://www.youtube.com/@${target.handle}/live`;
          applyIfUrl((a) => ({
            ...a,
            url: a.url,
            videoId: null,
            status: "waiting_for_signal",
            debug: null,
            pastBroadcastWarning: false,
            persistentLiveHint: hintUrl,
            urlResolveNote:
              "Persistent /live URLs are not resolved in Daily Use Mode. Paste a direct `youtube.com/live/VIDEO_ID` (or use Get Watch Link).",
          }));
        })();
      }, 500);
      timers.push(tid);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [angles, setAngles]);

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
        throw new Error(
          "Angle is missing a YouTube video id. Paste a direct `youtube.com/live/VIDEO_ID` URL (or use Get Watch Link).",
        );
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

  const fillFirstAngleWithUrl = useCallback(
    (
      url: string,
      fromYouTubeBroadcast?: {
        appCreatedLive: true;
        source: "youtube_api_broadcast";
        createdBroadcastId: string;
      },
    ) => {
      const finalUrl = url.trim();
      console.log("FILM_ROOM_LOAD_LIVE_URL", {
        source: "fillFirstAngleWithUrl",
        inputUrl: url,
        finalUrl,
        length: finalUrl.length,
        fromYouTubeBroadcast: Boolean(fromYouTubeBroadcast),
      });
      setAngles((prev) => {
        if (prev.length === 0) return prev;
        const idx = Math.max(0, prev.findIndex((a) => !a.url.trim()));
        const t = parsePersistentLiveUrlTarget(finalUrl);
        const derivedVid = t && t.kind === "video" ? t.videoId : null;
        const trustedAppCreated = Boolean(fromYouTubeBroadcast && derivedVid);
        return prev.map((a, i) =>
          i === idx
            ? {
                ...a,
                url: finalUrl,
                videoId: derivedVid,
                status: trustedAppCreated
                  ? "app_created_live"
                  : derivedVid
                    ? "ready"
                    : "idle",
                debug: null,
                pastBroadcastWarning: false,
                persistentLiveHint: null,
                urlResolveNote: trustedAppCreated
                  ? "Film Room will load this YouTube live player directly."
                  : null,
                ...(fromYouTubeBroadcast
                  ? {
                      appCreatedLive: true,
                      source: fromYouTubeBroadcast.source,
                      createdBroadcastId: fromYouTubeBroadcast.createdBroadcastId,
                    }
                  : {
                      appCreatedLive: undefined,
                      source: undefined,
                      createdBroadcastId: undefined,
                    }),
              }
            : a,
        );
      });
    },
    [setAngles],
  );

  const verifyCameraStream = useCallback(async (cam: YouTubeCameraPreset) => {
    if (!cam.streamId.trim()) {
      window.alert("This preset has no stream id.");
      return;
    }
    if (verifyCameraLoadingId !== null) return;
    setVerifyCameraLoadingId(cam.id);
    try {
      const { accessToken } = await getYouTubeOAuthAccessToken();
      const res = await fetch("/api/youtube/verify-live-stream", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ streamId: cam.streamId.trim() }),
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      const body = data as { ok?: boolean; error?: string };
      if (!res.ok || body.ok !== true) {
        window.alert(
          typeof body.error === "string" && body.error.trim() !== ""
            ? body.error.trim()
            : `Verify failed (HTTP ${res.status}).`,
        );
        return;
      }
      const ok = data as {
        streamId?: string;
        ingestionAddress?: string;
        streamName?: string;
        streamTitle?: string;
        streamStatus?: string;
      };
      const verifiedAt = new Date().toISOString();
      setSavedCameras((prev) => {
        const next = prev.map((c) =>
          c.id === cam.id
            ? {
                ...c,
                lastVerifiedAt: verifiedAt,
                lastVerifiedStreamTitle:
                  typeof ok.streamTitle === "string" ? ok.streamTitle.trim() : "",
                lastVerifiedStreamStatus:
                  typeof ok.streamStatus === "string" ? ok.streamStatus.trim() : "",
              }
            : c,
        );
        if (typeof window !== "undefined") {
          window.localStorage.setItem(CAMERAS_STORAGE_KEY, JSON.stringify(next));
        }
        return next;
      });
      window.alert(
        [
          `Stream ID: ${ok.streamId ?? ""}`,
          `Title: ${ok.streamTitle ?? ""}`,
          `Status: ${ok.streamStatus ?? ""}`,
          `RTMP server: ${ok.ingestionAddress ?? ""}`,
          `Stream key: ${ok.streamName ?? ""}`,
        ].join("\n"),
      );
    } catch (err) {
      window.alert(
        err instanceof Error && err.message.trim()
          ? err.message
          : "Could not verify stream.",
      );
    } finally {
      setVerifyCameraLoadingId(null);
    }
  }, [verifyCameraLoadingId]);

  const deleteCameraPreset = useCallback(
    (cam: YouTubeCameraPreset) => {
      const ok = window.confirm(
        "This removes the saved camera preset from this browser. It does NOT delete the YouTube stream.",
      );
      if (!ok) return;
      setSavedCameras((prev) => {
        const next = prev.filter((c) => c.id !== cam.id);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(CAMERAS_STORAGE_KEY, JSON.stringify(next));
        }
        return next;
      });
    },
    [setSavedCameras],
  );

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
      setCameraSessionVerify(null);
      setCameraActiveResolveDebug(null);
      setCameraActiveLinkStatus({
        kind: "resolving",
        message: "Getting watch link…",
      });
      try {
        const { accessToken } = await getYouTubeOAuthAccessToken();

        bumpApiCount("findBroadcast");
        const existingRes = await fetch("/api/youtube/find-broadcast-for-stream", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ streamId: cam.streamId.trim() }),
        });

        const existingJson = (await existingRes.json()) as {
          ok?: boolean;
          message?: string;
          foundAcceptableLive?: boolean;
          foundActiveBoundCount?: number;
          foundUpcomingBoundCount?: number;
          foundOnlyUpcomingBound?: boolean;
          noCreateAttempted?: boolean;
          broadcastId?: string;
          videoId?: string;
          watchUrl?: string;
          lifeCycleStatus?: string;
          selectedBroadcastId?: string | null;
          selectedVideoId?: string | null;
          boundStreamId?: string;
        };

        const foundActiveBoundCount =
          typeof existingJson.foundActiveBoundCount === "number"
            ? existingJson.foundActiveBoundCount
            : 0;
        const foundUpcomingBoundCount =
          typeof existingJson.foundUpcomingBoundCount === "number"
            ? existingJson.foundUpcomingBoundCount
            : 0;
        const selectedBroadcastId =
          typeof existingJson.selectedBroadcastId === "string"
            ? existingJson.selectedBroadcastId
            : null;
        const selectedVideoId =
          typeof existingJson.selectedVideoId === "string"
            ? existingJson.selectedVideoId
            : null;

        if (!existingRes.ok || existingJson.ok !== true) {
          const msg =
            typeof existingJson.message === "string" && existingJson.message.trim() !== ""
              ? existingJson.message.trim()
              : `find-broadcast-for-stream failed (HTTP ${existingRes.status}).`;
          window.alert(msg);
          setCameraActiveResolveDebug({
            foundActiveBoundCount,
            foundUpcomingBoundCount,
            selectedBroadcastId,
            selectedVideoId,
            noCreateAttempted: true,
          });
          setCameraActiveLinkStatus(null);
          return;
        }

        const noCreateAttempted = existingJson.noCreateAttempted !== false;

        setCameraActiveResolveDebug({
          foundActiveBoundCount,
          foundUpcomingBoundCount,
          selectedBroadcastId,
          selectedVideoId,
          noCreateAttempted,
          foundAcceptableLive: existingJson.foundAcceptableLive === true,
          foundOnlyUpcomingBound: existingJson.foundOnlyUpcomingBound === true,
          lifeCycleStatus:
            typeof existingJson.lifeCycleStatus === "string"
              ? existingJson.lifeCycleStatus
              : undefined,
          finalAngleUrl: undefined,
        });

        if (existingJson.foundAcceptableLive === true) {
          const vid =
            typeof existingJson.videoId === "string" ? existingJson.videoId.trim() : "";
          const broadcastId =
            typeof existingJson.broadcastId === "string"
              ? existingJson.broadcastId.trim()
              : vid;
          const finalUrl =
            vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)
              ? `https://youtube.com/live/${vid}`
              : typeof existingJson.watchUrl === "string"
                ? existingJson.watchUrl.trim()
                : "";

          if (!finalUrl) {
            window.alert("Could not build watch URL from YouTube response.");
            setCameraActiveLinkStatus(null);
            return;
          }

          setCameraActiveResolveDebug((prev) =>
            prev
              ? {
                  ...prev,
                  finalAngleUrl: finalUrl,
                  lifeCycleStatus:
                    typeof existingJson.lifeCycleStatus === "string"
                      ? existingJson.lifeCycleStatus
                      : prev.lifeCycleStatus,
                }
              : prev,
          );

          setCameraActiveLinkStatus({
            kind: "success",
            message: "Using currently live broadcast.",
          });

          setAngles((prev) => {
            if (prev.length === 0) return prev;
            const idx = Math.max(0, prev.findIndex((a) => !a.url.trim()));
            const t = parsePersistentLiveUrlTarget(finalUrl);
            const derivedVid = t && t.kind === "video" ? t.videoId : null;
            return prev.map((a, i) =>
              i === idx
                ? {
                    ...a,
                    name: cam.name.trim() || a.name,
                    url: finalUrl,
                    videoId: derivedVid ?? (vid || null),
                    status: derivedVid || vid ? "app_created_live" : "idle",
                    debug: null,
                    pastBroadcastWarning: false,
                    persistentLiveHint: null,
                    urlResolveNote: null,
                    appCreatedLive: true,
                    source: "youtube_api_broadcast",
                    createdBroadcastId: broadcastId || undefined,
                  }
                : a,
            );
          });

          fillFirstAngleWithUrl(finalUrl, {
            appCreatedLive: true,
            source: "youtube_api_broadcast",
            createdBroadcastId: broadcastId,
          });
          return;
        }

        if (existingJson.foundOnlyUpcomingBound === true) {
          setCameraActiveLinkStatus({
            kind: "warning",
            message:
              "Found only an upcoming/waiting broadcast, not the live stream. Start the phone stream or paste the working YouTube live link.",
          });
          return;
        }

        setCameraActiveLinkStatus({
          kind: "warning",
          message:
            "No active broadcast found for this camera stream. Paste the working YouTube live link, or open YouTube Studio to confirm the phone is streaming to this key.",
        });
      } catch (err) {
        window.alert(
          err instanceof Error && err.message.trim()
            ? err.message
            : "Could not get watch link.",
        );
        setCameraActiveLinkStatus(null);
      } finally {
        setSessionFromCameraLoadingId(null);
      }
    },
    [sessionFromCameraLoadingId, fillFirstAngleWithUrl, setAngles, bumpApiCount],
  );

  const useManualLiveLink = useCallback(() => {
    const raw = manualLiveLinkDraft.trim();
    if (!raw) {
      window.alert("Paste a YouTube live link first.");
      return;
    }
    const t = parsePersistentLiveUrlTarget(raw);
    const derivedVid = t && t.kind === "video" ? t.videoId : null;
    setAngles((prev) => {
      if (prev.length === 0) return prev;
      const idx = Math.max(0, prev.findIndex((a) => !a.url.trim()));
      return prev.map((a, i) =>
        i === idx
          ? {
              ...a,
              url: raw,
              videoId: derivedVid,
              status: derivedVid ? "app_created_live" : "idle",
              debug: null,
              pastBroadcastWarning: false,
              persistentLiveHint: null,
              urlResolveNote: null,
              appCreatedLive: true,
              source: "youtube_api_broadcast",
              createdBroadcastId: a.createdBroadcastId,
            }
          : a,
      );
    });
  }, [manualLiveLinkDraft, setAngles]);

  const createYouTubeStream = useCallback(async () => {
    if (creatingYt) return;
    if (savedCameras.length > 0) {
      const ok = window.confirm(
        "This creates a NEW YouTube stream key. Your phone streaming app will need to be updated with the new RTMP key. Continue?",
      );
      if (!ok) return;
    }
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
  }, [creatingYt, savedCameras.length]);

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
          <h2 className="text-sm font-semibold text-white">Camera</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            Open Larix Broadcaster, Streamlabs, or another RTMP camera app. Paste the
            RTMP Server URL and Stream Key once and save the preset — your phone stays
            configured.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            <strong className="text-zinc-200">Setup mode (rare):</strong> create a reusable YouTube
            stream key and save a camera preset.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            <strong className="text-zinc-200">Daily use mode:</strong> start streaming on your
            phone, then click <strong className="text-zinc-200">Get Watch Link</strong>. Film Room
            does a single lookup to find the current active/upcoming broadcast for that preset’s
            saved <code className="text-zinc-200">streamId</code>, then auto-adds it as an angle.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Creating a stream signs you in with Google (YouTube scope) and does not start
            a Film Room session.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-[200px] flex-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
              New camera name (saved preset)
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
              {creatingYt ? "Creating…" : "Create New Camera Stream"}
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

          {cameraSessionVerify ? (
            <div className="mt-6 rounded-2xl border border-blue-500/35 bg-blue-950/30 px-4 py-4 shadow-lg shadow-blue-950/30 ring-1 ring-blue-500/15">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-200/95">
                Latest broadcast — binding verified
              </h3>
              <dl className="mt-3 grid gap-2 text-[11px] leading-snug text-zinc-200 sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Broadcast ID</dt>
                  <dd className="break-all font-mono">{cameraSessionVerify.broadcastId}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Requested stream ID</dt>
                  <dd className="break-all font-mono">
                    {cameraSessionVerify.requestedStreamId}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Bound stream ID</dt>
                  <dd className="break-all font-mono">
                    {cameraSessionVerify.boundStreamId}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Bound match</dt>
                  <dd className="font-semibold text-emerald-200">
                    {cameraSessionVerify.boundMatchesRequested ? "Yes" : "No"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-zinc-500">RTMP server</dt>
                  <dd className="break-all font-mono">{cameraSessionVerify.ingestionAddress}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-zinc-500">Stream key</dt>
                  <dd className="break-all font-mono">{cameraSessionVerify.streamName}</dd>
                </div>
                {(cameraSessionVerify.streamTitle ||
                  cameraSessionVerify.streamStatus) ? (
                  <div className="sm:col-span-2 flex flex-wrap gap-x-4 gap-y-1">
                    {cameraSessionVerify.streamTitle ? (
                      <span className="text-zinc-400">
                        Title:{" "}
                        <span className="text-zinc-200">{cameraSessionVerify.streamTitle}</span>
                      </span>
                    ) : null}
                    {cameraSessionVerify.streamStatus ? (
                      <span className="text-zinc-400">
                        Stream status:{" "}
                        <span className="text-zinc-200">{cameraSessionVerify.streamStatus}</span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </dl>
              <p className="mt-3 rounded-lg border border-blue-400/25 bg-blue-950/50 px-3 py-2 text-[11px] text-blue-100/95">
                This is the exact key your phone must stream to.
              </p>
            </div>
          ) : null}

          {cameraActiveLinkStatus ? (
            <p
              className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${
                cameraActiveLinkStatus.kind === "success"
                  ? "border-emerald-500/30 bg-emerald-950/25 text-emerald-100"
                  : cameraActiveLinkStatus.kind === "warning"
                    ? "border-amber-500/35 bg-amber-950/30 text-amber-100"
                    : "border-white/10 bg-black/25 text-zinc-300"
              }`}
            >
              {cameraActiveLinkStatus.message}
            </p>
          ) : null}

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
              Paste working YouTube live link
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={manualLiveLinkDraft}
                onChange={(e) => setManualLiveLinkDraft(e.target.value)}
                className={`${inputClass} flex-1`}
                placeholder="https://youtube.com/live/VIDEO_ID?feature=share"
              />
              <button type="button" className={ghostBtn} onClick={useManualLiveLink}>
                Use this live link
              </button>
            </div>
          </div>

          {cameraActiveResolveDebug ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4">
              <details>
                <summary className="cursor-pointer text-[11px] font-medium text-zinc-300">
                  Get Watch Link debug (temporary)
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-zinc-500">
                  {JSON.stringify(cameraActiveResolveDebug, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}

          {savedCamerasSorted.length > 0 ? (
            <div className="mt-6 border-t border-white/[0.06] pt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Saved cameras
              </h3>
              <p className="mt-2 text-xs text-zinc-400">
                If you already configured your phone/camera, use the saved camera below.
                You only need to create a new stream when adding a new camera or
                replacing a stream key.
              </p>
              <ul className="mt-3 space-y-3">
                {savedCamerasSorted.map((cam) => {
                  const liveUrlDisplay = persistentLiveViewUrlFromPreset(cam);
                  const presetIncomplete = isCameraPresetIncomplete(cam);
                  return (
                  <li
                    key={cam.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{cam.name}</p>
                        <div className="mt-2 space-y-1 text-[11px] leading-snug text-zinc-300">
                          <div className="break-all font-mono">
                            <span className="text-zinc-500">RTMP server:</span>{" "}
                            <span className="text-zinc-200">{cam.ingestionAddress || "—"}</span>
                          </div>
                          <div className="break-all font-mono">
                            <span className="text-zinc-500">Stream key:</span>{" "}
                            <span className="text-zinc-200">{cam.streamName || "—"}</span>
                          </div>
                        </div>
                        {presetIncomplete ? (
                          <p className="mt-2 rounded-lg border border-amber-500/35 bg-amber-950/35 px-2.5 py-1.5 text-[11px] text-amber-100/95">
                            Camera preset is incomplete — recreate it.
                          </p>
                        ) : null}
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
                        {cam.lastVerifiedAt ? (
                          <p className="mt-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] text-zinc-300">
                            <span className="text-zinc-500">Last verified:</span>{" "}
                            <span className="font-medium text-zinc-200">{cam.lastVerifiedAt}</span>
                            {cam.lastVerifiedStreamStatus ? (
                              <>
                                {" "}
                                <span className="text-zinc-500">· status</span>{" "}
                                <span className="text-zinc-200">
                                  {cam.lastVerifiedStreamStatus}
                                </span>
                              </>
                            ) : null}
                            {cam.lastVerifiedStreamTitle ? (
                              <>
                                {" "}
                                <span className="text-zinc-500">·</span>{" "}
                                <span className="text-zinc-200">
                                  {cam.lastVerifiedStreamTitle}
                                </span>
                              </>
                            ) : null}
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
                          disabled={
                            verifyCameraLoadingId !== null ||
                            !cam.streamId.trim()
                          }
                          title={
                            !cam.streamId.trim()
                              ? "Save a stream id on this preset first."
                              : undefined
                          }
                          onClick={() => void verifyCameraStream(cam)}
                        >
                          {verifyCameraLoadingId === cam.id
                            ? "Verifying…"
                            : "Verify Camera Stream"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-blue-500/35 bg-blue-600/25 px-3 py-2 text-xs font-semibold text-white transition hover:border-blue-400/50 hover:bg-blue-600/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            sessionFromCameraLoadingId !== null ||
                            presetIncomplete
                          }
                          title={
                            presetIncomplete
                              ? "Fix incomplete preset (missing stream id, RTMP server, or stream key)."
                              : undefined
                          }
                          onClick={() => void startSessionWithCamera(cam)}
                        >
                          {sessionFromCameraLoadingId === cam.id
                            ? "Getting link…"
                            : "Get Watch Link"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-rose-500/35 bg-rose-950/30 px-3 py-2 text-xs font-medium text-rose-100 transition hover:border-rose-400/45 hover:bg-rose-950/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
                          onClick={() => deleteCameraPreset(cam)}
                        >
                          Delete Preset
                        </button>
                      </div>
                    </div>
                  </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Daily use
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-zinc-300">
                After <strong>Get Watch Link</strong>, click{" "}
                <strong>Launch Film Room</strong>.
              </div>
              <button
                type="button"
                onClick={() => void startLiveSession()}
                className={primaryBtn}
                disabled={!startEnabled}
              >
                Launch Film Room
              </button>
            </div>

            <div className="mt-3 text-[11px] text-zinc-500">
              API calls this session:{" "}
              <span className="font-mono text-zinc-300">
                find-broadcast={apiCallCounts.findBroadcast}
              </span>
              ,{" "}
              <span className="font-mono text-zinc-300">
                youtube-resolve-live={apiCallCounts.youtubeResolveLive}
              </span>
              ,{" "}
              <span className="font-mono text-zinc-300">
                youtube-video-meta={apiCallCounts.youtubeVideoMeta}
              </span>
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
                  {typeof window !== "undefined"
                    ? (() => {
                        console.log("ANGLE_RENDER_VALUE", {
                          angleId: a.id,
                          url: a.url,
                        });
                        return null;
                      })()
                    : null}
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
                    {a.appCreatedLive ? (
                      <p className="rounded-lg border border-violet-500/20 bg-violet-950/25 px-3 py-2 text-violet-100/95">
                        Film Room will load this YouTube live player directly.
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
                        Debug (temporary)
                      </summary>
                      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-zinc-500">
                        {JSON.stringify(
                          {
                            debug: a.debug,
                            appCreatedLive: a.appCreatedLive,
                            angleSource: a.source,
                            createdBroadcastId: a.createdBroadcastId,
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
                  (a.status === "waiting_offline" && !a.appCreatedLive) ||
                  a.status === "stream_ended",
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

