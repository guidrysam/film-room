"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { onValue, push, ref } from "firebase/database";
import { db } from "@/lib/firebase";

export type Point = { x: number; y: number };

export type RemoteStroke = { id: string; points: Point[] };

type Props = {
  roomId: string;
  isHost: boolean;
  drawEnabled: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parseStrokes(val: unknown): RemoteStroke[] {
  const list: RemoteStroke[] = [];
  if (!val || typeof val !== "object") return list;
  for (const [id, row] of Object.entries(val)) {
    if (!row || typeof row !== "object") continue;
    const pts = (row as { points?: unknown }).points;
    if (!Array.isArray(pts) || pts.length === 0) continue;
    const valid: Point[] = [];
    for (const p of pts) {
      if (
        p &&
        typeof p === "object" &&
        typeof (p as Point).x === "number" &&
        typeof (p as Point).y === "number"
      ) {
        valid.push({ x: (p as Point).x, y: (p as Point).y });
      }
    }
    if (valid.length > 0) list.push({ id, points: valid });
  }
  return list;
}

export function TelestratorOverlay({ roomId, isHost, drawEnabled }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [remoteStrokes, setRemoteStrokes] = useState<RemoteStroke[]>([]);
  const currentStrokeRef = useRef<Point[] | null>(null);
  const drawingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const canDraw = isHost && drawEnabled;

  useEffect(() => {
    if (!roomId) return;
    const strokesRef = ref(db, `rooms/${roomId}/telestrator/strokes`);
    const unsub = onValue(strokesRef, (snap) => {
      setRemoteStrokes(parseStrokes(snap.val()));
    });
    return unsub;
  }, [roomId]);

  const normPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const el = wrapRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      return {
        x: clamp((clientX - r.left) / r.width, 0, 1),
        y: clamp((clientY - r.top) / r.height, 0, 1),
      };
    },
    [],
  );

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    if (cssW < 2 || cssH < 2) return;
    if (canvas.width !== cssW || canvas.height !== cssH) {
      canvas.width = cssW;
      canvas.height = cssH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "rgba(255, 230, 80, 0.95)";
    ctx.fillStyle = "rgba(255, 230, 80, 0.95)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const paintStroke = (points: Point[]) => {
      if (points.length < 1) return;
      if (points.length === 1) {
        const x = points[0].x * cssW;
        const y = points[0].y * cssH;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(points[0].x * cssW, points[0].y * cssH);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * cssW, points[i].y * cssH);
      }
      ctx.stroke();
    };

    for (const s of remoteStrokes) paintStroke(s.points);
    const cur = currentStrokeRef.current;
    if (cur && cur.length > 0) paintStroke(cur);
  }, [remoteStrokes]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawAll();
    });
  }, [drawAll]);

  useEffect(() => {
    drawAll();
  }, [drawAll]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      scheduleDraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  const flushStroke = useCallback(() => {
    const pts = currentStrokeRef.current;
    currentStrokeRef.current = null;
    drawingRef.current = false;
    if (!pts || pts.length < 1 || !roomId) return;
    void push(ref(db, `rooms/${roomId}/telestrator/strokes`), {
      points: pts,
    });
    scheduleDraw();
  }, [roomId, scheduleDraw]);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    e.preventDefault();
    e.stopPropagation();
    const p = normPoint(e.clientX, e.clientY);
    if (!p) return;
    currentStrokeRef.current = [p];
    drawingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    scheduleDraw();
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canDraw) return;
    e.preventDefault();
    const p = normPoint(e.clientX, e.clientY);
    if (!p || !currentStrokeRef.current) return;
    currentStrokeRef.current.push(p);
    scheduleDraw();
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canDraw) return;
    e.preventDefault();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    flushStroke();
  };

  const onPointerCancel = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    currentStrokeRef.current = null;
    drawingRef.current = false;
    scheduleDraw();
  };

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className={
          canDraw
            ? "h-full w-full cursor-crosshair touch-none pointer-events-auto"
            : "h-full w-full touch-none pointer-events-none"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </div>
  );
}
