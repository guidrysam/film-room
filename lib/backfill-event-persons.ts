import {
  addGameEvent,
  listGameEvents,
  listGamesForTeam,
  type GameTimelineEvent,
} from "@/lib/games";
import { listTeamPlayers } from "@/lib/teams";
import {
  getEventPersonIds,
  getEventPlayerIds,
  personIdsForRosterPlayers,
  withEventPlayerIds,
} from "@/lib/timeline-players";

export type EventPersonBackfillResult = {
  patched: number;
  skipped: number;
};

function eventNeedsPersonBackfill(
  event: GameTimelineEvent,
  derivedPersonIds: string[],
): boolean {
  if (derivedPersonIds.length === 0) return false;
  const existing = getEventPersonIds(event);
  if (existing.length === 0) return true;
  return derivedPersonIds.some((id) => !existing.includes(id));
}

/** Add missing personIds to timeline events for one game. */
export async function backfillGameEventPersonIds(
  gameId: string,
  playerPersonMap: Map<string, string>,
  actorUid: string,
): Promise<EventPersonBackfillResult> {
  const events = await listGameEvents(gameId);
  let patched = 0;
  let skipped = 0;

  const rosterRefs = [...playerPersonMap.entries()].map(([id, personId]) => ({
    id,
    personId,
  }));

  for (const event of events) {
    const playerIds = getEventPlayerIds(event);
    if (playerIds.length === 0) {
      skipped++;
      continue;
    }
    const derived = personIdsForRosterPlayers(
      rosterRefs,
      playerIds,
    );
    if (!eventNeedsPersonBackfill(event, derived)) {
      skipped++;
      continue;
    }
    const merged = [
      ...new Set([...getEventPersonIds(event), ...derived]),
    ];
    await addGameEvent(
      gameId,
      {
        id: event.id,
        type: event.type,
        t: event.t,
        ...(event.label ? { label: event.label } : {}),
        ...(event.sourceId ? { sourceId: event.sourceId } : {}),
        payload: withEventPlayerIds(
          event.payload as Record<string, unknown> | undefined,
          playerIds,
          merged,
        ),
        ...(event.createdBy ? { createdBy: event.createdBy } : {}),
        ...(event.createdByRole ? { createdByRole: event.createdByRole } : {}),
        ...(event.createdByName ? { createdByName: event.createdByName } : {}),
      },
      { actorUid },
    );
    patched++;
  }

  return { patched, skipped };
}

export type TeamEventPersonBackfillResult = EventPersonBackfillResult & {
  games: number;
  linkedPlayers: number;
};

/** Backfill personIds on all tagged events for a team's games. */
export async function backfillTeamEventPersonIds(
  teamId: string,
  actorUid: string,
): Promise<TeamEventPersonBackfillResult> {
  const players = await listTeamPlayers(teamId);
  const playerPersonMap = new Map<string, string>();
  for (const player of players) {
    if (player.personId?.trim()) {
      playerPersonMap.set(player.id, player.personId.trim());
    }
  }

  if (playerPersonMap.size === 0) {
    return { patched: 0, skipped: 0, games: 0, linkedPlayers: 0 };
  }

  const games = await listGamesForTeam(teamId);
  let patched = 0;
  let skipped = 0;
  for (const game of games) {
    const result = await backfillGameEventPersonIds(
      game.id,
      playerPersonMap,
      actorUid,
    );
    patched += result.patched;
    skipped += result.skipped;
  }

  return {
    patched,
    skipped,
    games: games.length,
    linkedPlayers: playerPersonMap.size,
  };
}
