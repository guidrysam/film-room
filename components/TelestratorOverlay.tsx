"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { onValue, push, ref } from "firebase/database";
import { db } from "@/lib/firebase";

export type Point = { x: number; y: number };

export type RemoteStroke = { id: string; points: Point[]; angleId?: string };

/** Dispatched by the room page when strokes are cleared so canvases wipe before RTDB catches up. */
export type FilmRoomTelestratorClearDetail =
  | { scope: "all" }
  | { scope: "angle"; angleId: string };

export const FILM_ROOM_TELESTRATOR_CLEAR_EVENT = "film-room-telestrator-clear";

const POST_CLEAR_SUPPRESS_MS = 1500;

const EMPTY_STROKES: RemoteStroke[] = [];

type Props = {
  roomId: string;
  isHost: boolean;
  drawEnabled: boolean;
  /** Merged onto the stage wrapper (e.g. fixed fullscreen so drawing tracks the video). */
  wrapClassName?: string;
  /** When set, host saves each new stroke with this `angleId` (omit for legacy clip strokes). */
  strokeAngleId?: string;
  /**
   * When set, only strokes for this angle are drawn (plus legacy strokes without `angleId`
   * when `allowLegacyWithoutAngleId` is true).
   */
  renderAngleId?: string;
  /** Legacy RTDB rows without `angleId` appear on this overlay when true (default true). */
  allowLegacyWithoutAngleId?: boolean;
  /** Viewer-only: show temporary draw filter debug and log when strokes exist but none match. */
  viewerDebug?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function filterStrokesForRender(
  remote: RemoteStroke[],
  renderAngleId: string | undefined,
  allowLegacy: boolean,
): RemoteStroke[] {
  if (renderAngleId === undefined) return remote;
  return remote.filter((st) => {
    if (!st.angleId) return allowLegacy;
    return st.angleId === renderAngleId;
  });
}

/** Full bitmap reset: clear, reset backing store, clear again (avoids GPU/driver ghost pixels). */
function resetCanvasHard(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.width;
  const ctx2 = canvas.getContext("2d");
  if (ctx2) {
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
  }
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
    const aid = (row as { angleId?: unknown }).angleId;
    const angleId =
      typeof aid === "string" && aid.trim().length > 0 ? aid.trim() : undefined;
    if (valid.length > 0) list.push({ id, points: valid, angleId });
  }
  return list;
}

export function TelestratorOverlay({
  roomId,
  isHost,
  drawEnabled,
  wrapClassName,
  strokeAngleId,
  renderAngleId,
  allowLegacyWithoutAngleId = true,
  viewerDebug = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [remoteStrokes, setRemoteStrokes] = useState<RemoteStroke[]>([]);
  const [postClearEmpty, setPostClearEmpty] = useState(false);
  const currentStrokeRef = useRef<Point[] | null>(null);
  const drawingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  /** Set on clear so drawAll refuses to paint remote strokes for POST_CLEAR_SUPPRESS_MS. */
  const lastClearTimestampRef = useRef(0);
  const staleAfterClearLoggedRef = useRef(false);

  const canDraw = isHost && drawEnabled;

  useEffect(() => {
    if (!roomId) return;
    const strokesRef = ref(db, `rooms/${roomId}/telestrator/strokes`);
    const unsub = onValue(strokesRef, (snap) => {
      setRemoteStrokes(parseStrokes(snap.val()));
    });
    return unsub;
  }, [roomId]);

  const filteredFromRemote = useMemo(
    () =>
      filterStrokesForRender(
        remoteStrokes,
        renderAngleId,
        allowLegacyWithoutAngleId,
      ),
    [remoteStrokes, renderAngleId, allowLegacyWithoutAngleId],
  );

  const visibleStrokes = useMemo(() => {
    if (postClearEmpty && filteredFromRemote.length > 0) {
      return EMPTY_STROKES;
    }
    return filteredFromRemote;
  }, [filteredFromRemote, postClearEmpty]);

  useEffect(() => {
    if (!postClearEmpty || filteredFromRemote.length > 0) return;
    const id = window.setTimeout(() => {
      setPostClearEmpty(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [postClearEmpty, filteredFromRemote.length]);

  useEffect(() => {
    if (!postClearEmpty) return;
    const id = window.setTimeout(() => {
      setPostClearEmpty(false);
    }, POST_CLEAR_SUPPRESS_MS);
    return () => window.clearTimeout(id);
  }, [postClearEmpty]);

  useEffect(() => {
    if (isHost || renderAngleId === undefined) return;
    if (remoteStrokes.length === 0 || visibleStrokes.length > 0) return;
    const angleIds = [
      ...new Set(
        remoteStrokes.map((st) =>
          st.angleId && st.angleId.length > 0 ? st.angleId : "(legacy)",
        ),
      ),
    ];
    console.warn(
      "[Telestrator] viewer: strokes in room but none visible after filter; renderAngleId=",
      renderAngleId,
      "stroke angle ids:",
      angleIds,
    );
  }, [isHost, renderAngleId, remoteStrokes, visibleStrokes.length]);

  /** Temporary: confirm stale RTDB rows vs render angle after host clear. */
  useEffect(() => {
    if (!postClearEmpty) {
      staleAfterClearLoggedRef.current = false;
      return;
    }
    if (staleAfterClearLoggedRef.current) return;
    if (filteredFromRemote.length === 0) return;
    staleAfterClearLoggedRef.current = true;
    for (const stroke of filteredFromRemote) {
      console.warn(
        "stale strokes",
        "stroke.angleId=",
        stroke.angleId ?? "(legacy)",
        "renderAngleId=",
        renderAngleId,
        "stroke.id=",
        stroke.id,
      );
    }
  }, [postClearEmpty, filteredFromRemote, renderAngleId]);

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

    const wipeBitmap = () => {
      const ctx0 = canvas.getContext("2d");
      if (!ctx0 || canvas.width < 1 || canvas.height < 1) return;
      resetCanvasHard(canvas, ctx0);
    };

    if (cssW < 2 || cssH < 2) {
      wipeBitmap();
      return;
    }
    if (canvas.width !== cssW || canvas.height !== cssH) {
      canvas.width = cssW;
      canvas.height = cssH;
    }
    let ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hasLiveStroke =
      canDraw &&
      drawingRef.current &&
      currentStrokeRef.current &&
      currentStrokeRef.current.length > 0;

    const sinceClear =
      lastClearTimestampRef.current > 0
        ? Date.now() - lastClearTimestampRef.current
        : POST_CLEAR_SUPPRESS_MS;

    if (sinceClear < POST_CLEAR_SUPPRESS_MS) {
      resetCanvasHard(canvas, ctx);
      ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (hasLiveStroke) {
        ctx.strokeStyle = "rgba(255, 230, 80, 0.95)";
        ctx.fillStyle = "rgba(255, 230, 80, 0.95)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const cur = currentStrokeRef.current!;
        if (cur.length === 1) {
          const x = cur[0].x * cssW;
          const y = cur[0].y * cssH;
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (cur.length > 1) {
          ctx.beginPath();
          ctx.moveTo(cur[0].x * cssW, cur[0].y * cssH);
          for (let i = 1; i < cur.length; i++) {
            ctx.lineTo(cur[i].x * cssW, cur[i].y * cssH);
          }
          ctx.stroke();
        }
      }
      return;
    }

    if (visibleStrokes.length === 0 && !hasLiveStroke) {
      resetCanvasHard(canvas, ctx);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
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

    for (const s of visibleStrokes) paintStroke(s.points);
    const cur = currentStrokeRef.current;
    if (cur && cur.length > 0) paintStroke(cur);
  }, [visibleStrokes, canDraw]);

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

  /** Immediate hard reset so pixels disappear before RTDB onValue catches up (Clear Drawings). */
  useEffect(() => {
    const onClear = (ev: Event) => {
      const detail = (ev as CustomEvent<FilmRoomTelestratorClearDetail>).detail;
      if (!detail) return;
      if (detail.scope === "angle") {
        if (renderAngleId !== undefined && detail.angleId !== renderAngleId) {
          return;
        }
        if (renderAngleId === undefined) {
          return;
        }
      }
      lastClearTimestampRef.current = Date.now();
      setPostClearEmpty(true);
      staleAfterClearLoggedRef.current = false;
      if (isHost) {
        currentStrokeRef.current = null;
        drawingRef.current = false;
      }
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && canvas.width > 0 && canvas.height > 0) {
        resetCanvasHard(canvas, ctx);
      }
      scheduleDraw();
    };
    window.addEventListener(FILM_ROOM_TELESTRATOR_CLEAR_EVENT, onClear);
    return () =>
      window.removeEventListener(FILM_ROOM_TELESTRATOR_CLEAR_EVENT, onClear);
  }, [isHost, renderAngleId, scheduleDraw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      scheduleDraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  /* Fullscreen toggles layout asynchronously; redraw after the stage/video box settles. */
  useEffect(() => {
    const onFullscreenLayout = () => {
      scheduleDraw();
      requestAnimationFrame(() => scheduleDraw());
    };
    document.addEventListener("fullscreenchange", onFullscreenLayout);
    document.addEventListener("webkitfullscreenchange", onFullscreenLayout);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenLayout);
      document.removeEventListener(
        "webkitfullscreenchange",
        onFullscreenLayout,
      );
    };
  }, [scheduleDraw]);

  const flushStroke = useCallback(() => {
    const pts = currentStrokeRef.current;
    currentStrokeRef.current = null;
    drawingRef.current = false;
    if (!pts || pts.length < 1 || !roomId) return;
    const row: { points: Point[]; angleId?: string } = { points: pts };
    if (strokeAngleId) row.angleId = strokeAngleId;
    void push(ref(db, `rooms/${roomId}/telestrator/strokes`), row);
    scheduleDraw();
  }, [roomId, strokeAngleId, scheduleDraw]);

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
      className={
        wrapClassName ?? "pointer-events-none absolute inset-0 z-20"
      }
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
      {viewerDebug && !isHost && renderAngleId !== undefined ? (
        <div className="pointer-events-none absolute left-2 top-12 z-[40] max-w-[min(100%,18rem)] rounded border border-cyan-500/45 bg-black/90 px-2 py-1 text-[9px] font-mono leading-snug text-cyan-100/95 shadow-md">
          Drawing angle: {renderAngleId} / strokes: {visibleStrokes.length}
        </div>
      ) : null}
    </div>
  );
}
