/**
 * Pure interpolation helpers for tactics board step playback.
 */

import type { TacticsBoardObject } from "@/lib/tactics-boards";

export type RenderableTacticsObject = TacticsBoardObject & {
  opacity: number;
  /** When true, this is a drawing crossfade layer from the "from" step. */
  fromLayer?: boolean;
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Smoothstep cubic ease (ease-in-out). */
export function easeInOutCubic(t: number): number {
  const p = clamp01(t);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function isVisible(o: TacticsBoardObject): boolean {
  return (o as { visible?: boolean }).visible !== false;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cloneObject(o: TacticsBoardObject): TacticsBoardObject {
  if (o.type === "player" || o.type === "ball") {
    return { ...o };
  }
  return {
    ...o,
    points: o.points.map((p) => ({ ...p })),
  };
}

function mapById(objects: TacticsBoardObject[]): Map<string, TacticsBoardObject> {
  const map = new Map<string, TacticsBoardObject>();
  for (const o of objects) {
    if (!isVisible(o)) continue;
    map.set(o.id, o);
  }
  return map;
}

/**
 * Interpolate between two step object arrays by stable object ID.
 * Never mutates inputs. Progress is clamped to [0, 1].
 */
export function interpolateStepObjects(
  fromObjects: TacticsBoardObject[],
  toObjects: TacticsBoardObject[],
  progress: number,
): RenderableTacticsObject[] {
  const t = clamp01(progress);
  const eased = easeInOutCubic(t);
  const fromMap = mapById(fromObjects ?? []);
  const toMap = mapById(toObjects ?? []);
  const ids = new Set<string>([...fromMap.keys(), ...toMap.keys()]);
  const out: RenderableTacticsObject[] = [];

  for (const id of ids) {
    const from = fromMap.get(id);
    const to = toMap.get(id);

    if (from && to) {
      if (
        (from.type === "player" && to.type === "player") ||
        (from.type === "ball" && to.type === "ball")
      ) {
        out.push({
          ...cloneObject(to),
          x: lerp(from.x, to.x, eased),
          y: lerp(from.y, to.y, eased),
          opacity: 1,
        } as RenderableTacticsObject);
        continue;
      }

      // Drawings (and type mismatches): crossfade layers
      out.push({
        ...cloneObject(from),
        opacity: 1 - eased,
        fromLayer: true,
      });
      out.push({
        ...cloneObject(to),
        opacity: eased,
      });
      continue;
    }

    if (to && !from) {
      out.push({
        ...cloneObject(to),
        opacity: eased,
      });
      continue;
    }

    if (from && !to) {
      out.push({
        ...cloneObject(from),
        opacity: 1 - eased,
        fromLayer: true,
      });
    }
  }

  return out;
}

export const PLAYBACK_SPEED_PRESETS = {
  slow: 1400,
  normal: 900,
  fast: 550,
} as const;

export type PlaybackSpeedPreset = keyof typeof PLAYBACK_SPEED_PRESETS;

export const DEFAULT_PLAYBACK_SETTINGS = {
  transitionDurationMs: PLAYBACK_SPEED_PRESETS.normal,
  holdDurationMs: 700,
  loop: false,
} as const;

export type PlaybackSettings = {
  transitionDurationMs: number;
  holdDurationMs: number;
  loop: boolean;
};

export type PlaybackStatus = "idle" | "playing" | "paused";

export type PlaybackState = {
  status: PlaybackStatus;
  fromStepIndex: number;
  toStepIndex: number | null;
  /** 0–1 within the current transition (or hold progress when holding). */
  progress: number;
  phase: "hold" | "transition";
  /** Epoch ms when the current phase started. */
  phaseStartedAt: number | null;
};

export function createIdlePlaybackState(stepIndex = 0): PlaybackState {
  return {
    status: "idle",
    fromStepIndex: Math.max(0, stepIndex),
    toStepIndex: null,
    progress: 0,
    phase: "hold",
    phaseStartedAt: null,
  };
}

export function startPlayback(
  stepIndex: number,
  nowMs: number,
): PlaybackState {
  return {
    status: "playing",
    fromStepIndex: Math.max(0, stepIndex),
    toStepIndex: null,
    progress: 0,
    phase: "hold",
    phaseStartedAt: nowMs,
  };
}

export function pausePlayback(state: PlaybackState): PlaybackState {
  if (state.status !== "playing") return state;
  return { ...state, status: "paused" };
}

export function resumePlayback(
  state: PlaybackState,
  nowMs: number,
): PlaybackState {
  if (state.status !== "paused") return state;
  return {
    ...state,
    status: "playing",
    phaseStartedAt: nowMs,
  };
}

/**
 * Tick playback while playing. When paused, returns the same state.
 * `progressCarry` is the progress frozen at pause time (0–1 of current phase).
 */
export function tickPlayback(
  state: PlaybackState,
  settings: PlaybackSettings,
  stepCount: number,
  nowMs: number,
  progressCarry = 0,
  opts?: { reducedMotion?: boolean },
): PlaybackState {
  if (state.status !== "playing" || stepCount <= 0) return state;

  const transitionMs = Math.max(
    1,
    opts?.reducedMotion
      ? Math.min(180, settings.transitionDurationMs)
      : settings.transitionDurationMs,
  );
  const holdMs = Math.max(0, settings.holdDurationMs);
  const phaseStart = state.phaseStartedAt ?? nowMs;
  const elapsed =
    Math.max(0, nowMs - phaseStart) + clamp01(progressCarry) *
      (state.phase === "transition" ? transitionMs : holdMs || 1);

  if (state.phase === "hold") {
    if (holdMs > 0 && elapsed < holdMs) {
      return {
        ...state,
        progress: clamp01(elapsed / holdMs),
        phaseStartedAt: phaseStart,
      };
    }
    const next = state.fromStepIndex + 1;
    if (next >= stepCount) {
      if (!settings.loop) {
        return createIdlePlaybackState(state.fromStepIndex);
      }
      return {
        status: "playing",
        fromStepIndex: state.fromStepIndex,
        toStepIndex: 0,
        progress: 0,
        phase: "transition",
        phaseStartedAt: nowMs,
      };
    }
    return {
      status: "playing",
      fromStepIndex: state.fromStepIndex,
      toStepIndex: next,
      progress: 0,
      phase: "transition",
      phaseStartedAt: nowMs,
    };
  }

  // transition
  const p = clamp01(elapsed / transitionMs);
  if (p < 1) {
    return {
      ...state,
      progress: p,
      phaseStartedAt: phaseStart,
    };
  }
  const arrived = state.toStepIndex ?? state.fromStepIndex;
  return {
    status: "playing",
    fromStepIndex: arrived,
    toStepIndex: null,
    progress: 0,
    phase: "hold",
    phaseStartedAt: nowMs,
  };
}

export function deepCloneObjects(
  objects: TacticsBoardObject[],
): TacticsBoardObject[] {
  return objects.map((o) => cloneObject(o));
}

export function parsePlaybackSettings(
  raw: unknown,
): PlaybackSettings {
  const o =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const transition =
    typeof o.transitionDurationMs === "number" &&
    Number.isFinite(o.transitionDurationMs)
      ? Math.max(100, Math.floor(o.transitionDurationMs))
      : DEFAULT_PLAYBACK_SETTINGS.transitionDurationMs;
  const hold =
    typeof o.holdDurationMs === "number" && Number.isFinite(o.holdDurationMs)
      ? Math.max(0, Math.floor(o.holdDurationMs))
      : DEFAULT_PLAYBACK_SETTINGS.holdDurationMs;
  return {
    transitionDurationMs: transition,
    holdDurationMs: hold,
    loop: o.loop === true,
  };
}
