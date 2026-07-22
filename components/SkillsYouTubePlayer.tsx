"use client";

import { useRef, useState } from "react";
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
  const [readyVideoId, setReadyVideoId] = useState<string | null>(null);
  const ready = readyVideoId === videoId;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
      <YoutubeChromelessStage className="aspect-video w-full bg-black">
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
      <div className="border-t border-white/10 px-2 pb-2 pt-1">
        {title ? (
          <p className="mb-1 truncate px-1 text-xs text-zinc-400">{title}</p>
        ) : null}
        <VideoTransport playerRef={playerRef} ready={ready} />
      </div>
    </div>
  );
}
