import type {
  DirectorTrackEvent,
  DirectorTrackEventType,
} from "@/lib/games";

/**
 * Phase 3A: Director Track / User Cut helpers.
 *
 * A Director Track is an ordered list of timestamped *viewing* instructions
 * (layout / camera / player-view changes + notes) along the canonical game
 * time axis. It is data, not rendered video. These helpers build, dedupe, and
 * query that list. The event shape is the `DirectorTrackEvent` from
 * `lib/games.ts`, so tracks round-trip through `createDirectorTrack`.
 *
 * Examples:
 *   { t: 0,    type: "layout",        layout: "multi" }
 *   { t: 12.4, type: "camera_switch", activeSource: "a1" }
 *   { t: 18.0, type: "layout",        layout: "single", activeSource: "a2" }
 *   { t: 22.0, type: "note",          note: "great rotation" }
 */

export type { DirectorTrackEvent, DirectorTrackEventType };

/** The view dimensions a track can drive. */
export type DirectorTrackState = {
  layout?: string;
  activeSource?: string;
  playerView?: string;
};

const KNOWN_TYPES: DirectorTrackEventType[] = [
  "layout",
  "camera_switch",
  "player_view",
  "note",
];

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/**
 * Infer an event type from its payload when one was not supplied (older cuts or
 * loosely-built events). Preference order matches how the recorder emits them.
 */
function inferType(raw: {
  type?: unknown;
  layout?: unknown;
  activeSource?: unknown;
  playerView?: unknown;
  note?: unknown;
}): DirectorTrackEventType | null {
  if (KNOWN_TYPES.includes(raw.type as DirectorTrackEventType)) {
    return raw.type as DirectorTrackEventType;
  }
  if (trimOrUndef(raw.note)) return "note";
  if (trimOrUndef(raw.layout)) return "layout";
  if (trimOrUndef(raw.activeSource)) return "camera_switch";
  if (trimOrUndef(raw.playerView)) return "player_view";
  return null;
}

/**
 * Coerce arbitrary input into a clean `DirectorTrackEvent` (non-negative `t`,
 * a resolved `type`, trimmed strings). Returns null when the event carries no
 * usable instruction.
 */
export function normalizeDirectorTrackEvent(
  raw: Partial<DirectorTrackEvent> & { t?: unknown },
): DirectorTrackEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const t =
    typeof raw.t === "number" && Number.isFinite(raw.t) ? Math.max(0, raw.t) : null;
  if (t === null) return null;
  const type = inferType(raw);
  if (!type) return null;

  const layout = trimOrUndef(raw.layout);
  const activeSource = trimOrUndef(raw.activeSource);
  const playerView = trimOrUndef(raw.playerView);
  const note = trimOrUndef(raw.note);

  // Require the payload relevant to the resolved type.
  if (type === "layout" && !layout && !activeSource) return null;
  if (type === "camera_switch" && !activeSource) return null;
  if (type === "player_view" && !playerView) return null;
  if (type === "note" && !note) return null;

  return {
    t,
    type,
    ...(layout ? { layout } : {}),
    ...(activeSource ? { activeSource } : {}),
    ...(playerView ? { playerView } : {}),
    ...(note ? { note } : {}),
  };
}

/** The value an event sets for its primary dimension (used for dedupe). */
function dimensionValue(ev: DirectorTrackEvent): {
  dim: keyof DirectorTrackState | "note";
  value: string | undefined;
} {
  switch (ev.type) {
    case "layout":
      return { dim: "layout", value: ev.layout };
    case "camera_switch":
      return { dim: "activeSource", value: ev.activeSource };
    case "player_view":
      return { dim: "playerView", value: ev.playerView };
    default:
      return { dim: "note", value: ev.note };
  }
}

/**
 * Resolve the view state implied by a track at game time `t` (the most recent
 * value of each dimension at or before `t`). Notes do not affect view state.
 */
export function resolveDirectorTrackState(
  events: DirectorTrackEvent[],
  t: number,
): DirectorTrackState {
  const state: DirectorTrackState = {};
  for (const ev of events) {
    if (ev.t > t) break; // events are kept sorted by t
    if (ev.layout) state.layout = ev.layout;
    if (ev.activeSource) state.activeSource = ev.activeSource;
    if (ev.playerView) state.playerView = ev.playerView;
  }
  return state;
}

/**
 * Append `incoming` to `events`, skipping it when it would not change the
 * resolved state for its dimension (no duplicate consecutive identical
 * instructions). Notes are always appended. Returns a new, time-sorted array;
 * the input is not mutated.
 */
export function addDirectorTrackEvent(
  events: DirectorTrackEvent[],
  incoming: Partial<DirectorTrackEvent> & { t?: unknown },
): DirectorTrackEvent[] {
  const ev = normalizeDirectorTrackEvent(incoming);
  if (!ev) return events;

  const { dim, value } = dimensionValue(ev);
  if (dim !== "note") {
    const current = resolveDirectorTrackState(events, Number.POSITIVE_INFINITY)[
      dim
    ];
    if (current === value) return events; // no-op change
  }

  const next = [...events, ev];
  next.sort((a, b) => a.t - b.t);
  return next;
}

/**
 * Collapse redundant events: sort by time, then drop any event that does not
 * change the resolved view state vs. the events before it. Notes are always
 * kept. The result is the minimal track that reproduces the same playback.
 */
export function compactDirectorTrackEvents(
  events: DirectorTrackEvent[],
): DirectorTrackEvent[] {
  const normalized = events
    .map((e) => normalizeDirectorTrackEvent(e))
    .filter((e): e is DirectorTrackEvent => e !== null)
    .sort((a, b) => a.t - b.t);

  const out: DirectorTrackEvent[] = [];
  const state: DirectorTrackState = {};
  for (const ev of normalized) {
    if (ev.type === "note") {
      out.push(ev);
      continue;
    }
    const { dim, value } = dimensionValue(ev);
    if (dim === "note") continue;
    if (state[dim] === value) continue; // redundant
    state[dim] = value;
    out.push(ev);
  }
  return out;
}

/** The most recent event at or before `t`, or null when none applies. */
export function getTrackEventAtTime(
  events: DirectorTrackEvent[],
  t: number,
): DirectorTrackEvent | null {
  let hit: DirectorTrackEvent | null = null;
  for (const ev of events) {
    if (ev.t > t) break;
    hit = ev;
  }
  return hit;
}

/** Summary metadata computed from a track (for cut cards / discovery). */
export type DirectorTrackSummary = {
  /** Total number of timeline events in the track. */
  eventCount: number;
  /** Span from the first to the last event, in seconds. */
  durationSec: number;
  /** Game time of the first event, or 0 when empty. */
  firstT: number;
  /** Game time of the last event, or 0 when empty. */
  lastT: number;
};

/** Compute display summary metadata from a track's events. */
export function directorTrackSummary(
  events: DirectorTrackEvent[],
): DirectorTrackSummary {
  if (!Array.isArray(events) || events.length === 0) {
    return { eventCount: 0, durationSec: 0, firstT: 0, lastT: 0 };
  }
  let firstT = Number.POSITIVE_INFINITY;
  let lastT = 0;
  for (const ev of events) {
    if (typeof ev.t !== "number" || !Number.isFinite(ev.t)) continue;
    if (ev.t < firstT) firstT = ev.t;
    if (ev.t > lastT) lastT = ev.t;
  }
  if (!Number.isFinite(firstT)) firstT = 0;
  return {
    eventCount: events.length,
    durationSec: Math.max(0, lastT - firstT),
    firstT,
    lastT,
  };
}

/** Events strictly after `t`, in time order (optionally limited to `limit`). */
export function getUpcomingTrackEvents(
  events: DirectorTrackEvent[],
  t: number,
  limit?: number,
): DirectorTrackEvent[] {
  const upcoming = events.filter((ev) => ev.t > t);
  return typeof limit === "number" && limit >= 0
    ? upcoming.slice(0, limit)
    : upcoming;
}
