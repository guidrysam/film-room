"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const STEP = 0.25;

type Props = {
  children: ReactNode;
  className?: string;
  /** When true (host drawing), pan is disabled so strokes stay accurate. */
  drawLocked?: boolean;
  /** Show zoom controls (defaults true). */
  showControls?: boolean;
};

export function VideoZoomStage({
  children,
  className = "",
  drawLocked = false,
  showControls = true,
}: Props) {
  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const applyScale = useCallback((next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setScale(clamped);
    if (clamped <= MIN_SCALE) {
      panRef.current = { x: 0, y: 0 };
      setPan({ x: 0, y: 0 });
    }
  }, []);

  const zoomBy = useCallback(
    (delta: number) => {
      applyScale(Math.round((scale + delta) * 100) / 100);
    },
    [applyScale, scale],
  );

  const resetZoom = useCallback(() => {
    applyScale(MIN_SCALE);
  }, [applyScale]);

  const onPanPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (drawLocked || scale <= MIN_SCALE) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPanPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const next = {
      x: drag.panX + (e.clientX - drag.startX),
      y: drag.panY + (e.clientY - drag.startY),
    };
    panRef.current = next;
    setPan(next);
  };

  const endPan = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  };

  const zoomed = scale > MIN_SCALE;
  const transform =
    zoomed || pan.x !== 0 || pan.y !== 0
      ? `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
      : undefined;

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div
        className="relative h-full w-full"
        style={{
          transform,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>

      {zoomed && !drawLocked ? (
        <div
          className="absolute inset-0 z-[14] cursor-grab touch-none active:cursor-grabbing"
          aria-hidden
          onPointerDown={onPanPointerDown}
          onPointerMove={onPanPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        />
      ) : null}

      {showControls ? (
        <div className="pointer-events-none absolute right-2 top-2 z-[45] flex items-center gap-0.5 rounded-md border border-white/15 bg-black/70 p-0.5 text-[10px] font-semibold text-zinc-100 shadow-md backdrop-blur-sm">
          <button
            type="button"
            className="pointer-events-auto rounded px-1.5 py-0.5 transition hover:bg-white/10 disabled:opacity-35"
            disabled={scale <= MIN_SCALE}
            onClick={(e) => {
              e.stopPropagation();
              zoomBy(-STEP);
            }}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="pointer-events-auto min-w-[2.75rem] rounded px-1 py-0.5 font-mono tabular-nums transition hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              resetZoom();
            }}
            aria-label="Reset zoom"
            title="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            className="pointer-events-auto rounded px-1.5 py-0.5 transition hover:bg-white/10 disabled:opacity-35"
            disabled={scale >= MAX_SCALE}
            onClick={(e) => {
              e.stopPropagation();
              zoomBy(STEP);
            }}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
        </div>
      ) : null}
    </div>
  );
}
