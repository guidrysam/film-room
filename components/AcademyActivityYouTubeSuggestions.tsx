"use client";

import { useEffect, useState } from "react";
import {
  buildAcademyActivityYouTubeQuery,
  type AcademyYouTubeSuggestion,
} from "@/lib/academy/youtube-search-query";
import type { AcademyActivity } from "@/lib/academy/types";

type Props = {
  activity: Pick<
    AcademyActivity,
    "id" | "title" | "ageBands" | "searchTags" | "category" | "activityType"
  >;
};

export default function AcademyActivityYouTubeSuggestions({ activity }: Props) {
  const query = buildAcademyActivityYouTubeQuery(activity);
  const [videos, setVideos] = useState<AcademyYouTubeSuggestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/academy/youtube-search?q=${encodeURIComponent(query)}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          videos?: AcademyYouTubeSuggestion[];
        };
        if (!active) return;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "YouTube search failed.");
        }
        const nextVideos = payload.videos ?? [];
        setVideos(nextVideos);
        setSelectedId(nextVideos[0]?.videoId ?? null);
        setError(null);
      })
      .catch((searchError: unknown) => {
        if (!active) return;
        setVideos([]);
        setSelectedId(null);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Could not load video suggestions.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query]);

  const selected = videos.find((video) => video.videoId === selectedId) ?? null;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold text-white">
            Suggested teaching video
          </h5>
          <p className="mt-1 text-[11px] text-zinc-500">
            Auto-searched on YouTube · confirm before using with players
          </p>
        </div>
        <p className="max-w-xs text-right text-[10px] text-zinc-600">
          Query: {query}
        </p>
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-zinc-400">Searching YouTube…</p>
      ) : null}
      {error ? <p className="mt-3 text-xs text-rose-200">{error}</p> : null}

      {!loading && !error && !videos.length ? (
        <p className="mt-3 text-xs text-zinc-400">
          No embeddable teaching videos matched this activity yet.
        </p>
      ) : null}

      {selected ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black">
          <div className="aspect-video w-full">
            <iframe
              title={selected.title}
              src={selected.embedUrl}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="border-t border-white/10 px-3 py-2">
            <p className="text-xs font-medium text-zinc-100">{selected.title}</p>
            <p className="text-[11px] text-zinc-500">{selected.channelTitle}</p>
            <a
              href={selected.watchUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-[11px] text-blue-300 hover:text-blue-200"
            >
              Open on YouTube
            </a>
          </div>
        </div>
      ) : null}

      {videos.length > 1 ? (
        <ul className="mt-3 space-y-1.5">
          {videos.map((video) => (
            <li key={video.videoId}>
              <button
                type="button"
                onClick={() => setSelectedId(video.videoId)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                  video.videoId === selectedId
                    ? "border-cyan-500/40 bg-cyan-950/25"
                    : "border-white/[0.08] bg-black/15 hover:bg-white/[0.04]"
                }`}
              >
                <span className="block text-[11px] font-medium text-zinc-100">
                  {video.title}
                </span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">
                  {video.channelTitle}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
