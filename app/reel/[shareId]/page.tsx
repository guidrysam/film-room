"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HighlightReelPlayer, {
  type HighlightReelPlayerHandle,
} from "@/components/HighlightReelPlayer";
import type {
  HighlightReelSharePayload,
  SharedHighlightReelLookupResult,
} from "@/lib/highlight-reel-share-payload";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const primaryBtn =
  "rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition hover:bg-white/10";

const LOAD_TIMEOUT_MS = 20_000;

function fullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestElementFullscreen(el: HTMLElement): Promise<void> {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (typeof el.requestFullscreen === "function") {
    await el.requestFullscreen();
    return;
  }
  if (typeof anyEl.webkitRequestFullscreen === "function") {
    await anyEl.webkitRequestFullscreen();
  }
}

async function exitDocumentFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  if (fullscreenElement() == null) return;
  if (typeof document.exitFullscreen === "function") {
    await document.exitFullscreen();
    return;
  }
  if (typeof doc.webkitExitFullscreen === "function") {
    await doc.webkitExitFullscreen();
  }
}

export default function SharedHighlightReelPage() {
  const params = useParams();
  const shareId = typeof params.shareId === "string" ? params.shareId : "";

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<HighlightReelSharePayload | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const playerRef = useRef<HighlightReelPlayerHandle | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shareId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);

    void (async () => {
      setLoading(true);
      setNotFound(false);
      setQueryError(null);
      setPayload(null);
      try {
        const res = await fetch(`/api/reel/${encodeURIComponent(shareId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = (await res.json().catch(() => null)) as
          | SharedHighlightReelLookupResult
          | null;
        if (cancelled) return;
        if (!result || typeof result !== "object") {
          setQueryError("Could not load this highlight reel.");
          return;
        }
        if (result.ok) {
          setPayload(result.payload);
          setCreatedByName(result.createdByName ?? null);
          return;
        }
        if (result.kind === "expired") {
          setNotFound(true);
          setQueryError(
            "This highlight link has expired. Ask the coach for a new watch link.",
          );
          return;
        }
        if (result.kind === "not_found") {
          setNotFound(true);
          return;
        }
        setQueryError(
          result.message ||
            "Could not load this highlight reel (check network).",
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          setQueryError(
            "This highlight reel took too long to load. Refresh and try again.",
          );
          return;
        }
        setQueryError("Could not load this highlight reel.");
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [shareId]);

  useEffect(() => {
    const sync = () => {
      setIsFullscreen(fullscreenElement() === stageRef.current);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener(
        "webkitfullscreenchange",
        sync as EventListener,
      );
    };
  }, []);

  const sourceMap = useMemo(() => {
    const map = new Map<string, { videoId: string; label?: string }>();
    for (const s of payload?.sources ?? []) {
      map.set(s.id, { videoId: s.videoId, label: s.label });
    }
    return map;
  }, [payload?.sources]);

  const videoIdForSource = useCallback(
    (sourceId: string) => sourceMap.get(sourceId)?.videoId,
    [sourceMap],
  );
  const labelForSource = useCallback(
    (sourceId: string) => sourceMap.get(sourceId)?.label,
    [sourceMap],
  );

  const enterFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      await requestElementFullscreen(el);
    } catch {
      /* fullscreen blocked — still play inline */
    }
  }, []);

  const leaveFullscreen = useCallback(async () => {
    try {
      await exitDocumentFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  const handleWatch = useCallback(() => {
    setStarted(true);
    playerRef.current?.play();
    window.setTimeout(() => playerRef.current?.play(), 80);
    void enterFullscreen();
  }, [enterFullscreen]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#030306] px-4 text-zinc-300">
        <p className="text-sm">Loading highlights…</p>
        <p className="text-[11px] text-zinc-600">
          Usually takes a couple of seconds.
        </p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030306] px-4 text-zinc-50">
        <div className={`${panelClass} max-w-md text-center`}>
          <p className="text-lg font-semibold">Highlight reel not found</p>
          <p className="mt-2 text-sm text-zinc-400">
            {queryError ||
              "This link may have expired or the reel was removed. Ask the coach to open the reel studio and tap Copy watch link again."}
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-blue-300 hover:text-blue-200">
            Go to Film Room
          </Link>
        </div>
      </div>
    );
  }

  if (queryError || !payload) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030306] px-4 text-zinc-50">
        <div className={`${panelClass} max-w-md text-center`}>
          <p className="text-lg font-semibold">Could not load reel</p>
          <p className="mt-2 text-sm text-zinc-400">{queryError ?? "Unknown error."}</p>
          <button
            type="button"
            className={`${primaryBtn} mt-4`}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030306] text-zinc-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {payload.gameTitle}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {payload.reelName}
          </h1>
          {createdByName ? (
            <p className="mt-1 text-sm text-zinc-400">By {createdByName}</p>
          ) : null}
        </header>

        <div
          ref={stageRef}
          className={
            isFullscreen
              ? "relative flex h-full w-full items-center justify-center bg-black"
              : `${panelClass} relative overflow-hidden`
          }
        >
          {!started ? (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#030306]/95 px-4 text-center backdrop-blur-[2px]">
              <p className="max-w-md text-sm leading-relaxed text-zinc-400">
                Press play to watch fullscreen — no sign-in required.
              </p>
              <button
                type="button"
                onClick={handleWatch}
                className={`${primaryBtn} mt-5`}
              >
                ▶ Watch highlights
              </button>
            </div>
          ) : null}

          {isFullscreen ? (
            <button
              type="button"
              onClick={() => void leaveFullscreen()}
              className="absolute right-3 top-3 z-[60] flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/55 text-xl leading-none text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75"
              aria-label="Exit fullscreen"
              title="Exit fullscreen"
            >
              ×
            </button>
          ) : started ? (
            <button
              type="button"
              onClick={() => void enterFullscreen()}
              className={`${ghostBtn} absolute right-3 top-3 z-[60]`}
            >
              Full screen
            </button>
          ) : null}

          <div
            className={
              isFullscreen ? "aspect-video w-full max-w-[100vw]" : undefined
            }
          >
            <HighlightReelPlayer
              ref={playerRef}
              steps={payload.steps}
              titleCard={payload.titleCard}
              scoreboard={payload.scoreboard ?? null}
              soundtrackUrl={
                payload.soundtrack
                  ? `/api/reel/${encodeURIComponent(shareId)}/soundtrack`
                  : null
              }
              sponsors={payload.sponsors ?? null}
              thankYouMessage={payload.thankYouMessage ?? null}
              videoIdForSource={videoIdForSource}
              labelForSource={labelForSource}
              autoPlay={started}
              hideChrome={isFullscreen}
            />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Powered by{" "}
          <Link href="/" className="text-zinc-500 transition hover:text-zinc-300">
            Film Room
          </Link>
        </p>
      </div>
    </div>
  );
}
