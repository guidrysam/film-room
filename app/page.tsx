"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markRoomHost } from "@/lib/room-host";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

export default function Home() {
  const [url, setUrl] = useState("");
  const router = useRouter();

  const createRoom = () => {
    if (!url) return;

    const roomId = Math.random().toString(36).substring(2, 8);
    const videoId = extractYouTubeVideoId(url);

    if (!videoId) {
      alert("Invalid YouTube link");
      return;
    }

    markRoomHost(roomId);
    router.push(`/room/${roomId}?video=${encodeURIComponent(videoId)}`);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-10 text-white">
      <div className="flex w-full max-w-lg flex-col items-center">
        <h1 className="mb-2 text-center text-4xl font-bold">Film Room</h1>

        <p className="mb-8 text-center text-gray-400">
          Watch film together, anywhere.
        </p>

        <input
          type="text"
          placeholder="Paste YouTube link to start a session"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mb-4 w-full max-w-md rounded-md border border-gray-300 bg-white px-3 py-2 text-black caret-black scheme-light placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          type="button"
          onClick={createRoom}
          className="rounded bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500"
        >
          Start Film Session
        </button>

        <Link
          href="/about"
          className="mt-10 text-sm text-gray-500 underline-offset-4 hover:text-gray-400 hover:underline"
        >
          What is Film Room?
        </Link>
      </div>
    </div>
  );
}
