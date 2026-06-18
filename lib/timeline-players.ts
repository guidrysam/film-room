import type { GameTimelineEvent } from "@/lib/games";

const PLAYER_IDS_KEY = "playerIds";

/** Read optional player tags from a timeline event payload. */
export function getEventPlayerIds(event: GameTimelineEvent): string[] {
  const raw = event.payload?.[PLAYER_IDS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string => typeof id === "string" && id.trim() !== "",
  );
}

export function eventTagsPlayer(
  event: GameTimelineEvent,
  playerId: string,
): boolean {
  return getEventPlayerIds(event).includes(playerId);
}

/** Merge player ids into an event payload (for coach marks / tags). */
export function withEventPlayerIds(
  payload: Record<string, unknown> | undefined,
  playerIds: string[],
): Record<string, unknown> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length === 0) return payload ?? {};
  return { ...(payload ?? {}), [PLAYER_IDS_KEY]: ids };
}
