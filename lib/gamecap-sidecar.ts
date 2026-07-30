import type { GameTimelineEventInput } from "@/lib/games";

/** Game Cap sidecar event (RecordingMetadata.SidecarEvent). */
export type GameCapSidecarEvent = {
  id?: string;
  type: string;
  createdAtUTC?: string;
  recordingId?: string;
  recordingElapsedSeconds?: number;
};

export type GameCapSidecar = {
  recordingId?: string;
  recordingStartUTC?: string;
  recordingStartUnixSeconds?: number;
  cameraName?: string;
  quality?: string;
  movieFilename?: string;
  events?: GameCapSidecarEvent[];
};

const EVENT_LABELS: Record<string, string> = {
  goal: "Goal",
  ownGoal: "Own goal",
  shot: "Shot",
  save: "Save",
  corner: "Corner",
  foul: "Foul",
  card: "Card",
  kickoff: "Kickoff",
  half: "Half",
  highlight: "Highlight",
  madeBasket: "Made basket",
  missedBasket: "Missed basket",
  threePointer: "Three pointer",
  freeThrow: "Free throw",
  rebound: "Rebound",
  assist: "Assist",
  steal: "Steal",
  block: "Block",
  turnover: "Turnover",
  tipoff: "Tipoff",
};

export function labelForGameCapEventType(type: string): string {
  const key = type.trim();
  if (EVENT_LABELS[key]) return EVENT_LABELS[key];
  if (!key) return "Mark";
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseGameCapSidecar(raw: unknown): GameCapSidecar {
  if (!raw || typeof raw !== "object") {
    throw new Error("Sidecar must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  const eventsRaw = Array.isArray(obj.events) ? obj.events : [];
  const events: GameCapSidecarEvent[] = [];
  for (const row of eventsRaw) {
    if (!row || typeof row !== "object") continue;
    const e = row as Record<string, unknown>;
    const type = typeof e.type === "string" ? e.type.trim() : "";
    if (!type) continue;
    events.push({
      type,
      ...(typeof e.id === "string" ? { id: e.id } : {}),
      ...(typeof e.createdAtUTC === "string"
        ? { createdAtUTC: e.createdAtUTC }
        : {}),
      ...(typeof e.recordingId === "string"
        ? { recordingId: e.recordingId }
        : {}),
      ...(typeof e.recordingElapsedSeconds === "number" &&
      Number.isFinite(e.recordingElapsedSeconds)
        ? { recordingElapsedSeconds: e.recordingElapsedSeconds }
        : {}),
    });
  }
  return {
    ...(typeof obj.recordingId === "string"
      ? { recordingId: obj.recordingId }
      : {}),
    ...(typeof obj.recordingStartUTC === "string"
      ? { recordingStartUTC: obj.recordingStartUTC }
      : {}),
    ...(typeof obj.recordingStartUnixSeconds === "number"
      ? { recordingStartUnixSeconds: obj.recordingStartUnixSeconds }
      : {}),
    ...(typeof obj.cameraName === "string" ? { cameraName: obj.cameraName } : {}),
    ...(typeof obj.quality === "string" ? { quality: obj.quality } : {}),
    ...(typeof obj.movieFilename === "string"
      ? { movieFilename: obj.movieFilename }
      : {}),
    events,
  };
}

/**
 * Convert sidecar events to coach_mark timeline inputs.
 * `mainOffsetFromGameTime`: seconds added to game time to reach Main source time
 * (sourceTime = gameTime + offset → gameTime = elapsed - offset).
 */
export function sidecarEventsToTimelineInputs(
  sidecar: GameCapSidecar,
  opts: {
    mainOffsetFromGameTime?: number;
    sourceId?: string;
    createdBy?: string;
    createdByName?: string;
  } = {},
): GameTimelineEventInput[] {
  const offset =
    typeof opts.mainOffsetFromGameTime === "number" &&
    Number.isFinite(opts.mainOffsetFromGameTime)
      ? opts.mainOffsetFromGameTime
      : 0;
  const events = sidecar.events ?? [];
  const out: GameTimelineEventInput[] = [];
  for (const e of events) {
    if (
      typeof e.recordingElapsedSeconds !== "number" ||
      !Number.isFinite(e.recordingElapsedSeconds)
    ) {
      continue;
    }
    const t = Math.max(0, e.recordingElapsedSeconds - offset);
    out.push({
      type: "coach_mark",
      t: Math.round(t * 10) / 10,
      label: labelForGameCapEventType(e.type),
      ...(opts.sourceId ? { sourceId: opts.sourceId } : {}),
      ...(opts.createdBy ? { createdBy: opts.createdBy } : {}),
      ...(opts.createdByName ? { createdByName: opts.createdByName } : {}),
      payload: {
        gameCapType: e.type,
        recordingElapsedSeconds: e.recordingElapsedSeconds,
        ...(e.id ? { gameCapEventId: e.id } : {}),
        ...(sidecar.recordingId ? { recordingId: sidecar.recordingId } : {}),
        importedFrom: "gamecap_sidecar",
      },
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
