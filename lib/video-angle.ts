/** One camera / feed for the same game clock (shared markers use `gameTime`). */
export type VideoAngle = {
  id: string;
  name: string;
  videoId: string;
  offsetFromGameTime?: number;
  /**
   * YouTube live stream metadata. If available for all angles, offsets can be derived automatically.
   * ISO timestamp, e.g. "2026-04-26T01:23:45Z".
   */
  actualStartTime?: string;
  autoOffsetSource?: "youtube_start_time" | "manual" | "unknown";
};

export function angleTimeFromGameTime(
  gameTime: number,
  angle: VideoAngle,
): number {
  return clampedAnglePlaybackTimeFromGameTime(gameTime, angle);
}

export function gameTimeFromAngleTime(
  angleTime: number,
  angle: VideoAngle,
): number {
  const offset = angle.offsetFromGameTime ?? 0;
  // If playback is held at 0 before the stream exists, treat all pre-start playback as mapping to
  // the boundary game moment right when the stream becomes available.
  if (angleTime <= 0 && offset < 0) {
    return -offset;
  }
  return angleTime - offset;
}

/** Seconds this angle's real-world start is after the master clock origin (>= 0). */
export function realClockStartOffsetSecFromAngleOffset(angle: VideoAngle): number {
  const off = angle.offsetFromGameTime ?? 0;
  return Math.max(0, -off);
}

/** Raw mapping before clamping to valid YouTube time (can be negative for not-yet-started angles). */
export function effectiveAngleTimeFromGameTime(
  gameTime: number,
  angle: VideoAngle,
): number {
  const offset = angle.offsetFromGameTime ?? 0;
  return gameTime + offset;
}

/** YouTube playback time for a given shared gameTime (held at 0 until the stream exists). */
export function clampedAnglePlaybackTimeFromGameTime(
  gameTime: number,
  angle: VideoAngle,
): number {
  return Math.max(0, effectiveAngleTimeFromGameTime(gameTime, angle));
}

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;

function isValidAngleRow(o: Record<string, unknown>): o is {
  id: string;
  name: string;
  videoId: string;
  offsetFromGameTime?: number;
  actualStartTime?: string;
  autoOffsetSource?: "youtube_start_time" | "manual" | "unknown";
} {
  if (typeof o.id !== "string" || o.id.trim() === "") return false;
  if (typeof o.name !== "string" || o.name.trim() === "") return false;
  if (typeof o.videoId !== "string" || !YT_ID.test(o.videoId)) return false;
  if (o.offsetFromGameTime !== undefined) {
    if (typeof o.offsetFromGameTime !== "number" || !Number.isFinite(o.offsetFromGameTime)) {
      return false;
    }
  }
  if (o.actualStartTime !== undefined && typeof o.actualStartTime !== "string") {
    return false;
  }
  if (o.autoOffsetSource !== undefined) {
    if (
      o.autoOffsetSource !== "youtube_start_time" &&
      o.autoOffsetSource !== "manual" &&
      o.autoOffsetSource !== "unknown"
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Parse RTDB / Firestore `angles` array; empty or invalid → one default angle.
 */
export function parseVideoAngles(
  raw: unknown,
  fallbackVideoId: string,
): VideoAngle[] {
  if (!YT_ID.test(fallbackVideoId)) {
    return [{ id: "a0", name: "Main", videoId: fallbackVideoId, offsetFromGameTime: 0 }];
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      {
        id: "a0",
        name: "Main",
        videoId: fallbackVideoId,
        offsetFromGameTime: 0,
      },
    ];
  }
  const out: VideoAngle[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (!isValidAngleRow(o)) continue;
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({
      id: o.id.trim(),
      name: o.name.trim(),
      videoId: o.videoId,
      ...(typeof o.offsetFromGameTime === "number" &&
      Number.isFinite(o.offsetFromGameTime)
        ? { offsetFromGameTime: o.offsetFromGameTime }
        : {}),
      ...(typeof o.actualStartTime === "string" && o.actualStartTime.trim() !== ""
        ? { actualStartTime: o.actualStartTime.trim() }
        : {}),
      ...(o.autoOffsetSource === "youtube_start_time" ||
      o.autoOffsetSource === "manual" ||
      o.autoOffsetSource === "unknown"
        ? { autoOffsetSource: o.autoOffsetSource }
        : {}),
    });
  }
  if (out.length === 0) {
    return [
      {
        id: "a0",
        name: "Main",
        videoId: fallbackVideoId,
        offsetFromGameTime: 0,
      },
    ];
  }
  return out;
}

export function pickAngle(angles: VideoAngle[], currentAngleId: string): VideoAngle {
  const hit = angles.find((a) => a.id === currentAngleId);
  return hit ?? angles[0]!;
}
