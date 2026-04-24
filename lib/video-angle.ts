/** One camera / feed for the same game clock (shared markers use `gameTime`). */
export type VideoAngle = {
  id: string;
  name: string;
  videoId: string;
  offsetFromGameTime?: number;
};

export function angleTimeFromGameTime(
  gameTime: number,
  angle: VideoAngle,
): number {
  const offset = angle.offsetFromGameTime ?? 0;
  return Math.max(0, gameTime + offset);
}

export function gameTimeFromAngleTime(
  angleTime: number,
  angle: VideoAngle,
): number {
  const offset = angle.offsetFromGameTime ?? 0;
  return angleTime - offset;
}

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;

function isValidAngleRow(o: Record<string, unknown>): o is {
  id: string;
  name: string;
  videoId: string;
  offsetFromGameTime?: number;
} {
  if (typeof o.id !== "string" || o.id.trim() === "") return false;
  if (typeof o.name !== "string" || o.name.trim() === "") return false;
  if (typeof o.videoId !== "string" || !YT_ID.test(o.videoId)) return false;
  if (o.offsetFromGameTime !== undefined) {
    if (typeof o.offsetFromGameTime !== "number" || !Number.isFinite(o.offsetFromGameTime)) {
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
