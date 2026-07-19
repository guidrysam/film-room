"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import SoccerFieldSvg from "@/components/SoccerFieldSvg";
import {
  TACTICS_AWAY_COLOR,
  TACTICS_DRAW_COLOR,
  TACTICS_HOME_COLOR,
  generateTacticsObjectId,
  type TacticsBoardObject,
  type TacticsDrawingKind,
  type TacticsFieldOrientation,
  type TacticsFieldView,
  type TacticsPlayerTeam,
} from "@/lib/tactics-boards";
import {
  aspectRatioForView,
  ballRadius,
  clampNormToFieldView,
  normToSvg,
  playerRadius,
  svgToNorm,
  viewBoxAttr,
} from "@/lib/tactics-field-geometry";

export type TacticsTool =
  | "select"
  | "home"
  | "away"
  | "ball"
  | "cone"
  | "mini_goal"
  | "area_label"
  | "arrow"
  | "draw"
  | "circle"
  | "zone";

export type CanvasTacticsObject = TacticsBoardObject & {
  opacity?: number;
  fromLayer?: boolean;
};

export type TacticsBoardCanvasProps = {
  orientation: TacticsFieldOrientation;
  fieldView?: TacticsFieldView;
  objects: CanvasTacticsObject[];
  /** Prior-step ghosts (edit aid only). */
  ghostObjects?: TacticsBoardObject[];
  showGhostPaths?: boolean;
  tool: TacticsTool;
  drawColor?: string;
  readOnly?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Live object updates during drag (no history). */
  onChangeObjects?: (objects: TacticsBoardObject[]) => void;
  /** Fired when a drag/draw gesture completes (commit history + save). */
  onGestureEnd?: (objects: TacticsBoardObject[]) => void;
  svgRef?: RefObject<SVGSVGElement | null>;
  className?: string;
};

function nextPlayerLabel(
  objects: TacticsBoardObject[],
  team: TacticsPlayerTeam,
): string {
  let max = 0;
  for (const o of objects) {
    if (o.type !== "player" || o.team !== team) continue;
    const n = Number.parseInt(o.label, 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return String(Math.min(99, max + 1));
}

function arrowHeadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a1 = angle - Math.PI / 7;
  const a2 = angle + Math.PI / 7;
  const p1 = `${x2 - size * Math.cos(a1)},${y2 - size * Math.sin(a1)}`;
  const p2 = `${x2 - size * Math.cos(a2)},${y2 - size * Math.sin(a2)}`;
  return `${x2},${y2} ${p1} ${p2}`;
}

export default function TacticsBoardCanvas({
  orientation,
  fieldView = "full",
  objects,
  ghostObjects = [],
  showGhostPaths = false,
  tool,
  drawColor = TACTICS_DRAW_COLOR,
  readOnly = false,
  selectedId = null,
  onSelect,
  onChangeObjects,
  onGestureEnd,
  svgRef: externalSvgRef,
  className,
}: TacticsBoardCanvasProps) {
  const localSvgRef = useRef<SVGSVGElement | null>(null);
  useImperativeHandle<SVGSVGElement | null, SVGSVGElement | null>(
    externalSvgRef,
    () => localSvgRef.current,
  );
  const setSvgNode = useCallback(
    (node: SVGSVGElement | null) => {
      localSvgRef.current = node;
    },
    [],
  );

  const dragRef = useRef<{
    id: string;
    pointerId: number;
    mode: "move" | "draw";
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const [draft, setDraft] = useState<TacticsBoardObject | null>(null);
  const objectsRef = useRef(objects);
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  const pR = playerRadius(orientation, fieldView);
  const bR = ballRadius(orientation, fieldView);
  const aspect = aspectRatioForView(orientation, fieldView);

  const clampVisible = useCallback(
    (x: number, y: number) =>
      clampNormToFieldView(x, y, orientation, fieldView),
    [orientation, fieldView],
  );

  const clientToNorm = useCallback(
    (clientX: number, clientY: number) => {
      const svg = localSvgRef.current;
      if (!svg) return { x: 0.5, y: 0.5 };
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0.5, y: 0.5 };
      const sp = pt.matrixTransform(ctm.inverse());
      return svgToNorm(sp.x, sp.y, orientation);
    },
    [orientation],
  );

  const commitObjects = useCallback(
    (next: TacticsBoardObject[], gestureEnd = false) => {
      objectsRef.current = next;
      onChangeObjects?.(next);
      if (gestureEnd) onGestureEnd?.(next);
    },
    [onChangeObjects, onGestureEnd],
  );

  const updateObject = useCallback(
    (id: string, patch: Partial<TacticsBoardObject>) => {
      const next = objectsRef.current.map((o) =>
        o.id === id ? ({ ...o, ...patch } as TacticsBoardObject) : o,
      );
      commitObjects(next);
    },
    [commitObjects],
  );

  const handleBackgroundPointerDown = (e: ReactPointerEvent) => {
    if (readOnly) return;
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest("[data-tactics-object]")) return;

    const norm = clientToNorm(e.clientX, e.clientY);

    if (tool === "select") {
      onSelect?.(null);
      return;
    }

    if (tool === "home" || tool === "away") {
      const team: TacticsPlayerTeam = tool === "home" ? "home" : "away";
      const obj: TacticsBoardObject = {
        id: generateTacticsObjectId(),
        type: "player",
        team,
        ...clampVisible(norm.x, norm.y),
        label: nextPlayerLabel(objectsRef.current, team),
        color: team === "home" ? TACTICS_HOME_COLOR : TACTICS_AWAY_COLOR,
      };
      commitObjects([...objectsRef.current, obj], true);
      onSelect?.(obj.id);
      return;
    }

    if (tool === "ball") {
      const withoutBall = objectsRef.current.filter((o) => o.type !== "ball");
      const obj: TacticsBoardObject = {
        id: generateTacticsObjectId(),
        type: "ball",
        ...clampVisible(norm.x, norm.y),
      };
      commitObjects([...withoutBall, obj], true);
      onSelect?.(obj.id);
      return;
    }

    if (tool === "cone" || tool === "mini_goal" || tool === "area_label") {
      const position = clampVisible(norm.x, norm.y);
      const obj: TacticsBoardObject =
        tool === "cone"
          ? {
              id: generateTacticsObjectId(),
              type: "cone",
              ...position,
              color: "#f97316",
            }
          : tool === "mini_goal"
            ? {
                id: generateTacticsObjectId(),
                type: "mini_goal",
                ...position,
                rotation: 0,
              }
            : {
                id: generateTacticsObjectId(),
                type: "area_label",
                ...position,
                text: "Area",
              };
      commitObjects([...objectsRef.current, obj], true);
      onSelect?.(obj.id);
      return;
    }

    const drawType: TacticsDrawingKind =
      tool === "arrow"
        ? "arrow"
        : tool === "circle"
          ? "circle"
          : tool === "zone"
            ? "zone"
            : "line";

    const draftId = generateTacticsObjectId();
    const draftObj: TacticsBoardObject = {
      id: draftId,
      type: drawType,
      points: [{ ...norm }, { ...norm }],
      color: drawColor,
      ...(tool === "draw" ? { freehand: true } : {}),
    };
    setDraft(draftObj);
    dragRef.current = {
      id: draftId,
      pointerId: e.pointerId,
      mode: "draw",
    };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleObjectPointerDown = (
    e: ReactPointerEvent,
    id: string,
  ) => {
    if (readOnly) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    onSelect?.(id);
    if (tool === "select" || tool === "home" || tool === "away" || tool === "ball") {
      dragRef.current = {
        id,
        pointerId: e.pointerId,
        mode: "move",
      };
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const norm = clientToNorm(e.clientX, e.clientY);

    if (drag.mode === "move") {
      const obj = objectsRef.current.find((o) => o.id === drag.id);
      if (!obj) return;
      if (
        obj.type === "player" ||
        obj.type === "ball" ||
        obj.type === "cone" ||
        obj.type === "mini_goal" ||
        obj.type === "area_label"
      ) {
        const c = clampVisible(norm.x, norm.y);
        updateObject(drag.id, { x: c.x, y: c.y });
      }
      return;
    }

    if (drag.mode === "draw") {
      setDraft((prev) => {
        if (!prev || prev.id !== drag.id) return prev;
        if (
          prev.type === "player" ||
          prev.type === "ball" ||
          prev.type === "cone" ||
          prev.type === "mini_goal" ||
          prev.type === "area_label"
        ) {
          return prev;
        }
        if (prev.freehand) {
          return {
            ...prev,
            points: [...prev.points, clampVisible(norm.x, norm.y)],
          };
        }
        return {
          ...prev,
          points: [prev.points[0]!, clampVisible(norm.x, norm.y)],
        };
      });
    }
  };

  const handlePointerUp = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (drag.mode === "draw") {
      setDraft((prev) => {
        if (!prev || prev.id !== drag.id) return null;
        if (
          prev.type === "player" ||
          prev.type === "ball" ||
          prev.type === "cone" ||
          prev.type === "mini_goal" ||
          prev.type === "area_label"
        ) {
          return null;
        }
        const pts = prev.points;
        const tooSmall =
          !prev.freehand &&
          pts.length >= 2 &&
          Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y) < 0.01;
        const freeTooShort = Boolean(prev.freehand && pts.length < 3);
        if (!tooSmall && !freeTooShort) {
          commitObjects([...objectsRef.current, prev], true);
          onSelect?.(prev.id);
        }
        return null;
      });
    } else if (drag.mode === "move") {
      commitObjects(objectsRef.current, true);
    }

    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const opacityOf = (o: CanvasTacticsObject) =>
    typeof o.opacity === "number" ? o.opacity : 1;

  const renderDrawing = (
    o: Extract<CanvasTacticsObject, { type: TacticsDrawingKind }>,
    keyPrefix = "",
  ) => {
    const selected = selectedId === o.id;
    const opacity = opacityOf(o);
    if (opacity <= 0.01) return null;
    const pts = o.points.map((p) => normToSvg(p.x, p.y, orientation));
    if (pts.length < 2) return null;
    const key = `${keyPrefix}${o.id}`;

    if (o.type === "circle") {
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      return (
        <ellipse
          key={key}
          data-tactics-object={o.id}
          cx={cx}
          cy={cy}
          rx={Math.max(4, rx)}
          ry={Math.max(4, ry)}
          fill="none"
          stroke={o.color}
          strokeWidth={selected ? 4 : 3}
          strokeDasharray={selected ? "6 4" : undefined}
          opacity={opacity}
          onPointerDown={(e) => handleObjectPointerDown(e, o.id)}
          style={{ cursor: readOnly ? "default" : "pointer" }}
        />
      );
    }

    if (o.type === "zone") {
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      return (
        <rect
          key={key}
          data-tactics-object={o.id}
          x={x}
          y={y}
          width={Math.max(4, w)}
          height={Math.max(4, h)}
          rx={6}
          fill={`${o.color}33`}
          stroke={o.color}
          strokeWidth={selected ? 3.5 : 2.5}
          opacity={opacity}
          onPointerDown={(e) => handleObjectPointerDown(e, o.id)}
          style={{ cursor: readOnly ? "default" : "pointer" }}
        />
      );
    }

    if (o.freehand || pts.length > 2) {
      const d = pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ");
      return (
        <path
          key={key}
          data-tactics-object={o.id}
          d={d}
          fill="none"
          stroke={o.color}
          strokeWidth={selected ? 4 : 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
          onPointerDown={(e) => handleObjectPointerDown(e, o.id)}
          style={{ cursor: readOnly ? "default" : "pointer" }}
        />
      );
    }

    const a = pts[0]!;
    const b = pts[1]!;
    return (
      <g
        key={key}
        data-tactics-object={o.id}
        opacity={opacity}
        onPointerDown={(e) => handleObjectPointerDown(e, o.id)}
        style={{ cursor: readOnly ? "default" : "pointer" }}
      >
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={o.color}
          strokeWidth={selected ? 4 : 3}
          strokeLinecap="round"
        />
        {o.type === "arrow" ? (
          <polygon
            points={arrowHeadPoints(a.x, a.y, b.x, b.y, 14)}
            fill={o.color}
          />
        ) : null}
      </g>
    );
  };

  const allObjects: CanvasTacticsObject[] = draft
    ? [...objects, draft]
    : objects;

  const currentById = new Map(
    allObjects
      .filter((o) => o.type === "player" || o.type === "ball")
      .map((o) => [o.id, o]),
  );

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl shadow-black/50 ring-1 ring-white/10 ${
        dragging ? "touch-none" : ""
      } ${
        orientation === "vertical" && fieldView === "full"
          ? "mx-auto max-w-md"
          : ""
      } ${className ?? ""}`}
      style={{ aspectRatio: aspect }}
    >
      <svg
        ref={setSvgNode}
        viewBox={viewBoxAttr(orientation, fieldView)}
        className="block h-full w-full select-none"
        role="img"
        aria-label="Tactics board"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <SoccerFieldSvg orientation={orientation} asGroup />
        {showGhostPaths && ghostObjects.length > 0 ? (
          <g pointerEvents="none" opacity={0.35}>
            {ghostObjects.map((g) => {
              if (g.type !== "player" && g.type !== "ball") return null;
              const cur = currentById.get(g.id);
              if (!cur || (cur.type !== "player" && cur.type !== "ball")) {
                return null;
              }
              const a = normToSvg(g.x, g.y, orientation);
              const b = normToSvg(cur.x, cur.y, orientation);
              return (
                <g key={`ghost-${g.id}`}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth={2}
                    strokeDasharray="6 5"
                  />
                  <circle
                    cx={a.x}
                    cy={a.y}
                    r={g.type === "ball" ? bR : pR}
                    fill={
                      g.type === "ball"
                        ? "#f5f5f4"
                        : g.color ||
                          (g.team === "home"
                            ? TACTICS_HOME_COLOR
                            : TACTICS_AWAY_COLOR)
                    }
                    opacity={0.35}
                  />
                </g>
              );
            })}
          </g>
        ) : null}
        {allObjects
          .filter(
            (o) =>
              o.type === "line" ||
              o.type === "arrow" ||
              o.type === "circle" ||
              o.type === "zone",
          )
          .map((o) =>
            renderDrawing(
              o as Extract<CanvasTacticsObject, { type: TacticsDrawingKind }>,
              o.fromLayer ? "from-" : "",
            ),
          )}
        {allObjects.map((o) => {
          if (o.type !== "player") return null;
          const opacity = opacityOf(o);
          if (opacity <= 0.01) return null;
          const p = normToSvg(o.x, o.y, orientation);
          const color =
            o.color ||
            (o.team === "home" ? TACTICS_HOME_COLOR : TACTICS_AWAY_COLOR);
          const selected = selectedId === o.id;
          return (
            <g
              key={`${o.fromLayer ? "from-" : ""}${o.id}`}
              data-tactics-object={o.id}
              transform={`translate(${p.x}, ${p.y})`}
              opacity={opacity}
              onPointerDown={(e) => handleObjectPointerDown(e, o.id)}
              style={{ cursor: readOnly ? "default" : "grab" }}
            >
              {selected ? (
                <circle
                  r={pR + 5}
                  fill="none"
                  stroke="rgba(255,255,255,0.7)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              ) : null}
              <circle
                r={pR}
                fill={color}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2}
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.45))"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff"
                fontSize={pR * 0.95}
                fontWeight={700}
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {o.label}
              </text>
            </g>
          );
        })}
        {allObjects.map((o) => {
          if (o.type !== "ball") return null;
          const opacity = opacityOf(o);
          if (opacity <= 0.01) return null;
          const p = normToSvg(o.x, o.y, orientation);
          const selected = selectedId === o.id;
          return (
            <g
              key={`${o.fromLayer ? "from-" : ""}${o.id}`}
              data-tactics-object={o.id}
              transform={`translate(${p.x}, ${p.y})`}
              opacity={opacity}
              onPointerDown={(e) => handleObjectPointerDown(e, o.id)}
              style={{ cursor: readOnly ? "default" : "grab" }}
            >
              {selected ? (
                <circle
                  r={bR + 6}
                  fill="none"
                  stroke="rgba(255,255,255,0.7)"
                  strokeWidth={2}
                />
              ) : null}
              <circle
                r={bR}
                fill="#f5f5f4"
                stroke="#292524"
                strokeWidth={1.5}
                filter="drop-shadow(0 1px 3px rgba(0,0,0,0.5))"
              />
              <circle r={bR * 0.35} fill="#292524" opacity={0.35} />
            </g>
          );
        })}
        {allObjects.map((o) => {
          if (
            o.type !== "cone" &&
            o.type !== "mini_goal" &&
            o.type !== "area_label"
          ) {
            return null;
          }
          const opacity = opacityOf(o);
          if (opacity <= 0.01) return null;
          const p = normToSvg(o.x, o.y, orientation);
          const selected = selectedId === o.id;
          const key = `${o.fromLayer ? "from-" : ""}${o.id}`;
          if (o.type === "cone") {
            const size = Math.max(12, pR * 0.8);
            return (
              <g
                key={key}
                data-tactics-object={o.id}
                transform={`translate(${p.x}, ${p.y})`}
                opacity={opacity}
                onPointerDown={(e) => handleObjectPointerDown(e, o.id)}
                style={{ cursor: readOnly ? "default" : "grab" }}
              >
                {selected ? (
                  <circle
                    r={size + 6}
                    fill="none"
                    stroke="rgba(255,255,255,0.7)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                ) : null}
                <path
                  d={`M 0 ${-size} L ${size * 0.7} ${size * 0.75} L ${-size * 0.7} ${size * 0.75} Z`}
                  fill={o.color || "#f97316"}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={2}
                />
                <rect
                  x={-size * 0.85}
                  y={size * 0.68}
                  width={size * 1.7}
                  height={size * 0.28}
                  rx={3}
                  fill={o.color || "#f97316"}
                />
              </g>
            );
          }
          if (o.type === "mini_goal") {
            const w = pR * 2.2;
            const h = pR * 1.2;
            return (
              <g
                key={key}
                data-tactics-object={o.id}
                transform={`translate(${p.x}, ${p.y}) rotate(${o.rotation ?? 0})`}
                opacity={opacity}
                onPointerDown={(e) => handleObjectPointerDown(e, o.id)}
                style={{ cursor: readOnly ? "default" : "grab" }}
              >
                {selected ? (
                  <rect
                    x={-w / 2 - 6}
                    y={-h - 6}
                    width={w + 12}
                    height={h + 12}
                    fill="none"
                    stroke="rgba(255,255,255,0.7)"
                    strokeDasharray="4 3"
                  />
                ) : null}
                <path
                  d={`M ${-w / 2} 0 V ${-h} H ${w / 2} V 0 M ${-w / 2} ${-h} L ${-w * 0.35} ${-h * 0.65} H ${w * 0.35} L ${w / 2} ${-h}`}
                  fill="none"
                  stroke="#f8fafc"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          }
          return (
            <g
              key={key}
              data-tactics-object={o.id}
              transform={`translate(${p.x}, ${p.y})`}
              opacity={opacity}
              onPointerDown={(e) => handleObjectPointerDown(e, o.id)}
              style={{ cursor: readOnly ? "default" : "grab" }}
            >
              {selected ? (
                <rect
                  x={-64}
                  y={-20}
                  width={128}
                  height={40}
                  rx={8}
                  fill="none"
                  stroke="rgba(255,255,255,0.7)"
                  strokeDasharray="4 3"
                />
              ) : null}
              <rect
                x={-58}
                y={-16}
                width={116}
                height={32}
                rx={7}
                fill="rgba(0,0,0,0.62)"
                stroke="rgba(255,255,255,0.5)"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff"
                fontSize={15}
                fontWeight={700}
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {o.text}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
