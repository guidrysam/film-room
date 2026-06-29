"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import YouTube, { type YouTubeEvent, type YouTubePlayer } from "react-youtube";
import { getYouTubeOAuthAccessToken } from "@/lib/auth-google";
import {
  analyzeEmbedWorkaround,
  EMBED_DIAGNOSTICS_STORAGE_KEY,
  embedUrlForVideoId,
  loadEmbedDiagnosticRecords,
  parseVideoIdInput,
  simpleEmbedVerdict,
  upsertEmbedDiagnosticRecord,
  watchUrlForVideoId,
  type EmbedDiagnosticCreatedBy,
  type EmbedDiagnosticRecord,
  type EmbedDiagnosticTestKind,
  type IframeEmbedResult,
} from "@/lib/youtube-embed-diagnostics";

const panelClass =
  "rounded-2xl border border-white/[0.07] bg-zinc-950/40 p-6 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/55 transition focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/35";

const ghostBtn =
  "rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const primaryBtn =
  "inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80";

type VideoMetaResponse = {
  ok?: boolean;
  meta?: {
    embeddable?: boolean;
    privacyStatus?: string;
    streamPhase?: string;
    title?: string;
  };
  error?: string;
};

type BroadcastMetaResponse = {
  ok?: boolean;
  enableEmbed?: boolean | null;
  lifeCycleStatus?: string | null;
  privacyStatus?: string | null;
  error?: string;
};

type EmbedProbeState = {
  videoId: string;
  iframeEmbedResult: IframeEmbedResult;
  iframeErrorCode?: number;
};

function newRecordId(): string {
  return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function verdictPillClass(v: "Works" | "Blocked" | "Unknown"): string {
  if (v === "Works") return "border-emerald-400/35 bg-emerald-500/15 text-emerald-100";
  if (v === "Blocked") return "border-rose-400/35 bg-rose-500/15 text-rose-100";
  return "border-amber-400/35 bg-amber-500/15 text-amber-100";
}

function iframeResultLabel(r: IframeEmbedResult): string {
  switch (r) {
    case "works":
      return "Works";
    case "blocked":
      return "Blocked";
    case "pending":
      return "Testing…";
    default:
      return "Unknown";
  }
}

function EmbedIframeProbe({
  videoId,
  onResult,
}: {
  videoId: string;
  onResult: (result: IframeEmbedResult, errorCode?: number) => void;
}) {
  const settledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    settledRef.current = false;
    onResult("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!settledRef.current) {
        settledRef.current = true;
        onResult("unknown");
      }
    }, 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [videoId, onResult]);

  const settle = useCallback(
    (result: IframeEmbedResult, errorCode?: number) => {
      if (settledRef.current) return;
      settledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      onResult(result, errorCode);
    },
    [onResult],
  );

  const handleReady = useCallback(
    (e: YouTubeEvent) => {
      const player = e.target as YouTubePlayer;
      try {
        const state = player.getPlayerState();
        // -1 unstarted is normal for upcoming live; still counts as embed allowed.
        if (state === -1 || state === 1 || state === 2 || state === 3 || state === 5) {
          settle("works");
        }
      } catch {
        settle("unknown");
      }
    },
    [settle],
  );

  const handleError = useCallback(
    (e: YouTubeEvent) => {
      const code = typeof e.data === "number" ? e.data : undefined;
      if (code === 101 || code === 150) {
        settle("blocked", code);
      } else {
        settle("unknown", code);
      }
    },
    [settle],
  );

  return (
    <div className="aspect-video w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-black">
      <YouTube
        key={videoId}
        videoId={videoId}
        className="h-full w-full"
        iframeClassName="h-full w-full"
        onReady={handleReady}
        onError={handleError}
        opts={{
          width: "100%",
          height: "100%",
          playerVars: {
            enablejsapi: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
        }}
      />
    </div>
  );
}

export type YouTubeEmbedDiagnosticsProps = {
  /** Saved reusable stream id from Stream Room camera preset (optional). */
  reusableStreamId?: string;
};

export function YouTubeEmbedDiagnostics({
  reusableStreamId,
}: YouTubeEmbedDiagnosticsProps) {
  const [records, setRecords] = useState<EmbedDiagnosticRecord[]>([]);
  const [testInput, setTestInput] = useState("");
  const [testVideoId, setTestVideoId] = useState<string | null>(null);
  const [probe, setProbe] = useState<EmbedProbeState | null>(null);
  const [videosApiEmbeddable, setVideosApiEmbeddable] = useState<
    boolean | null | undefined
  >(undefined);
  const [broadcastEnableEmbed, setBroadcastEnableEmbed] = useState<
    boolean | null | undefined
  >(undefined);
  const [metaPrivacy, setMetaPrivacy] = useState<string | undefined>();
  const [metaLifeCycle, setMetaLifeCycle] = useState<string | undefined>();
  const [metaStreamPhase, setMetaStreamPhase] = useState<string | undefined>();
  const [metaTitle, setMetaTitle] = useState<string | undefined>();
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState<boolean | null>(null);

  const [studioUrlInput, setStudioUrlInput] = useState("");
  const [archiveVideoIdInput, setArchiveVideoIdInput] = useState("");
  const [runningApiNew, setRunningApiNew] = useState(false);
  const [runningApiReusable, setRunningApiReusable] = useState(false);
  const probeResolversRef = useRef<
    Map<string, (result: IframeEmbedResult) => void>
  >(new Map());

  useEffect(() => {
    setRecords(loadEmbedDiagnosticRecords());
  }, []);

  const waitForIframeProbe = useCallback(
    (videoId: string, timeoutMs = 9000): Promise<IframeEmbedResult> =>
      new Promise((resolve) => {
        const existing = probeResolversRef.current.get(videoId);
        if (existing) probeResolversRef.current.delete(videoId);
        const timer = setTimeout(() => {
          probeResolversRef.current.delete(videoId);
          resolve("unknown");
        }, timeoutMs);
        probeResolversRef.current.set(videoId, (result) => {
          clearTimeout(timer);
          probeResolversRef.current.delete(videoId);
          resolve(result);
        });
      }),
    [],
  );

  const analysis = useMemo(() => analyzeEmbedWorkaround(records), [records]);

  const handleProbeResult = useCallback(
    (result: IframeEmbedResult, errorCode?: number) => {
      setProbe((prev) => {
        if (prev && result !== "pending") {
          const resolver = probeResolversRef.current.get(prev.videoId);
          if (resolver) resolver(result);
        }
        return prev
          ? { ...prev, iframeEmbedResult: result, iframeErrorCode: errorCode }
          : prev;
      });
    },
    [],
  );

  const fetchEmbedMeta = useCallback(async (
    videoId: string,
  ): Promise<{
    videosApiEmbeddable: boolean | null;
    broadcastEnableEmbed: boolean | null;
    privacyStatus?: string;
    lifeCycleStatus?: string;
    streamPhase?: string;
    iframeEmbedResult: IframeEmbedResult;
  }> => {
    setTestLoading(true);
    setTestError(null);
    setVideosApiEmbeddable(undefined);
    setBroadcastEnableEmbed(undefined);
    setMetaPrivacy(undefined);
    setMetaLifeCycle(undefined);
    setMetaStreamPhase(undefined);
    setMetaTitle(undefined);
    setOauthAvailable(null);

    let videosEmb: boolean | null = null;
    let broadcastEmb: boolean | null = null;
    let privacy: string | undefined;
    let lifeCycle: string | undefined;
    let streamPhase: string | undefined;

    try {
      const metaRes = await fetch(
        `/api/youtube-video-meta?videoId=${encodeURIComponent(videoId)}`,
        { cache: "no-store" },
      );
      const metaJson = (await metaRes.json()) as VideoMetaResponse;
      if (!metaRes.ok || metaJson.ok !== true) {
        throw new Error(metaJson.error ?? `video-meta HTTP ${metaRes.status}`);
      }
      videosEmb = metaJson.meta?.embeddable ?? null;
      privacy = metaJson.meta?.privacyStatus;
      streamPhase = metaJson.meta?.streamPhase;
      setVideosApiEmbeddable(videosEmb);
      setMetaPrivacy(privacy);
      setMetaStreamPhase(streamPhase);
      setMetaTitle(metaJson.meta?.title);

      try {
        const { accessToken } = await getYouTubeOAuthAccessToken();
        setOauthAvailable(true);
        const bcRes = await fetch(
          `/api/youtube/broadcast-embed-meta?broadcastId=${encodeURIComponent(videoId)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          },
        );
        const bcJson = (await bcRes.json()) as BroadcastMetaResponse;
        if (bcRes.ok && bcJson.ok === true) {
          broadcastEmb = bcJson.enableEmbed ?? null;
          lifeCycle = bcJson.lifeCycleStatus ?? undefined;
          setBroadcastEnableEmbed(broadcastEmb);
          setMetaLifeCycle(lifeCycle);
          if (bcJson.privacyStatus) {
            privacy = bcJson.privacyStatus;
            setMetaPrivacy(privacy);
          }
        } else {
          broadcastEmb = null;
          setBroadcastEnableEmbed(null);
        }
      } catch {
        setOauthAvailable(false);
        broadcastEmb = null;
        setBroadcastEnableEmbed(null);
      }

      setTestVideoId(videoId);
      setProbe({ videoId, iframeEmbedResult: "pending" });
      const iframeEmbedResult = await waitForIframeProbe(videoId);
      setProbe({ videoId, iframeEmbedResult });
      return {
        videosApiEmbeddable: videosEmb,
        broadcastEnableEmbed: broadcastEmb,
        privacyStatus: privacy,
        lifeCycleStatus: lifeCycle,
        streamPhase,
        iframeEmbedResult,
      };
    } catch (err) {
      setTestError(
        err instanceof Error ? err.message : "Could not load embed metadata.",
      );
      setTestVideoId(null);
      setProbe(null);
      throw err;
    } finally {
      setTestLoading(false);
    }
  }, [waitForIframeProbe]);

  const runTestEmbed = useCallback(() => {
    const vid = parseVideoIdInput(testInput);
    if (!vid) {
      setTestError("Enter a valid YouTube URL or 11-character video ID.");
      return;
    }
    void fetchEmbedMeta(vid);
  }, [testInput, fetchEmbedMeta]);

  const saveDiagnosticRecord = useCallback(
    (args: {
      testKind: EmbedDiagnosticTestKind;
      createdBy: EmbedDiagnosticCreatedBy;
      videoId: string;
      iframeEmbedResult: IframeEmbedResult;
      enableEmbedFromBroadcastApi?: boolean | null;
      embeddableFromVideosApi?: boolean | null;
      privacyStatus?: string;
      lifeCycleStatus?: string;
      streamPhase?: string;
      archiveEmbedsLater?: boolean | null;
      notes?: string;
    }) => {
      const record: EmbedDiagnosticRecord = {
        id: newRecordId(),
        recordedAt: new Date().toISOString(),
        watchUrl: watchUrlForVideoId(args.videoId),
        ...args,
      };
      const next = upsertEmbedDiagnosticRecord(record);
      setRecords(next);
      return record;
    },
    [],
  );

  const recordFromCurrentTest = useCallback(
    (
      testKind: EmbedDiagnosticTestKind,
      createdBy: EmbedDiagnosticCreatedBy,
      extra?: { notes?: string; archiveEmbedsLater?: boolean | null },
    ) => {
      if (!testVideoId || !probe) {
        window.alert("Run Test Embed first so we have a video ID and iframe result.");
        return;
      }
      saveDiagnosticRecord({
        testKind,
        createdBy,
        videoId: testVideoId,
        iframeEmbedResult: probe.iframeEmbedResult,
        enableEmbedFromBroadcastApi: broadcastEnableEmbed ?? null,
        embeddableFromVideosApi: videosApiEmbeddable ?? null,
        privacyStatus: metaPrivacy,
        lifeCycleStatus: metaLifeCycle,
        streamPhase: metaStreamPhase,
        archiveEmbedsLater: extra?.archiveEmbedsLater,
        notes: extra?.notes,
      });
    },
    [
      testVideoId,
      probe,
      broadcastEnableEmbed,
      videosApiEmbeddable,
      metaPrivacy,
      metaLifeCycle,
      metaStreamPhase,
      saveDiagnosticRecord,
    ],
  );

  const recordStudioTest = useCallback(async () => {
    const vid = parseVideoIdInput(studioUrlInput);
    if (!vid) {
      window.alert(
        "Paste the watch URL from your Studio-created live stream first.",
      );
      return;
    }
    try {
      const embedMeta = await fetchEmbedMeta(vid);
      saveDiagnosticRecord({
        testKind: "manual_studio",
        createdBy: "studio",
        videoId: vid,
        iframeEmbedResult: embedMeta.iframeEmbedResult,
        enableEmbedFromBroadcastApi: embedMeta.broadcastEnableEmbed,
        embeddableFromVideosApi: embedMeta.videosApiEmbeddable,
        privacyStatus: embedMeta.privacyStatus,
        lifeCycleStatus: embedMeta.lifeCycleStatus,
        streamPhase: embedMeta.streamPhase,
        notes:
          "Manual YouTube Studio stream (Allow embedding checked in Studio).",
      });
    } catch {
      /* fetchEmbedMeta sets testError */
    }
  }, [studioUrlInput, fetchEmbedMeta, saveDiagnosticRecord]);

  const runApiNewTest = useCallback(async () => {
    if (runningApiNew) return;
    const ok = window.confirm(
      "This creates a NEW YouTube broadcast + stream key via the API (setup-mode). Continue?",
    );
    if (!ok) return;
    setRunningApiNew(true);
    try {
      const { accessToken } = await getYouTubeOAuthAccessToken();
      const res = await fetch("/api/youtube/create-live-stream", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Film Room Embed Diagnostic",
          description: "API new-broadcast embed test — safe to delete in Studio.",
          privacyStatus: "unlisted",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        broadcastId?: string;
        videoId?: string;
        embeddable?: boolean;
        embedRejected?: boolean;
        error?: string;
      };
      if (!res.ok || data.ok !== true) {
        throw new Error(data.error ?? `create-live-stream HTTP ${res.status}`);
      }
      const videoId =
        (typeof data.videoId === "string" && data.videoId.trim()) ||
        (typeof data.broadcastId === "string" && data.broadcastId.trim()) ||
        "";
      if (!videoId) throw new Error("No broadcast id returned.");

      const embedMeta = await fetchEmbedMeta(videoId);

      saveDiagnosticRecord({
        testKind: "api_new",
        createdBy: "api-new",
        videoId,
        iframeEmbedResult: embedMeta.iframeEmbedResult,
        enableEmbedFromBroadcastApi:
          typeof data.embeddable === "boolean"
            ? data.embeddable
            : embedMeta.broadcastEnableEmbed,
        embeddableFromVideosApi: embedMeta.videosApiEmbeddable,
        privacyStatus: embedMeta.privacyStatus,
        lifeCycleStatus: embedMeta.lifeCycleStatus,
        streamPhase: embedMeta.streamPhase,
        notes: data.embedRejected
          ? "API returned embedRejected at create time."
          : "API create-live-stream diagnostic broadcast.",
      });
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "API new broadcast test failed.",
      );
    } finally {
      setRunningApiNew(false);
    }
  }, [runningApiNew, fetchEmbedMeta, saveDiagnosticRecord]);

  const runApiReusableTest = useCallback(async () => {
    if (runningApiReusable) return;
    const streamId = reusableStreamId?.trim();
    if (!streamId) {
      window.alert(
        "Save a camera preset on Stream Room first (reusable streamId required).",
      );
      return;
    }
    const ok = window.confirm(
      "Creates a new broadcast bound to your saved reusable stream via the API. Continue?",
    );
    if (!ok) return;
    setRunningApiReusable(true);
    try {
      const { accessToken } = await getYouTubeOAuthAccessToken();
      const res = await fetch("/api/youtube/create-broadcast-from-stream", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          streamId,
          title: "Film Room Embed Diagnostic (reusable)",
          description: "API reusable-stream embed test.",
          privacyStatus: "unlisted",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        broadcastId?: string;
        videoId?: string;
        embeddable?: boolean;
        embedRejected?: boolean;
        error?: string;
      };
      if (!res.ok || data.ok !== true) {
        throw new Error(
          data.error ?? `create-broadcast-from-stream HTTP ${res.status}`,
        );
      }
      const videoId =
        (typeof data.videoId === "string" && data.videoId.trim()) ||
        (typeof data.broadcastId === "string" && data.broadcastId.trim()) ||
        "";
      if (!videoId) throw new Error("No broadcast id returned.");

      const embedMeta = await fetchEmbedMeta(videoId);

      saveDiagnosticRecord({
        testKind: "api_reusable",
        createdBy: "api-reusable",
        videoId,
        iframeEmbedResult: embedMeta.iframeEmbedResult,
        enableEmbedFromBroadcastApi:
          typeof data.embeddable === "boolean"
            ? data.embeddable
            : embedMeta.broadcastEnableEmbed,
        embeddableFromVideosApi: embedMeta.videosApiEmbeddable,
        privacyStatus: embedMeta.privacyStatus,
        lifeCycleStatus: embedMeta.lifeCycleStatus,
        streamPhase: embedMeta.streamPhase,
        notes: data.embedRejected
          ? "API returned embedRejected at create time."
          : `Reusable streamId ${streamId}`,
      });
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "API reusable stream test failed.",
      );
    } finally {
      setRunningApiReusable(false);
    }
  }, [runningApiReusable, reusableStreamId, fetchEmbedMeta, saveDiagnosticRecord]);

  const runArchiveTest = useCallback(async () => {
    const vid =
      parseVideoIdInput(archiveVideoIdInput) ?? testVideoId ?? null;
    if (!vid) {
      window.alert("Enter a video ID from an ended broadcast.");
      return;
    }
    try {
      const embedMeta = await fetchEmbedMeta(vid);
      const works =
        embedMeta.iframeEmbedResult === "works" ||
        embedMeta.videosApiEmbeddable === true ||
        embedMeta.broadcastEnableEmbed === true;
      const blocked =
        embedMeta.iframeEmbedResult === "blocked" ||
        embedMeta.videosApiEmbeddable === false ||
        embedMeta.broadcastEnableEmbed === false;
      saveDiagnosticRecord({
        testKind: "archive_vod",
        createdBy: "manual",
        videoId: vid,
        iframeEmbedResult: embedMeta.iframeEmbedResult,
        enableEmbedFromBroadcastApi: embedMeta.broadcastEnableEmbed,
        embeddableFromVideosApi: embedMeta.videosApiEmbeddable,
        privacyStatus: embedMeta.privacyStatus,
        lifeCycleStatus: embedMeta.lifeCycleStatus,
        streamPhase: embedMeta.streamPhase,
        archiveEmbedsLater: works ? true : blocked ? false : null,
        notes: "Post-broadcast / VOD embed re-test.",
      });
    } catch {
      /* fetchEmbedMeta sets testError */
    }
  }, [archiveVideoIdInput, testVideoId, fetchEmbedMeta, saveDiagnosticRecord]);

  const currentVerdict = useMemo(() => {
    if (!testVideoId || !probe) return null;
    return simpleEmbedVerdict({
      iframeEmbedResult: probe.iframeEmbedResult,
      embeddableFromVideosApi: videosApiEmbeddable,
      enableEmbedFromBroadcastApi: broadcastEnableEmbed,
    });
  }, [testVideoId, probe, videosApiEmbeddable, broadcastEnableEmbed]);

  const clearRecords = useCallback(() => {
    if (!window.confirm("Clear all saved diagnostic records?")) return;
    localStorage.removeItem(EMBED_DIAGNOSTICS_STORAGE_KEY);
    setRecords([]);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Go Live · Diagnostics
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            YouTube embed diagnostics
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-300">
            Compare YouTube Studio vs API-created live streams on your channel.
            No Studio automation — manual steps only. Results are stored locally
            in this browser.
          </p>
        </div>
        <Link href="/stream" className="shrink-0 text-sm text-zinc-400 hover:text-zinc-100">
          ← Go Live
        </Link>
      </div>

      <div className={panelClass}>
        <h2 className="text-sm font-semibold text-white">Workaround analysis</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          {analysis.recommendation}
        </p>
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <dt className="text-zinc-500">Studio manual</dt>
            <dd className="mt-1 font-medium text-zinc-200">
              {analysis.studioEmbeddable === true
                ? "Embeddable"
                : analysis.studioEmbeddable === false
                  ? "Blocked"
                  : "Not tested"}
            </dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <dt className="text-zinc-500">API-created live</dt>
            <dd className="mt-1 font-medium text-zinc-200">
              {analysis.apiEmbeddable === true
                ? "Embeddable"
                : analysis.apiEmbeddable === false
                  ? "Blocked"
                  : "Not tested"}
            </dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <dt className="text-zinc-500">Archive / VOD</dt>
            <dd className="mt-1 font-medium text-zinc-200">
              {analysis.archiveEmbeddable === true
                ? "Embeddable"
                : analysis.archiveEmbeddable === false
                  ? "Blocked"
                  : "Not tested"}
            </dd>
          </div>
        </dl>
        {analysis.studioEmbeddable === true && analysis.apiEmbeddable === false ? (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
            <strong className="font-semibold">Studio workaround:</strong> Create the
            live stream in YouTube Studio with{" "}
            <strong>Allow embedding</strong> enabled, paste the watch link into
            Stream Room, and use that URL as your sideline angle. Film Room will
            embed the manual Studio stream even when API-created broadcasts are
            blocked on this channel.
          </div>
        ) : null}
      </div>

      <div className={panelClass}>
        <h2 className="text-sm font-semibold text-white">Test Embed</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Paste any YouTube URL or video ID. We extract the id, load API metadata,
          and probe an iframe (error 101/150 = blocked).
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="https://youtube.com/watch?v=… or video ID"
            className={inputClass}
          />
          <button
            type="button"
            className={primaryBtn}
            disabled={testLoading}
            onClick={runTestEmbed}
          >
            {testLoading ? "Loading…" : "Test Embed"}
          </button>
        </div>
        {testError ? (
          <p className="mt-2 text-xs text-rose-300">{testError}</p>
        ) : null}
        {testVideoId ? (
          <div className="mt-4 space-y-4">
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">videoId</dt>
                <dd className="font-mono text-zinc-200">{testVideoId}</dd>
              </div>
              {metaTitle ? (
                <div>
                  <dt className="text-zinc-500">title</dt>
                  <dd className="text-zinc-200">{metaTitle}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-zinc-500">iframe test</dt>
                <dd>
                  <a
                    href={embedUrlForVideoId(testVideoId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-300 hover:underline"
                  >
                    Open embed URL
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">videos.list embeddable</dt>
                <dd className="text-zinc-200">
                  {videosApiEmbeddable === true
                    ? "true"
                    : videosApiEmbeddable === false
                      ? "false"
                      : oauthAvailable === false
                        ? "unknown (no meta)"
                        : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">broadcast enableEmbed (OAuth)</dt>
                <dd className="text-zinc-200">
                  {oauthAvailable === false
                    ? "Sign in to check"
                    : broadcastEnableEmbed === true
                      ? "true"
                      : broadcastEnableEmbed === false
                        ? "false"
                        : broadcastEnableEmbed === null
                          ? "n/a (not a broadcast)"
                          : "—"}
                </dd>
              </div>
              {metaPrivacy ? (
                <div>
                  <dt className="text-zinc-500">privacyStatus</dt>
                  <dd className="text-zinc-200">{metaPrivacy}</dd>
                </div>
              ) : null}
              {metaLifeCycle ? (
                <div>
                  <dt className="text-zinc-500">lifeCycleStatus</dt>
                  <dd className="text-zinc-200">{metaLifeCycle}</dd>
                </div>
              ) : null}
              {metaStreamPhase ? (
                <div>
                  <dt className="text-zinc-500">streamPhase</dt>
                  <dd className="text-zinc-200">{metaStreamPhase}</dd>
                </div>
              ) : null}
            </dl>
            {currentVerdict ? (
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${verdictPillClass(currentVerdict)}`}
              >
                {currentVerdict}
              </span>
            ) : null}
            <EmbedIframeProbe videoId={testVideoId} onResult={handleProbeResult} />
            {probe?.iframeErrorCode != null ? (
              <p className="text-xs text-zinc-500">
                IFrame API error code: {probe.iframeErrorCode}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={panelClass}>
        <h2 className="text-sm font-semibold text-white">Diagnostic checklist</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Run each test, wait for the iframe probe, then save the record.
        </p>

        <ol className="mt-4 space-y-6">
          <li className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
              1. Manual Studio stream test
            </h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-400">
              <li>YouTube Studio → Create → Go live → Streaming software.</li>
              <li>Edit stream → check <strong className="text-zinc-300">Allow embedding</strong> → Save.</li>
              <li>Go live (or schedule), copy the watch URL, paste below.</li>
            </ol>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={studioUrlInput}
                onChange={(e) => setStudioUrlInput(e.target.value)}
                placeholder="Studio watch URL"
                className={inputClass}
              />
              <button
                type="button"
                className={ghostBtn}
                onClick={() => void recordStudioTest()}
              >
                Test &amp; save Studio record
              </button>
            </div>
          </li>

          <li className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
              2. API new broadcast test
            </h3>
            <p className="mt-2 text-xs text-zinc-400">
              Calls <code className="text-zinc-300">create-live-stream</code> (new
              stream key). Compare embed result to Studio.
            </p>
            <button
              type="button"
              className={`${primaryBtn} mt-3`}
              disabled={runningApiNew}
              onClick={() => void runApiNewTest()}
            >
              {runningApiNew ? "Creating…" : "Run API new broadcast test"}
            </button>
            <button
              type="button"
              className={`${ghostBtn} mt-3 ml-2`}
              onClick={() => recordFromCurrentTest("api_new", "api-new")}
            >
              Save API new record (from Test Embed)
            </button>
          </li>

          <li className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
              3. API reusable stream test
            </h3>
            <p className="mt-2 text-xs text-zinc-400">
              Uses saved camera preset streamId
              {reusableStreamId ? (
                <> (<span className="font-mono text-zinc-300">{reusableStreamId}</span>)</>
              ) : (
                <> — save a preset on Stream Room first</>
              )}
              .
            </p>
            <button
              type="button"
              className={`${primaryBtn} mt-3`}
              disabled={runningApiReusable || !reusableStreamId}
              onClick={() => void runApiReusableTest()}
            >
              {runningApiReusable ? "Creating…" : "Run API reusable stream test"}
            </button>
            <button
              type="button"
              className={`${ghostBtn} mt-3 ml-2`}
              onClick={() => recordFromCurrentTest("api_reusable", "api-reusable")}
            >
              Save API reusable record
            </button>
          </li>

          <li className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
              4. Archive / VOD embed test
            </h3>
            <p className="mt-2 text-xs text-zinc-400">
              After a live stream ends, re-test the same video ID to see if archive
              playback embeds (recordFromStart VOD).
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={archiveVideoIdInput}
                onChange={(e) => setArchiveVideoIdInput(e.target.value)}
                placeholder="Ended broadcast video ID"
                className={inputClass}
              />
              <button
                type="button"
                className={ghostBtn}
                onClick={() => void runArchiveTest()}
              >
                Test &amp; save archive record
              </button>
            </div>
          </li>
        </ol>
      </div>

      <div className={panelClass}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Saved records</h2>
          {records.length > 0 ? (
            <button type="button" className={ghostBtn} onClick={clearRecords}>
              Clear all
            </button>
          ) : null}
        </div>
        {records.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">No diagnostic records yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500">
                  <th className="py-2 pr-2">When</th>
                  <th className="py-2 pr-2">Test</th>
                  <th className="py-2 pr-2">videoId</th>
                  <th className="py-2 pr-2">createdBy</th>
                  <th className="py-2 pr-2">enableEmbed</th>
                  <th className="py-2 pr-2">iframe</th>
                  <th className="py-2 pr-2">privacy</th>
                  <th className="py-2 pr-2">lifecycle</th>
                  <th className="py-2">archive</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const v = simpleEmbedVerdict({
                    iframeEmbedResult: r.iframeEmbedResult,
                    embeddableFromVideosApi: r.embeddableFromVideosApi,
                    enableEmbedFromBroadcastApi: r.enableEmbedFromBroadcastApi,
                  });
                  return (
                    <tr key={r.id} className="border-b border-white/5 text-zinc-300">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {new Date(r.recordedAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-2">{r.testKind}</td>
                      <td className="py-2 pr-2 font-mono">{r.videoId}</td>
                      <td className="py-2 pr-2">{r.createdBy}</td>
                      <td className="py-2 pr-2">
                        {r.enableEmbedFromBroadcastApi === true
                          ? "true"
                          : r.enableEmbedFromBroadcastApi === false
                            ? "false"
                            : "—"}
                      </td>
                      <td className="py-2 pr-2">
                        <span className={`rounded border px-1.5 py-0.5 ${verdictPillClass(v)}`}>
                          {iframeResultLabel(r.iframeEmbedResult)}
                        </span>
                      </td>
                      <td className="py-2 pr-2">{r.privacyStatus ?? "—"}</td>
                      <td className="py-2 pr-2">{r.lifeCycleStatus ?? "—"}</td>
                      <td className="py-2">
                        {r.archiveEmbedsLater === true
                          ? "yes"
                          : r.archiveEmbedsLater === false
                            ? "no"
                            : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
