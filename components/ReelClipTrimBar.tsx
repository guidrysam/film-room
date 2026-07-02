"use client";

import { useCallback, useRef, useState } from "react";
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

type DragAnchor = {
  startOffsetSec: number;
  endOffsetSec: number;
};

export default function ReelClipTrimBar({
  gameTime,
  startOffsetSec,
  endOffsetSec,
  onChange,
  beatLabel,
}: ReelClipTrimBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragContextRef = useRef<ClipTrimContext | null>(null);
  const anchorRef = useRef<DragAnchor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [draft, setDraft] = useState<DragAnchor | null>(null);

  const displayStart = draft?.startOffsetSec ?? startOffsetSec;
  const displayEnd = draft?.endOffsetSec ?? endOffsetSec;
  const displayCtx =
    dragging && dragContextRef.current
      ? dragContextRef.current
      : clipTrimContext(gameTime, displayStart, displayEnd);
  const { left, width } = selectionRatios(
    gameTime,
    displayStart,
    displayEnd,
    displayCtx,
  );
  const clipStart = Math.max(0, gameTime + displayStart);
  const clipEnd = Math.max(clipStart, gameTime + displayEnd);
  const duration = clipDurationSec(displayStart, displayEnd);

  const pointerGameTime = useCallback((clientX: number, mapCtx: ClipTrimContext) => {
    const track = trackRef.current;
    if (!track) return gameTime;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return gameTime;
    return gameTimeFromTrimRatio((clientX - rect.left) / rect.width, mapCtx);
  }, [gameTime]);

  const beginDrag = useCallback(
    (handle: "start" | "end") => (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const anchor: DragAnchor = { startOffsetSec, endOffsetSec };
      anchorRef.current = anchor;
      dragContextRef.current = clipTrimContext(
        gameTime,
        anchor.startOffsetSec,
        anchor.endOffsetSec,
      );
      setDraft(anchor);
      setDragging(handle);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const mapCtx = dragContextRef.current;
        const locked = anchorRef.current;
        if (!mapCtx || !locked) return;

        const at = pointerGameTime(moveEvent.clientX, mapCtx);
        if (handle === "start") {
          const nextStart = applyTrimHandleDrag(
            gameTime,
            locked.startOffsetSec,
            locked.endOffsetSec,
            "start",
            at,
          ).startOffsetSec;
          const next = {
            startOffsetSec: nextStart,
            endOffsetSec: locked.endOffsetSec,
          };
          setDraft(next);
          onChangeRef.current(next.startOffsetSec, next.endOffsetSec);
          return;
        }

        const nextEnd = applyTrimHandleDrag(
          gameTime,
          locked.startOffsetSec,
          locked.endOffsetSec,
          "end",
          at,
        ).endOffsetSec;
        const next = {
          startOffsetSec: locked.startOffsetSec,
          endOffsetSec: nextEnd,
        };
        setDraft(next);
        onChangeRef.current(next.startOffsetSec, next.endOffsetSec);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        anchorRef.current = null;
        dragContextRef.current = null;
        setDragging(null);
        setDraft(null);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [endOffsetSec, gameTime, pointerGameTime, startOffsetSec],
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
      <div className="rounded-md border border-white/[0.08] bg-zinc-900/80 px-2 py-1">
        <div ref={trackRef} className="relative h-7 select-none">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/[0.08]" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500/70"
            style={{
              left: `${left * 100}%`,
              width: `${width * 100}%`,
            }}
          />
          <button
            type="button"
            aria-label="Trim start"
            className={`absolute top-1/2 z-10 h-6 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-white/25 bg-white shadow-sm touch-none ${
              dragging === "start" ? "ring-2 ring-blue-400/60" : ""
            }`}
            style={{ left: `${left * 100}%` }}
            onPointerDown={beginDrag("start")}
          />
          <button
            type="button"
            aria-label="Trim end"
            className={`absolute top-1/2 z-10 h-6 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-white/25 bg-white shadow-sm touch-none ${
              dragging === "end" ? "ring-2 ring-blue-400/60" : ""
            }`}
            style={{ left: `${(left + width) * 100}%` }}
            onPointerDown={beginDrag("end")}
          />
        </div>
      </div>
    </div>
  );
}
