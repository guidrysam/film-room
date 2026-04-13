"use client";

import { Suspense, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import YouTube from "react-youtube";

function RoomContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("video");
  const playerRef = useRef<InstanceType<typeof YouTube>>(null);

  const handlePlay = () => {
    playerRef.current?.getInternalPlayer()?.playVideo();
  };

  const handlePause = () => {
    playerRef.current?.getInternalPlayer()?.pauseVideo();
  };

  const handleSeekBack = () => {
    const player = playerRef.current?.getInternalPlayer();
    if (!player) return;
    void player.getCurrentTime().then((t: number) => {
      player.seekTo(Math.max(0, t - 10), true);
    });
  };

  if (!videoId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-white">
        <p className="mb-4 text-center text-gray-300">
          No video selected. Add a <code className="text-gray-100">?video=</code>{" "}
          query with a YouTube video ID.
        </p>
        <Link
          href="/"
          className="rounded bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-8 text-white">
      <div className="w-full max-w-3xl">
        <div className="overflow-hidden rounded-lg">
          <YouTube
            ref={playerRef}
            videoId={videoId}
            opts={{
              width: "100%",
              height: "480",
              playerVars: {
                rel: 0,
              },
            }}
          />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={handlePlay}
            className="rounded bg-green-600 px-6 py-3 font-semibold hover:bg-green-500"
          >
            Play
          </button>
          <button
            type="button"
            onClick={handlePause}
            className="rounded bg-amber-600 px-6 py-3 font-semibold hover:bg-amber-500"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={handleSeekBack}
            className="rounded bg-gray-700 px-6 py-3 font-semibold hover:bg-gray-600"
          >
            -10s
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-white">
          Loading…
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
