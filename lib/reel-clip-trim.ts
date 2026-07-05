export const REEL_TRIM_MIN_CLIP_SEC = 1;
export const REEL_TRIM_CONTEXT_PAD_SEC = 12;

export type ClipTrimContext = {
  start: number;
  end: number;
};

/** Visible timeline span around the current clip handles. */
export function clipTrimContext(
  gameTime: number,
  startOffsetSec: number,
  endOffsetSec: number,
): ClipTrimContext {
  const clipStart = gameTime + startOffsetSec;
  const clipEnd = gameTime + endOffsetSec;
  const span = Math.max(REEL_TRIM_MIN_CLIP_SEC, clipEnd - clipStart);
  const pad = Math.max(REEL_TRIM_CONTEXT_PAD_SEC, span * 0.35);
  return {
    start: Math.max(0, clipStart - pad),
    end: clipEnd + pad,
  };
}

export function selectionRatios(
  gameTime: number,
  startOffsetSec: number,
  endOffsetSec: number,
  ctx: ClipTrimContext,
): { left: number; width: number } {
  const span = ctx.end - ctx.start;
  if (span <= 0) return { left: 0, width: 1 };
  const clipStart = gameTime + startOffsetSec;
  const clipEnd = gameTime + endOffsetSec;
  const left = (clipStart - ctx.start) / span;
  const width = (clipEnd - clipStart) / span;
  return {
    left: Math.max(0, Math.min(1, left)),
    width: Math.max(0.02, Math.min(1 - left, width)),
  };
}

export function gameTimeFromTrimRatio(ratio: number, ctx: ClipTrimContext): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  return ctx.start + clamped * (ctx.end - ctx.start);
}

export function applyTrimHandleDrag(
  gameTime: number,
  startOffsetSec: number,
  endOffsetSec: number,
  handle: "start" | "end",
  pointerGameTime: number,
): { startOffsetSec: number; endOffsetSec: number } {
  const round = (n: number) => Math.round(n * 10) / 10;
  if (handle === "start") {
    const nextStart = Math.min(
      pointerGameTime - gameTime,
      endOffsetSec - REEL_TRIM_MIN_CLIP_SEC,
    );
    return {
      startOffsetSec: round(nextStart),
      endOffsetSec,
    };
  }
  const nextEnd = Math.max(
    pointerGameTime - gameTime,
    startOffsetSec + REEL_TRIM_MIN_CLIP_SEC,
  );
  return {
    startOffsetSec,
    endOffsetSec: round(nextEnd),
  };
}

export function clipDurationSec(
  startOffsetSec: number,
  endOffsetSec: number,
): number {
  return Math.max(0, endOffsetSec - startOffsetSec);
}
