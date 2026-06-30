import type { GameTimelineEvent } from "@/lib/games";

const PLAYER_IDS_KEY = "playerIds";
const PERSON_IDS_KEY = "personIds";

/** Read optional player tags from a timeline event payload. */
export function getEventPlayerIds(event: GameTimelineEvent): string[] {
  const raw = event.payload?.[PLAYER_IDS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string => typeof id === "string" && id.trim() !== "",
  );
}

/** Read persistent person ids from a timeline event payload. */
export function getEventPersonIds(event: GameTimelineEvent): string[] {
  const raw = event.payload?.[PERSON_IDS_KEY];
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

export function eventTagsPerson(
  event: GameTimelineEvent,
  personId: string,
): boolean {
  return getEventPersonIds(event).includes(personId);
}

/** Match a timeline event to a person via personIds or roster player ids. */
export function eventTagsPersonOrPlayers(
  event: GameTimelineEvent,
  personId: string,
  rosterPlayerIds: string[],
): boolean {
  if (eventTagsPerson(event, personId)) return true;
  if (rosterPlayerIds.length === 0) return false;
  const tagged = getEventPlayerIds(event);
  return tagged.some((id) => rosterPlayerIds.includes(id));
}

/** Merge player ids into an event payload (for coach marks / tags). */
export function withEventPlayerIds(
  payload: Record<string, unknown> | undefined,
  playerIds: string[],
  personIds?: string[],
): Record<string, unknown> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  const persons = [...new Set((personIds ?? []).filter(Boolean))];
  const base = { ...(payload ?? {}) };
  if (ids.length > 0) base[PLAYER_IDS_KEY] = ids;
  if (persons.length > 0) base[PERSON_IDS_KEY] = persons;
  return base;
}
