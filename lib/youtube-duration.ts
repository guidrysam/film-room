/**
 * Parse YouTube `contentDetails.duration` (ISO 8601) into whole seconds.
 * Examples: PT59S, PT1M30S, PT1H2M3S
 */
export function parseIso8601DurationToSeconds(iso: string): number | undefined {
  const trimmed = iso.trim();
  if (!trimmed.startsWith("PT")) return undefined;

  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(trimmed);
  if (!match) return undefined;

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseInt(match[3] ?? "0", 10);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds)
  ) {
    return undefined;
  }

  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : undefined;
}
