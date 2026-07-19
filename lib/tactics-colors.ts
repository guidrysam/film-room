/**
 * Drawing colors may be opaque (#rrggbb) or already include alpha (#rrggbbaa).
 * Zone fills historically appended "33"; that breaks when alpha is already present
 * and can render as an opaque black rectangle in SVG.
 */

const HEX6 = /^#([0-9a-fA-F]{6})$/;
const HEX8 = /^#([0-9a-fA-F]{8})$/;
const HEX3 = /^#([0-9a-fA-F]{3})$/;

function expandHex3(hex: string): string {
  const [r, g, b] = hex.slice(1);
  return `#${r}${r}${g}${g}${b}${b}`;
}

/** Soft fill for zone rectangles. Preserves existing alpha when present. */
export function zoneFillColor(color: string, alphaHex = "33"): string {
  const trimmed = color.trim();
  if (!trimmed) return `#94a3b8${alphaHex}`;
  if (HEX8.test(trimmed)) return trimmed;
  if (HEX6.test(trimmed)) return `${trimmed}${alphaHex}`;
  if (HEX3.test(trimmed)) return `${expandHex3(trimmed)}${alphaHex}`;
  return trimmed;
}

/** Opaque stroke for zone borders when the source color includes alpha. */
export function zoneStrokeColor(color: string): string {
  const trimmed = color.trim();
  if (!trimmed) return "#94a3b8";
  if (HEX8.test(trimmed)) return trimmed.slice(0, 7);
  if (HEX3.test(trimmed)) return expandHex3(trimmed);
  return trimmed;
}
