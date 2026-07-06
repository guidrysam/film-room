"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { markRoomHost } from "@/lib/room-host";
import { storeFacebookRoomInit } from "@/lib/facebook-room-init";
import { resolveVideoFromPaste } from "@/lib/resolve-video-paste";
import { createQuickReviewGame } from "@/lib/quick-review";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/55 transition focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/35";

const primaryBtn =
  "inline-flex w-full max-w-xs items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtn =
  "inline-flex w-full max-w-xs items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]";

const helpLink =
  "text-xs text-white/60 transition hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

export default function Home() {
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  const goToRoom = (videoId: string) => {
    const roomId = Math.random().toString(36).substring(2, 8);
    markRoomHost(roomId);
    router.push(`/room/${roomId}?video=${encodeURIComponent(videoId)}`);
  };

  const goToFacebookRoom = (videoKey: string, href: string) => {
    const roomId = Math.random().toString(36).substring(2, 8);
    markRoomHost(roomId);
    storeFacebookRoomInit(roomId, { videoKey, href });
    const qs = new URLSearchParams({
      provider: "facebook",
      video: videoKey,
    });
    router.push(`/room/${roomId}?${qs.toString()}`);
  };

  const createRoom = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setUrlError(null);

    setStarting(true);
    try {
      const result = await resolveVideoFromPaste(trimmed);
      if (!result.ok) {
        setUrlError(result.error);
        return;
      }

      if (result.provider === "youtube") {
        if (user) {
          const { gameId } = await createQuickReviewGame(user.uid, result.videoId);
          router.push(`/game/${gameId}/review`);
          return;
        }
        goToRoom(result.videoId);
        return;
      }

      goToFacebookRoom(result.ref.videoKey, result.ref.href);
    } catch (err) {
      setUrlError(
        err instanceof Error ? err.message : "Could not start review.",
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center text-white">
      <div className="flex w-full max-w-md flex-col items-center space-y-10">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.08)] sm:text-5xl">
            Film Room
          </h1>
          <p className="text-base leading-relaxed text-white/85 sm:text-lg">
            Turn a YouTube or Facebook video into a shared film room.
          </p>
        </div>

        <div className="flex w-full flex-col items-center space-y-4 rounded-2xl border border-white/[0.07] bg-zinc-950/40 p-6 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-8">
          <input
            type="text"
            placeholder="Paste YouTube or Facebook URL"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(null);
            }}
            className={inputClass}
          />
          {urlError ? (
            <p className="w-full text-left text-xs leading-relaxed text-rose-200">
              {urlError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void createRoom()}
            disabled={starting || !url.trim()}
            className={primaryBtn}
          >
            {starting ? "Starting…" : user ? "Start review" : "Start Room"}
          </button>
          <Link href="/app" className={secondaryBtn}>
            Log In
          </Link>
          <Link href="/about" className={helpLink}>
            How Film Room works
          </Link>
        </div>
      </div>
    </div>
  );
}
