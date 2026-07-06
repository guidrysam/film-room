"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { YouTubePlayer } from "react-youtube";
import {
  facebookPlayerAsYoutube,
  loadFacebookSdk,
  subscribeFacebookVideoReady,
  type FacebookEmbedPlayer,
} from "@/lib/facebook-player-api";

export type FacebookVideoPlayerProps = {
  href: string;
  className?: string;
  onReady?: (player: YouTubePlayer) => void;
  onError?: (message: string) => void;
};

const DEFAULT_APP_ID = "0";

function readFacebookAppId(): string {
  const fromEnv = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim();
  return fromEnv || DEFAULT_APP_ID;
}

export default function FacebookVideoPlayer({
  href,
  className,
  onReady,
  onError,
}: FacebookVideoPlayerProps) {
  const reactId = useId();
  const elementId = `fb-video-${reactId.replace(/:/g, "")}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shimRef = useRef<YouTubePlayer | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFacebookSdk(readFacebookAppId())
      .then(() => {
        if (!cancelled) setSdkReady(true);
      })
      .catch((err) => {
        const msg =
          err instanceof Error
            ? err.message
            : "Facebook player could not load.";
        if (!cancelled) {
          setLoadError(msg);
          onError?.(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  useEffect(() => {
    if (!sdkReady || !href.trim()) return;

    const handleReady = (instance: FacebookEmbedPlayer) => {
      const shim = facebookPlayerAsYoutube(instance);
      shimRef.current = shim;
      onReady?.(shim);
    };

    const release = subscribeFacebookVideoReady(elementId, handleReady);

    const node = containerRef.current;
    if (node) {
      try {
        window.FB?.XFBML?.parse(node);
      } catch {
        /* parse later */
      }
    }

    return release;
  }, [sdkReady, href, elementId, onReady]);

  if (loadError) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-black px-4 text-center text-sm text-zinc-300 ${className ?? ""}`}
      >
        <p>{loadError}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`h-full w-full ${className ?? ""}`}>
      <div
        id={elementId}
        className="fb-video h-full w-full"
        data-href={href}
        data-width="auto"
        data-show-text="false"
        data-allowfullscreen="true"
        data-autoplay="false"
      />
    </div>
  );
}
