/** One camera / feed; offsets are playback-time deltas vs the session active angle (archive model). */
export type VideoAngle = {
  id: string;
  name: string;
  videoId: string;
  /** Seconds added to the active angle's YouTube time to get this angle's target time. */
  offsetFromGameTime?: number;
  /**
   * Legacy YouTube stream metadata (ignored for sync; manual sync may still record).
   * ISO timestamp, e.g. "2026-04-26T01:23:45Z".
   */
  actualStartTime?: string;
  autoOffsetSource?: "youtube_start_time" | "manual" | "unknown";
};

/**
 * Archive sync: active angle is at `activePlaybackTime` on YouTube; return this angle's
 * aligned playback time (may be negative before that stream exists).
 */
export function playbackTimeForAngleFromActiveAnchor(
  activePlaybackTime: number,
  targetAngle: VideoAngle,
): number {
  const o = targetAngle.offsetFromGameTime ?? 0;
  return activePlaybackTime + o;
}

/** Earliest active-angle playback time where the secondary stream is at >= 0 (two-angle room). */
export function sharedMultiAngleArchivePlaybackFloor(
  _active: VideoAngle,
  secondary: VideoAngle,
): number {
  // Secondary is seeked to `activeTime + secondaryOffset`. We need:
  // activeTime + secondaryOffset >= 0  →  activeTime >= -secondaryOffset
  const o = secondary.offsetFromGameTime ?? 0;
  return o < 0 ? -o : 0;
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
