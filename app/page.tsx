"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markRoomHost } from "@/lib/room-host";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/55 transition focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/35";

const primaryBtn =
  "inline-flex w-full max-w-xs items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]";

const ghostLink =
  "text-sm text-white transition hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

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
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center text-white">
      <div className="flex w-full max-w-md flex-col items-center space-y-10">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.08)] sm:text-5xl">
            Film Room
          </h1>
          <p className="text-lg font-medium leading-snug text-white sm:text-xl">
            Watch together, anywhere, anytime.
          </p>
        </div>

        <div className="flex w-full flex-col items-center space-y-4 rounded-2xl border border-white/[0.07] bg-zinc-950/40 p-6 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-8">
          <input
            type="text"
            placeholder="Paste YouTube link to start a session"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass}
          />
          <p className="text-center text-xs leading-relaxed text-white/80">
            Works with any video you already use.
          </p>
          <button type="button" onClick={createRoom} className={primaryBtn}>
            Start Film Session
          </button>
        </div>

        <div className="flex flex-col items-center space-y-4">
          <Link href="/about" className={ghostLink}>
            What is Film Room?
          </Link>
          <Link
            href="/app"
            className={`${ghostLink} text-xs text-white hover:text-white/85`}
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
