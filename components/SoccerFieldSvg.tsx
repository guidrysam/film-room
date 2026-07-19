"use client";

import type { TacticsFieldOrientation } from "@/lib/tactics-boards";
import { H_VIEW, V_VIEW } from "@/lib/tactics-field-geometry";

export type SoccerFieldSvgProps = {
  orientation: TacticsFieldOrientation;
  /** When true, render pitch geometry as a group (for nesting in a parent SVG). */
  asGroup?: boolean;
  className?: string;
};

/**
 * Full FIFA-proportion soccer pitch (105×68 scaled ×10).
 * Horizontal: length left–right. Vertical: length top–bottom.
 */
export default function SoccerFieldSvg({
  orientation,
  asGroup = false,
  className,
}: SoccerFieldSvgProps) {
  const horizontal = orientation === "horizontal";
  const vb = horizontal ? H_VIEW : V_VIEW;
  const L = 1050;
  const W = 680;

  const rect = (lx: number, wy: number, lw: number, wh: number) => {
    if (horizontal) {
      return { x: lx, y: wy, width: lw, height: wh };
    }
    return { x: wy, y: lx, width: wh, height: lw };
  };

  const stroke = "rgba(255,255,255,0.55)";
  const strokeThin = "rgba(255,255,255,0.4)";
  const lineProps = {
    fill: "none" as const,
    stroke,
    strokeWidth: 2.5,
  };

  const outer = rect(0, 0, L, W);
  const halfLine = horizontal
    ? { x1: L / 2, y1: 0, x2: L / 2, y2: W }
    : { x1: 0, y1: L / 2, x2: W, y2: L / 2 };
  const center = horizontal
    ? { cx: L / 2, cy: W / 2, r: 91.5 }
    : { cx: W / 2, cy: L / 2, r: 91.5 };
  const centerSpot = horizontal
    ? { cx: L / 2, cy: W / 2, r: 4 }
    : { cx: W / 2, cy: L / 2, r: 4 };

  const penW = 403.2;
  const penD = 165;
  const penY = (W - penW) / 2;
  const leftPen = rect(0, penY, penD, penW);
  const rightPen = rect(L - penD, penY, penD, penW);

  const goalAreaW = 183.2;
  const goalAreaD = 55;
  const goalY = (W - goalAreaW) / 2;
  const leftGoalArea = rect(0, goalY, goalAreaD, goalAreaW);
  const rightGoalArea = rect(L - goalAreaD, goalY, goalAreaD, goalAreaW);

  const goalMouth = 73.2;
  const goalDepth = 20;
  const goalY0 = (W - goalMouth) / 2;
  const leftGoal = rect(-goalDepth, goalY0, goalDepth, goalMouth);
  const rightGoal = rect(L, goalY0, goalDepth, goalMouth);

  const leftSpot = horizontal
    ? { cx: 110, cy: W / 2, r: 3.5 }
    : { cx: W / 2, cy: 110, r: 3.5 };
  const rightSpot = horizontal
    ? { cx: L - 110, cy: W / 2, r: 3.5 }
    : { cx: W / 2, cy: L - 110, r: 3.5 };

  const cornerR = 10;
  const stripeW = horizontal ? 70 : 45;
  const stripeH = horizontal ? 45 : 70;
  const gradId = `tactics-pitch-grad-${orientation}`;
  const stripeId = `tactics-pitch-stripes-${orientation}`;

  const content = (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1f8f45" />
          <stop offset="50%" stopColor="#177a38" />
          <stop offset="100%" stopColor="#146b31" />
        </linearGradient>
        <pattern
          id={stripeId}
          patternUnits="userSpaceOnUse"
          width={stripeW}
          height={stripeH}
        >
          <rect
            width={horizontal ? 35 : 45}
            height={horizontal ? 45 : 35}
            fill="rgba(255,255,255,0.03)"
          />
        </pattern>
      </defs>
      <rect
        x={0}
        y={0}
        width={vb.w}
        height={vb.h}
        fill={`url(#${gradId})`}
        rx={12}
      />
      <rect
        x={0}
        y={0}
        width={vb.w}
        height={vb.h}
        fill={`url(#${stripeId})`}
        rx={12}
      />
      <rect {...outer} {...lineProps} rx={2} />
      <line {...halfLine} {...lineProps} />
      <circle {...center} {...lineProps} />
      <circle {...centerSpot} fill={stroke} stroke="none" />
      <rect {...leftPen} {...lineProps} />
      <rect {...rightPen} {...lineProps} />
      <rect {...leftGoalArea} stroke={strokeThin} strokeWidth={2} fill="none" />
      <rect {...rightGoalArea} stroke={strokeThin} strokeWidth={2} fill="none" />
      <rect
        {...leftGoal}
        fill="rgba(0,0,0,0.25)"
        stroke={stroke}
        strokeWidth={2}
      />
      <rect
        {...rightGoal}
        fill="rgba(0,0,0,0.25)"
        stroke={stroke}
        strokeWidth={2}
      />
      <circle {...leftSpot} fill={stroke} stroke="none" />
      <circle {...rightSpot} fill={stroke} stroke="none" />
      {horizontal ? (
        <>
          <path
            d={`M 0 ${cornerR} A ${cornerR} ${cornerR} 0 0 0 ${cornerR} 0`}
            {...lineProps}
          />
          <path
            d={`M ${L - cornerR} 0 A ${cornerR} ${cornerR} 0 0 0 ${L} ${cornerR}`}
            {...lineProps}
          />
          <path
            d={`M ${L} ${W - cornerR} A ${cornerR} ${cornerR} 0 0 0 ${L - cornerR} ${W}`}
            {...lineProps}
          />
          <path
            d={`M ${cornerR} ${W} A ${cornerR} ${cornerR} 0 0 0 0 ${W - cornerR}`}
            {...lineProps}
          />
          <path
            d={`M ${penD} ${W / 2 - 73} A 91.5 91.5 0 0 1 ${penD} ${W / 2 + 73}`}
            stroke={strokeThin}
            strokeWidth={2}
            fill="none"
          />
          <path
            d={`M ${L - penD} ${W / 2 - 73} A 91.5 91.5 0 0 0 ${L - penD} ${W / 2 + 73}`}
            stroke={strokeThin}
            strokeWidth={2}
            fill="none"
          />
        </>
      ) : (
        <>
          <path
            d={`M ${cornerR} 0 A ${cornerR} ${cornerR} 0 0 1 0 ${cornerR}`}
            {...lineProps}
          />
          <path
            d={`M ${W - cornerR} 0 A ${cornerR} ${cornerR} 0 0 0 ${W} ${cornerR}`}
            {...lineProps}
          />
          <path
            d={`M ${W} ${L - cornerR} A ${cornerR} ${cornerR} 0 0 1 ${W - cornerR} ${L}`}
            {...lineProps}
          />
          <path
            d={`M 0 ${L - cornerR} A ${cornerR} ${cornerR} 0 0 1 ${cornerR} ${L}`}
            {...lineProps}
          />
          <path
            d={`M ${W / 2 - 73} ${penD} A 91.5 91.5 0 0 0 ${W / 2 + 73} ${penD}`}
            stroke={strokeThin}
            strokeWidth={2}
            fill="none"
          />
          <path
            d={`M ${W / 2 - 73} ${L - penD} A 91.5 91.5 0 0 1 ${W / 2 + 73} ${L - penD}`}
            stroke={strokeThin}
            strokeWidth={2}
            fill="none"
          />
        </>
      )}
    </>
  );

  if (asGroup) {
    return (
      <g className={className} pointerEvents="none" aria-hidden>
        {content}
      </g>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${vb.w} ${vb.h}`}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {content}
    </svg>
  );
}
