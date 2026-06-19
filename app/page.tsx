"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markRoomHost } from "@/lib/room-host";
import {
  NON_EMBEDDABLE_YOUTUBE_MESSAGE,
  NON_YOUTUBE_LINK_MESSAGE,
} from "@/lib/public-copy";
import { fetchYouTubeVideoMeta } from "@/lib/youtube-video-meta-client";
import { extractYouTubeVideoId } from "@/lib/youtube-id";
import { watchUrlForVideoId } from "@/lib/youtube-embed-diagnostics";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/55 transition focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/35";

const primaryBtn =
  "inline-flex w-full max-w-xs items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] disabled:cursor-not-allowed disabled:opacity-60";

const ghostLink =
  "text-sm text-white transition hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

const featureCards = [
  {
    title: "Built on YouTube. Built for teams.",
    body: "YouTube handles storage, streaming, and playback. Film Room adds shared viewing, sync, and review.",
  },
  {
    title: "Watch YouTube together in sync.",
    body: "Paste a link, share the room, and everyone stays on the same moment — live or on demand.",
  },
  {
    title: "Turn game video into coach marks, stats, and highlights.",
    body: "Mark plays, build timelines, and organize film around your roster and season.",
  },
  {
    title: "Upload from any phone to YouTube, then organize in Film Room.",
    body: "Record on the sideline, publish to your channel, and pull it into team review when you're ready.",
  },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [embedWarning, setEmbedWarning] = useState<string | null>(null);
  const [embedWatchUrl, setEmbedWatchUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  const goToRoom = (videoId: string) => {
    const roomId = Math.random().toString(36).substring(2, 8);
    markRoomHost(roomId);
    router.push(`/room/${roomId}?video=${encodeURIComponent(videoId)}`);
  };

  const createRoom = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setUrlError(null);
    setEmbedWarning(null);
    setEmbedWatchUrl(null);

    const videoId = extractYouTubeVideoId(trimmed);
    if (!videoId) {
      setUrlError(NON_YOUTUBE_LINK_MESSAGE);
      return;
    }

    setStarting(true);
    try {
      const meta = await fetchYouTubeVideoMeta(videoId);
      if (meta?.embeddable === false) {
        setEmbedWarning(NON_EMBEDDABLE_YOUTUBE_MESSAGE);
        setEmbedWatchUrl(watchUrlForVideoId(videoId));
        return;
      }
      goToRoom(videoId);
    } finally {
      setStarting(false);
    }
  };

  const startDespiteEmbedWarning = () => {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) return;
    goToRoom(videoId);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center text-white">
      <div className="flex w-full max-w-2xl flex-col items-center space-y-10">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.08)] sm:text-5xl">
            Film Room
          </h1>
          <p className="text-lg font-medium leading-snug text-white sm:text-xl">
            Turn YouTube videos into a shared film room.
          </p>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-white/80 sm:text-base">
            Paste a YouTube link to watch together, stay in sync, and review the
            same moments.
          </p>
        </div>

        <div className="flex w-full max-w-md flex-col items-center space-y-4 rounded-2xl border border-white/[0.07] bg-zinc-950/40 p-6 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-8">
          <input
            type="text"
            placeholder="Paste a YouTube link"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(null);
              setEmbedWarning(null);
              setEmbedWatchUrl(null);
            }}
            className={inputClass}
          />
          {urlError ? (
            <p className="w-full text-left text-xs leading-relaxed text-rose-200">
              {urlError}
            </p>
          ) : null}
          {embedWarning ? (
            <div className="w-full space-y-2 text-left text-xs leading-relaxed text-amber-100">
              <p>{embedWarning}</p>
              {embedWatchUrl ? (
                <a
                  href={embedWatchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex font-medium text-blue-200 underline-offset-2 hover:text-blue-100 hover:underline"
                >
                  Open on YouTube
                </a>
              ) : null}
            </div>
          ) : null}
          <p className="text-center text-xs leading-relaxed text-white/80">
            Works best with YouTube videos and live streams.
          </p>
          {embedWarning ? (
            <div className="flex w-full max-w-xs flex-col gap-2">
              <button
                type="button"
                onClick={startDespiteEmbedWarning}
                className={primaryBtn}
              >
                Start Room anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmbedWarning(null);
                  setEmbedWatchUrl(null);
                }}
                className="text-xs text-white/70 transition hover:text-white"
              >
                Choose a different link
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void createRoom()}
              disabled={starting || !url.trim()}
              className={primaryBtn}
            >
              {starting ? "Checking…" : "Start Room"}
            </button>
          )}
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2">
          {featureCards.map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-white/[0.06] bg-zinc-950/35 p-4 text-left ring-1 ring-white/[0.03]"
            >
              <h2 className="text-sm font-semibold text-white">{card.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-white/75">
                {card.body}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center space-y-4">
          <Link href="/about" className={ghostLink}>
            What is Film Room?
          </Link>
          <Link
            href="/app"
            className={`${ghostLink} text-xs text-white hover:text-white/85`}
          >
            Sign in to Film Room Sports
          </Link>
        </div>
      </div>
    </div>
  );
}
