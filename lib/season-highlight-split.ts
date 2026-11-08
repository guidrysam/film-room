/**
 * Game Cap / MOGO-style highlight VODs are usually a sequence of plays,
 * each already cut as: real-time action → baked slow-mo of the same play.
 *
 * We auto-mark every play (and both halves) at 1× playback — do NOT use
 * Instant Replay 0.5×; the slomo is already in the pixels.
 *
 * Cycle length is a heuristic until we have cut detection / AI. Tune via
 * SEASON_PLAY_CYCLE_SEC if your exports are consistently shorter/longer.
 */

/** Typical length of one live + slow-mo play pair in a highlight export. */
export const SEASON_PLAY_CYCLE_SEC = 30;

/** Fraction of each play treated as live before baked slomo. */
export const SEASON_HIGHLIGHT_LIVE_RATIO = 0.5;

/** Minimum live / slomo window so tiny segments stay usable. */
export const SEASON_HIGHLIGHT_MIN_SEGMENT_SEC = 2;

export type SeasonHighlightSegmentKind = "live" | "slomo";

/** Which auto-marked halves to keep in the season reel. */
export type SeasonSegmentFilter = "all" | "live" | "slomo";

export type SeasonHighlightSegment = {
  kind: SeasonHighlightSegmentKind;
  /** Source-local start (seconds). */
  startSec: number;
  /** Source-local end (seconds). */
  endSec: number;
  label: "Live" | "Slow-mo";
  /** 1-based play index within the VOD. */
  playIndex: number;
};

export function filterSeasonHighlightSegments(
  segments: SeasonHighlightSegment[],
  filter: SeasonSegmentFilter = "all",
): SeasonHighlightSegment[] {
  if (filter === "all") return segments;
  return segments.filter((s) => s.kind === filter);
}

export type SeasonHighlightPlay = {
  playIndex: number;
  startSec: number;
  endSec: number;
  segments: SeasonHighlightSegment[];
};

/**
 * Split one play window [playStart, playEnd) into live + baked slow-mo.
 */
export function seasonHighlightSegmentsForPlayWindow(
  playStartSec: number,
  playEndSec: number,
  playIndex: number,
  opts?: { liveRatio?: number },
): SeasonHighlightSegment[] {
  const start = Math.max(0, playStartSec);
  const end = Math.max(start, playEndSec);
  const duration = end - start;
  if (duration <= 0) {
    return [
      {
        kind: "live",
        startSec: start,
        endSec: start,
        label: "Live",
        playIndex,
      },
    ];
  }

  const ratio = Math.min(
    0.85,
    Math.max(0.15, opts?.liveRatio ?? SEASON_HIGHLIGHT_LIVE_RATIO),
  );
  const minSeg = SEASON_HIGHLIGHT_MIN_SEGMENT_SEC;

  if (duration < minSeg * 2) {
    return [
      {
        kind: "live",
        startSec: start,
        endSec: end,
        label: "Live",
        playIndex,
      },
    ];
  }

  let split = start + duration * ratio;
  split = Math.min(end - minSeg, Math.max(start + minSeg, split));

  return [
    {
      kind: "live",
      startSec: start,
      endSec: split,
      label: "Live",
      playIndex,
    },
    {
      kind: "slomo",
      startSec: split,
      endSec: end,
      label: "Slow-mo",
      playIndex,
    },
  ];
}

/**
 * Break a full highlight VOD into plays, then live + slow-mo within each.
 * Short clips (< ~1.5 cycles) stay a single play.
 */
export function seasonPlaysForDuration(
  durationSec: number,
  opts?: { cycleSec?: number; liveRatio?: number },
): SeasonHighlightPlay[] {
  const duration = Math.max(0, durationSec);
  if (duration <= 0) {
    return [
      {
        playIndex: 1,
        startSec: 0,
        endSec: 0,
        segments: seasonHighlightSegmentsForPlayWindow(0, 0, 1, opts),
      },
    ];
  }

  const cycle = Math.max(
    SEASON_HIGHLIGHT_MIN_SEGMENT_SEC * 2,
    opts?.cycleSec ?? SEASON_PLAY_CYCLE_SEC,
  );

  // One play if the whole file is shorter than ~1.5 cycles.
  if (duration <= cycle * 1.5) {
    return [
      {
        playIndex: 1,
        startSec: 0,
        endSec: duration,
        segments: seasonHighlightSegmentsForPlayWindow(0, duration, 1, opts),
      },
    ];
  }

  const playCount = Math.max(1, Math.round(duration / cycle));
  const plays: SeasonHighlightPlay[] = [];
  for (let i = 0; i < playCount; i++) {
    const playIndex = i + 1;
    const startSec = (duration * i) / playCount;
    const endSec = (duration * (i + 1)) / playCount;
    plays.push({
      playIndex,
      startSec,
      endSec,
      segments: seasonHighlightSegmentsForPlayWindow(
        startSec,
        endSec,
        playIndex,
        opts,
      ),
    });
  }
  return plays;
}

/** Flat list of live/slomo segments across all plays (source-local times). */
export function seasonHighlightSegmentsForDuration(
  durationSec: number,
  opts?: { cycleSec?: number; liveRatio?: number },
): SeasonHighlightSegment[] {
  return seasonPlaysForDuration(durationSec, opts).flatMap((p) => p.segments);
}

export function seasonSegmentMarkLabel(
  clipLabel: string,
  segment: SeasonHighlightSegment,
): string {
  const base = clipLabel.trim() || "Highlight";
  return `${base} · Play ${segment.playIndex} · ${segment.label}`;
}
