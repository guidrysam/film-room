/**
 * Pure helpers for tactics board canvas geometry (normalized 0–1 field space).
 */

export const FIELD_LENGTH = 105;
export const FIELD_WIDTH = 68;

/** Horizontal viewBox: length × width. */
export const H_VIEW = { w: 1050, h: 680 } as const;
/** Vertical viewBox: width × length. */
export const V_VIEW = { w: 680, h: 1050 } as const;

export function viewBoxForOrientation(
  orientation: "horizontal" | "vertical",
): { w: number; h: number } {
  return orientation === "vertical" ? V_VIEW : H_VIEW;
}

/** Map normalized (0–1) field coords to SVG pixels. */
export function normToSvg(
  x: number,
  y: number,
  orientation: "horizontal" | "vertical",
): { x: number; y: number } {
  const vb = viewBoxForOrientation(orientation);
  return { x: x * vb.w, y: y * vb.h };
}

export function svgToNorm(
  sx: number,
  sy: number,
  orientation: "horizontal" | "vertical",
): { x: number; y: number } {
  const vb = viewBoxForOrientation(orientation);
  return {
    x: Math.min(1, Math.max(0, sx / vb.w)),
    y: Math.min(1, Math.max(0, sy / vb.h)),
  };
}

export function clampNorm(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

/** Player token radius in SVG units (relative to horizontal viewBox height). */
export function playerRadius(orientation: "horizontal" | "vertical"): number {
  const vb = viewBoxForOrientation(orientation);
  return Math.min(vb.w, vb.h) * 0.028;
}

export function ballRadius(orientation: "horizontal" | "vertical"): number {
  const vb = viewBoxForOrientation(orientation);
  return Math.min(vb.w, vb.h) * 0.012;
}
