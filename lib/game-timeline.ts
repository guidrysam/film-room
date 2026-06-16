import type { Game, GameVideoSource } from "@/lib/games";

export type GameSourceSyncStatus = NonNullable<GameVideoSource["syncStatus"]>;
export type GameSourceSyncConfidence = NonNullable<
  GameVideoSource["syncConfidence"]
>;

/** Normalized offset (seconds added to game time → source playback time). */
export function sourceOffsetSec(
  source: Pick<GameVideoSource, "offsetFromGameTime">,
): number {
  const o = source.offsetFromGameTime;
  return typeof o === "number" && Number.isFinite(o) ? o : 0;
}

/**
 * Canonical game time (seconds) → source playback time (seconds).
 * `sourceTime = gameTime + offsetFromGameTime`
 */
export function gameTimeToSourceTime(
  gameTime: number,
  source: Pick<GameVideoSource, "offsetFromGameTime">,
): number {
  return gameTime + sourceOffsetSec(source);
}

/**
 * Source playback time (seconds) → canonical game time (seconds).
 * `gameTime = sourceTime - offsetFromGameTime`
 */
export function sourceTimeToGameTime(
  sourceTime: number,
  source: Pick<GameVideoSource, "offsetFromGameTime">,
): number {
  return sourceTime - sourceOffsetSec(source);
}

/** Parse an ISO / datetime-local string to epoch ms, or null. */
export function parseGameClockMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

export type ClockSyncEstimate = {
  offsetFromGameTime: number;
  syncStatus: "clock_synced";
  syncConfidence: "low" | "medium";
};

function clockStringHasExplicitTime(s: string): boolean {
  return /T\d{1,2}:\d{2}/.test(s);
}

function clockStringHasTimezone(s: string): boolean {
  return /Z$|[+-]\d{2}:\d{2}$/.test(s.trim());
}

/**
 * Estimate offset from `game.scheduledStartAt` (kickoff) and `source.recordedStartTime`
 * (when this camera started recording).
 *
 * At game time 0 (kickoff), source playback ≈ (scheduledStart − recordedStart) in seconds.
 */
export function estimateClockSync(
  game: Pick<Game, "scheduledStartAt">,
  source: Pick<GameVideoSource, "recordedStartTime">,
): ClockSyncEstimate | null {
  const scheduled = game.scheduledStartAt?.trim();
  const recorded = source.recordedStartTime?.trim();
  if (!scheduled || !recorded) return null;

  const scheduledMs = parseGameClockMs(scheduled);
  const recordedMs = parseGameClockMs(recorded);
  if (scheduledMs == null || recordedMs == null) return null;

  const offsetFromGameTime = (scheduledMs - recordedMs) / 1000;
  if (!Number.isFinite(offsetFromGameTime)) return null;

  const syncConfidence: "low" | "medium" =
    clockStringHasExplicitTime(scheduled) &&
    clockStringHasExplicitTime(recorded) &&
    (clockStringHasTimezone(scheduled) || clockStringHasTimezone(recorded))
      ? "medium"
      : "low";

  return {
    offsetFromGameTime,
    syncStatus: "clock_synced",
    syncConfidence,
  };
}

export function syncStatusLabel(
  status?: GameVideoSource["syncStatus"],
): string {
  switch (status) {
    case "clock_synced":
      return "Clock Synced";
    case "manually_synced":
      return "Manual Sync";
    case "audio_synced":
      return "Audio Sync";
    default:
      return "Unsynced";
  }
}

export function syncStatusBadgeClass(
  status?: GameVideoSource["syncStatus"],
): string {
  switch (status) {
    case "clock_synced":
      return "border-sky-500/40 bg-sky-950/40 text-sky-200";
    case "manually_synced":
      return "border-violet-500/40 bg-violet-950/40 text-violet-200";
    case "audio_synced":
      return "border-emerald-500/40 bg-emerald-950/40 text-emerald-200";
    default:
      return "border-zinc-600/50 bg-zinc-800/50 text-zinc-400";
  }
}

export function formatTimelineSeconds(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  const sign = sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}

/** Convert ISO to `datetime-local` input value (local timezone). */
export function isoToDatetimeLocalValue(iso?: string): string {
  if (!iso?.trim()) return "";
  const ms = parseGameClockMs(iso);
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value → ISO string for storage. */
export function datetimeLocalValueToIso(local: string): string {
  const trimmed = local.trim();
  if (!trimmed) return "";
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return trimmed;
  return new Date(ms).toISOString();
}
