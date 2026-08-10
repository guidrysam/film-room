"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HighlightReelPlayer, {
  type HighlightReelPlayerHandle,
} from "@/components/HighlightReelPlayer";
import { getHighlightReelByShareId } from "@/lib/highlight-reel-share";
import type { HighlightReelSharePayload } from "@/lib/highlight-reel-share";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const primaryBtn =
  "rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 disabled:cursor-not-allowed disabled:opacity-50";

export default function SharedHighlightReelPage() {
  const params = useParams();
  const shareId = typeof params.shareId === "string" ? params.shareId : "";

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<HighlightReelSharePayload | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const playerRef = useRef<HighlightReelPlayerHandle | null>(null);

  useEffect(() => {
    if (!shareId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setNotFound(false);
      setQueryError(null);
      setPayload(null);
      try {
        const result = await getHighlightReelByShareId(shareId);
        if (cancelled) return;
        if (result.ok) {
          setPayload(result.payload);
          setCreatedByName(result.createdByName ?? null);
        } else if (result.kind === "expired") {
          setNotFound(true);
          setQueryError(
            "This highlight link has expired. Ask the coach for a new watch link.",
          );
        } else if (result.kind === "not_found") {
          setNotFound(true);
        } else {
          setQueryError(result.message);
        }
      } catch {
        if (!cancelled) setQueryError("Could not load this highlight reel.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

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

  const handleWatch = useCallback(() => {
    setStarted(true);
    window.setTimeout(() => playerRef.current?.play(), 120);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030306] text-zinc-300">
        <p className="text-sm">Loading highlights…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030306] px-4 text-zinc-50">
        <div className={`${panelClass} max-w-md text-center`}>
          <p className="text-lg font-semibold">Highlight reel not found</p>
          <p className="mt-2 text-sm text-zinc-400">
            This link may have expired or the reel was removed. Ask the coach to
            open the reel studio and tap <strong>Copy watch link</strong> again.
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

        <div className={panelClass}>
          {!started ? (
            <div className="flex flex-col items-center py-10 text-center">
              <p className="max-w-md text-sm leading-relaxed text-zinc-400">
                Press play to watch the full highlight reel — no sign-in required.
              </p>
              <button type="button" onClick={handleWatch} className={`${primaryBtn} mt-5`}>
                ▶ Watch highlights
              </button>
            </div>
          ) : null}

          <div className={started ? undefined : "sr-only"} aria-hidden={!started}>
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
