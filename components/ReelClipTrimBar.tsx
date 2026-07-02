"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimelineSeconds } from "@/lib/game-timeline";
import {
  applyTrimHandleDrag,
  clipDurationSec,
  clipTrimContext,
  type ClipTrimContext,
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
  const draggingRef = useRef<"start" | "end" | null>(null);
  const dragContextRef = useRef<ClipTrimContext | null>(null);
  const offsetsRef = useRef({ startOffsetSec, endOffsetSec });
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  offsetsRef.current = { startOffsetSec, endOffsetSec };

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

  const ratioFromClientX = useCallback((clientX: number, mapCtx: ClipTrimContext) => {
    const track = trackRef.current;
    if (!track) return gameTime;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return gameTime;
    return gameTimeFromTrimRatio((clientX - rect.left) / rect.width, mapCtx);
  }, [gameTime]);

  const endDrag = useCallback(() => {
    draggingRef.current = null;
    dragContextRef.current = null;
    setDragging(null);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (event: PointerEvent) => {
      const handle = draggingRef.current;
      const mapCtx = dragContextRef.current;
      if (!handle || !mapCtx) return;
      const { startOffsetSec: start, endOffsetSec: end } = offsetsRef.current;
      const pointerGameTime = ratioFromClientX(event.clientX, mapCtx);
      const next = applyTrimHandleDrag(
        gameTime,
        start,
        end,
        handle,
        pointerGameTime,
      );
      onChange(next.startOffsetSec, next.endOffsetSec);
    };

    const onPointerUp = () => endDrag();

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dragging, endDrag, gameTime, onChange, ratioFromClientX]);

  const beginDrag = useCallback(
    (handle: "start" | "end") => (event: React.PointerEvent) => {
      event.preventDefault();
      dragContextRef.current = clipTrimContext(
        gameTime,
        startOffsetSec,
        endOffsetSec,
      );
      draggingRef.current = handle;
      setDragging(handle);
    },
    [endOffsetSec, gameTime, startOffsetSec],
  );

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
                className={`absolute top-1/2 z-10 h-7 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-white/25 bg-white shadow-sm touch-none ${
                  dragging === handle ? "ring-2 ring-blue-400/60" : ""
                }`}
                style={{ left: `${at * 100}%` }}
                onPointerDown={beginDrag(handle)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
