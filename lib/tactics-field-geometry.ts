/**
 * Pure helpers for tactics board canvas geometry (normalized 0–1 field space).
 *
 * Home attacks left → right (horizontal) / top → bottom (vertical).
 * Defensive = own half; offensive = attacking half.
 */

export const FIELD_LENGTH = 105;
export const FIELD_WIDTH = 68;

export type TacticsFieldView = "full" | "offensive" | "defensive";

/** Horizontal viewBox: length × width. */
export const H_VIEW = { w: 1050, h: 680 } as const;
/** Vertical viewBox: width × length. */
export const V_VIEW = { w: 680, h: 1050 } as const;

export function viewBoxForOrientation(
  orientation: "horizontal" | "vertical",
): { w: number; h: number } {
  return orientation === "vertical" ? V_VIEW : H_VIEW;
}

/**
 * Visible SVG crop for the chosen field view.
 * Crops along pitch length (home own goal → far goal).
 */
export function viewBoxRect(
  orientation: "horizontal" | "vertical",
  fieldView: TacticsFieldView = "full",
): { x: number; y: number; w: number; h: number } {
  const full = viewBoxForOrientation(orientation);
  if (fieldView === "full") {
    return { x: 0, y: 0, w: full.w, h: full.h };
  }
  if (orientation === "horizontal") {
    const half = full.w / 2;
    return fieldView === "defensive"
      ? { x: 0, y: 0, w: half, h: full.h }
      : { x: half, y: 0, w: half, h: full.h };
  }
  const half = full.h / 2;
  return fieldView === "defensive"
    ? { x: 0, y: 0, w: full.w, h: half }
    : { x: 0, y: half, w: full.w, h: half };
}

export function viewBoxAttr(
  orientation: "horizontal" | "vertical",
  fieldView: TacticsFieldView = "full",
): string {
  const r = viewBoxRect(orientation, fieldView);
  return `${r.x} ${r.y} ${r.w} ${r.h}`;
}

/** CSS aspect-ratio string for the visible crop. */
export function aspectRatioForView(
  orientation: "horizontal" | "vertical",
  fieldView: TacticsFieldView = "full",
): string {
  const r = viewBoxRect(orientation, fieldView);
  return `${r.w} / ${r.h}`;
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

/** Clamp to the visible half when fieldView is offensive/defensive. */
export function clampNormToFieldView(
  x: number,
  y: number,
  orientation: "horizontal" | "vertical",
  fieldView: TacticsFieldView = "full",
): { x: number; y: number } {
  const c = clampNorm(x, y);
  if (fieldView === "full") return c;
  if (orientation === "horizontal") {
    // Length is X: defensive left [0,0.5], offensive right [0.5,1]
    if (fieldView === "defensive") {
      return { x: Math.min(0.5, c.x), y: c.y };
    }
    return { x: Math.max(0.5, c.x), y: c.y };
  }
  // Vertical drawing: length is Y
  if (fieldView === "defensive") {
    return { x: c.x, y: Math.min(0.5, c.y) };
  }
  return { x: c.x, y: Math.max(0.5, c.y) };
}

/** Player token radius in SVG units (scales up slightly on half-field views). */
export function playerRadius(
  orientation: "horizontal" | "vertical",
  fieldView: TacticsFieldView = "full",
): number {
  const visible = viewBoxRect(orientation, fieldView);
  return Math.min(visible.w, visible.h) * 0.028;
}

export function ballRadius(
  orientation: "horizontal" | "vertical",
  fieldView: TacticsFieldView = "full",
): number {
  const visible = viewBoxRect(orientation, fieldView);
  return Math.min(visible.w, visible.h) * 0.012;
}
