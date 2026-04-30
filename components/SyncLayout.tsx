"use client";

import type { ReactNode } from "react";

export type LayoutMode = "grid" | "focus" | "pip";

export type SyncLayoutAngle = {
  id: string;
  element: ReactNode;
};

type Props = {
  angles: SyncLayoutAngle[];
  playerViewAngleId: string;
  layoutMode: LayoutMode;
};

export default function SyncLayout({
  angles,
  playerViewAngleId,
  layoutMode,
}: Props) {
  if (angles.length === 0) return null;

  const primary = angles.find((a) => a.id === playerViewAngleId) ?? angles[0]!;
  const others = angles.filter((a) => a.id !== primary.id);

  // IMPORTANT: this component must not remount angle elements when changing `layoutMode`.
  // We keep a single render tree and only change CSS/layout.
  const isGrid = layoutMode === "grid";
  const isFocus = layoutMode === "focus";
  const isPip = layoutMode === "pip";

  const rootClassName = isPip
    ? "relative isolate h-full w-full"
    : "grid h-full w-full gap-2";

  const rootStyle: React.CSSProperties | undefined = isPip
    ? undefined
    : isGrid
      ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }
      : {
          gridTemplateRows: "minmax(0, 1fr) 10rem",
          gridTemplateColumns: `repeat(${Math.max(1, others.length)}, minmax(0, 1fr))`,
        };

  return (
    <div className={rootClassName} style={rootStyle}>
      {/* Primary */}
      <div
        key={primary.id}
        className={
          isPip
            ? "absolute inset-0"
            : "relative isolate min-h-0 min-w-0 overflow-hidden"
        }
        style={
          isGrid
            ? undefined
            : isFocus
              ? { gridColumn: "1 / -1", gridRow: "1 / 2" }
              : undefined
        }
      >
        {primary.element}
      </div>

      {/* Others */}
      {others.map((a, i) => (
        <div
          key={a.id}
          className={
            isPip
              ? "absolute bottom-4 right-4 h-36 w-64 overflow-hidden rounded-md border border-white/20 shadow-lg"
              : "relative isolate min-h-0 min-w-0 overflow-hidden"
          }
          style={
            isPip
              ? { transform: `translateY(-${i * 150}px)`, zIndex: 20 + i }
              : isFocus
                ? { gridRow: "2 / 3", gridColumn: `${i + 1} / ${i + 2}` }
                : undefined
          }
        >
          {a.element}
        </div>
      ))}
    </div>
  );
}

