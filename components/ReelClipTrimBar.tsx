"use client";

import { useCallback, useRef, useState } from "react";
import { formatTimelineSeconds } from "@/lib/game-timeline";
import {
  applyTrimHandleDrag,
  clipDurationSec,
  clipTrimContext,
  gameTimeFromTrimRatio,
  selectionRatios,
} from "@/lib/reel-clip-trim";

export type ReelClipTrimBarProps = {
  gameTime: number;
  startOffsetSec: number;
  endOffsetSec: number;
  onChange: (startOffsetSec: number, endOffsetSec: number) => void;
  /** e.g. Live / Slow-mo */
  beatLabel?: string;
};

export default function ReelClipTrimBar({
  gameTime,
  startOffsetSec,
  endOffsetSec,
  onChange,
  beatLabel,
}: ReelClipTrimBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const ctx = clipTrimContext(gameTime, startOffsetSec, endOffsetSec);
  const { left, width } = selectionRatios(
    gameTime,
    startOffsetSec,
    endOffsetSec,
    ctx,
  );
  const clipStart = Math.max(0, gameTime + startOffsetSec);
  const clipEnd = Math.max(clipStart, gameTime + endOffsetSec);
  const duration = clipDurationSec(startOffsetSec, endOffsetSec);

  const ratioFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return gameTime;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return gameTime;
      return gameTimeFromTrimRatio((clientX - rect.left) / rect.width, ctx);
    },
    [ctx, gameTime],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragging) return;
      const pointerGameTime = ratioFromPointer(event.clientX);
      const next = applyTrimHandleDrag(
        gameTime,
        startOffsetSec,
        endOffsetSec,
        dragging,
        pointerGameTime,
      );
      onChange(next.startOffsetSec, next.endOffsetSec);
    },
    [
      dragging,
      endOffsetSec,
      gameTime,
      onChange,
      ratioFromPointer,
      startOffsetSec,
    ],
  );

  const endDrag = useCallback(() => setDragging(null), []);

  return (
    <div className="mt-2">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
        <span>
          {beatLabel ? (
            <span className="mr-1.5 font-semibold uppercase tracking-wide text-zinc-400">
              {beatLabel}
            </span>
          ) : null}
          Drag handles to trim
        </span>
        <span className="font-mono text-zinc-300">
          {formatTimelineSeconds(clipStart)} → {formatTimelineSeconds(clipEnd)} ·{" "}
          {duration}s
        </span>
      </div>
      <div
        ref={trackRef}
        className="relative h-9 select-none rounded-md border border-white/[0.08] bg-zinc-900/80 px-2"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="relative h-full">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/[0.08]" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500/70"
            style={{
              left: `${left * 100}%`,
              width: `${width * 100}%`,
            }}
          />
          {(["start", "end"] as const).map((handle) => {
            const at = handle === "start" ? left : left + width;
            return (
              <button
                key={handle}
                type="button"
                aria-label={handle === "start" ? "Trim start" : "Trim end"}
                className="absolute top-1/2 z-10 h-7 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-white/25 bg-white shadow-sm touch-none"
                style={{ left: `${at * 100}%` }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setDragging(handle);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
