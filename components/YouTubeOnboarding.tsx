"use client";

import { useCallback, useEffect, useState } from "react";
import { getYouTubeOAuthAccessToken } from "@/lib/auth-google";
import { loadYouTubeOnboarding, saveYouTubeChannel } from "@/lib/user-youtube";
import {
  fetchMyYouTubeChannel,
  type MyYouTubeChannel,
} from "@/lib/youtube-channel";

export type YouTubeOnboardingProps = {
  currentUid: string;
  /** Fired once a channel is confirmed (newly connected or already saved). */
  onConnected?: (channel: MyYouTubeChannel) => void;
};

type Phase =
  | "loading"
  | "idle"
  | "connecting"
  | "connected"
  | "needs_channel"
  | "error";

const CREATE_CHANNEL_URL = "https://www.youtube.com/channel_switcher";

/**
 * One-time YouTube setup for non-tech parents: confirms their Gmail-backed
 * YouTube channel exists (creating one if needed), and explains that uploads
 * stay unlisted. Connection state is saved to the user profile so we don't nag.
 */
export default function YouTubeOnboarding({
  currentUid,
  onConnected,
}: YouTubeOnboardingProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [channel, setChannel] = useState<MyYouTubeChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadYouTubeOnboarding(currentUid);
      if (cancelled) return;
      if (saved) {
        const c: MyYouTubeChannel = {
          id: saved.channelId,
          title: saved.channelTitle,
          ...(saved.customUrl ? { customUrl: saved.customUrl } : {}),
        };
        setChannel(c);
        setPhase("connected");
        setCollapsed(true);
        onConnected?.(c);
      } else {
        setPhase("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUid, onConnected]);

  const connect = useCallback(async () => {
    setPhase("connecting");
    setError(null);
    try {
      const { accessToken } = await getYouTubeOAuthAccessToken();
      const result = await fetchMyYouTubeChannel(accessToken);
      if (result.status === "found") {
        setChannel(result.channel);
        setPhase("connected");
        await saveYouTubeChannel(currentUid, result.channel);
        onConnected?.(result.channel);
      } else if (result.status === "no_channel") {
        setPhase("needs_channel");
      } else {
        setError(result.message);
        setPhase("error");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't connect to YouTube.",
      );
      setPhase("error");
    }
  }, [currentUid, onConnected]);

  if (phase === "loading") return null;

  if (phase === "connected" && channel) {
    return (
      <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-emerald-100">
            YouTube connected: {channel.title}
          </p>
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="text-[10px] text-emerald-200/70 hover:text-emerald-100"
            >
              Details
            </button>
          ) : null}
        </div>
        {!collapsed ? (
          <div className="mt-1 space-y-1">
            <p className="text-[10px] leading-snug text-emerald-200/80">
              Your clips upload unlisted to this channel — only people with the
              link (your team in Film Room) can watch them.
            </p>
            <button
              type="button"
              onClick={() => void connect()}
              className="text-[10px] font-semibold text-emerald-300 underline-offset-2 hover:underline"
            >
              Re-check connection
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-md border border-sky-500/25 bg-sky-950/20 px-2.5 py-2">
      <p className="mb-1 text-[11px] font-medium text-sky-100">
        Set up your YouTube (one time)
      </p>
      <p className="mb-2 text-[10px] leading-snug text-sky-200/85">
        If you use Gmail, you already have a YouTube account. We upload your
        clips <span className="font-semibold">unlisted</span> — only people with
        the link (your team) can see them. Connect once to get started.
      </p>

      {phase === "needs_channel" ? (
        <div className="mb-2 space-y-1.5 rounded border border-amber-500/30 bg-amber-950/25 px-2 py-1.5">
          <p className="text-[10px] leading-snug text-amber-200/90">
            Your Google account doesn&rsquo;t have a YouTube channel yet. Create
            one (it&rsquo;s free and takes a few seconds), then re-check.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <a
              href={CREATE_CHANNEL_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-amber-400/50 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-100 transition hover:bg-amber-500/25"
            >
              Create my channel
            </a>
            <button
              type="button"
              onClick={() => void connect()}
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-zinc-200 transition hover:bg-white/[0.08]"
            >
              I created it — re-check
            </button>
          </div>
        </div>
      ) : null}

      {phase === "error" && error ? (
        <p className="mb-2 text-[10px] leading-snug text-rose-300">{error}</p>
      ) : null}

      {phase !== "needs_channel" ? (
        <button
          type="button"
          onClick={() => void connect()}
          disabled={phase === "connecting"}
          className="rounded-md border border-sky-500/40 bg-sky-950/45 px-2.5 py-1 text-[11px] font-semibold text-sky-100 transition hover:bg-sky-900/55 disabled:opacity-50"
        >
          {phase === "connecting" ? "Connecting…" : "Connect YouTube"}
        </button>
      ) : null}
    </div>
  );
}
