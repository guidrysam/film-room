/** Ken Burns push-in: scale 1.0 → 1.5 (50% zoom) over the clip duration. */
export const KEN_BURNS_ZOOM_END_SCALE = 1.5;

/** Linear zoom progress 0–1 → CSS scale for Ken Burns segments. */
export function computeKenBurnsScale(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return 1 + (KEN_BURNS_ZOOM_END_SCALE - 1) * t;
}
