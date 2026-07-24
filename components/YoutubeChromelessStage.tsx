"use client";

import type { ReactNode } from "react";

export type YoutubeChromelessStageProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Wrap a react-youtube embed so hover/tap never reaches the iframe — prevents
 * YouTube from re-showing title/progress chrome when controls are hidden.
 * Pair with app-level transport (VideoTransport, scrub sliders, room controls).
 */
export default function YoutubeChromelessStage({
  children,
  className = "",
}: YoutubeChromelessStageProps) {
  return (
    <div className={`relative overflow-hidden ${className}`.trim()}>
      <div className="absolute inset-0 [&_iframe]:pointer-events-none [&_iframe]:h-full [&_iframe]:w-full">
        {children}
      </div>
      <div
        className="pointer-events-auto absolute inset-0 z-10 bg-transparent"
        aria-hidden
      />
    </div>
  );
}
