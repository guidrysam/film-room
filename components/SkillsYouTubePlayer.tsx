"use client";

import { useEffect, useRef, useState } from "react";
import YouTube, { type YouTubePlayer } from "react-youtube";
import VideoTransport from "@/components/VideoTransport";
import YoutubeChromelessStage from "@/components/YoutubeChromelessStage";
import { YOUTUBE_CHROMELESS_PLAYER_VARS } from "@/lib/youtube-player-vars";

type Props = {
  videoId: string;
  title?: string;
};

/**
 * Skills teaching player: YouTube chromeless + Film Room transport (no YT overlay).
 */
export default function SkillsYouTubePlayer({ videoId, title }: Props) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [readyVideoId, setReadyVideoId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const ready = readyVideoId === videoId;

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* fullscreen not available */
    }
  }

  return (
    <div
      ref={stageRef}
      className={`overflow-hidden border border-white/10 bg-black ${
        isFullscreen
          ? "flex h-full min-h-screen w-full flex-col rounded-none"
          : "rounded-xl"
      }`}
    >
      <div className="relative min-h-0 flex-1">
        <YoutubeChromelessStage
          className={
            isFullscreen
              ? "h-full min-h-0 w-full bg-black"
              : "aspect-video w-full bg-black"
          }
        >
          <YouTube
            key={videoId}
            videoId={videoId}
            className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
            opts={{
              width: "100%",
              height: "100%",
              playerVars: {
                autoplay: 0,
                ...YOUTUBE_CHROMELESS_PLAYER_VARS,
              },
            }}
            onReady={(e) => {
              playerRef.current = e.target;
              setReadyVideoId(videoId);
            }}
          />
        </YoutubeChromelessStage>
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="absolute right-2 top-2 z-20 rounded-md border border-white/20 bg-black/70 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 backdrop-blur hover:bg-black/85"
        >
          {isFullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>
      <div
        className={`shrink-0 border-t border-white/10 px-2 pb-2 pt-1 ${
          isFullscreen ? "bg-zinc-950" : ""
        }`}
      >
        {title ? (
          <p className="mb-1 truncate px-1 text-xs text-zinc-400">{title}</p>
        ) : null}
        <VideoTransport playerRef={playerRef} ready={ready} />
      </div>
    </div>
  );
}
