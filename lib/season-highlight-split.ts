/**
 * Game Cap / MOGO-style highlight VODs are usually already cut as:
 *   real-time action → baked slow-mo of the same play.
 *
 * We auto-mark both halves at 1× playback (do NOT use Instant Replay 0.5× —
 * the slomo is already in the pixels).
 */

/** Fraction of the VOD treated as live before the baked slomo starts. */
export const SEASON_HIGHLIGHT_LIVE_RATIO = 0.5;

/** Minimum live / slomo window so tiny clips still get two usable marks. */
export const SEASON_HIGHLIGHT_MIN_SEGMENT_SEC = 2;

export type SeasonHighlightSegmentKind = "live" | "slomo";

export type SeasonHighlightSegment = {
  kind: SeasonHighlightSegmentKind;
  /** Source-local start (seconds). */
  startSec: number;
  /** Source-local end (seconds). */
  endSec: number;
  label: "Live" | "Slow-mo";
};

/**
 * Split a highlight VOD into live + baked slow-mo windows.
 * Returns a single full-clip live segment when the file is too short to split.
 */
export function seasonHighlightSegmentsForDuration(
  durationSec: number,
  opts?: { liveRatio?: number },
): SeasonHighlightSegment[] {
  const duration = Math.max(0, durationSec);
  if (duration <= 0) {
    return [{ kind: "live", startSec: 0, endSec: 0, label: "Live" }];
  }

  const ratio = Math.min(
    0.85,
    Math.max(0.15, opts?.liveRatio ?? SEASON_HIGHLIGHT_LIVE_RATIO),
  );
  const minSeg = SEASON_HIGHLIGHT_MIN_SEGMENT_SEC;

  if (duration < minSeg * 2) {
    return [
      { kind: "live", startSec: 0, endSec: duration, label: "Live" },
    ];
  }

  let split = duration * ratio;
  split = Math.min(duration - minSeg, Math.max(minSeg, split));

  return [
    { kind: "live", startSec: 0, endSec: split, label: "Live" },
    {
      kind: "slomo",
      startSec: split,
      endSec: duration,
      label: "Slow-mo",
    },
  ];
}

export function seasonSegmentMarkLabel(
  clipLabel: string,
  segment: SeasonHighlightSegment,
): string {
  const base = clipLabel.trim() || "Highlight";
  return `${base} · ${segment.label}`;
}
