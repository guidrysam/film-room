import {
  addGameEvent,
  listGameEvents,
  listGamesForTeam,
  type GameTimelineEvent,
} from "@/lib/games";
import {
  getEventPersonIds,
  getEventPlayerIds,
  withEventPlayerIds,
} from "@/lib/timeline-players";

/** Replace one person id with another on all events in a game. */
export async function replacePersonIdInGameEvents(
  gameId: string,
  fromPersonId: string,
  toPersonId: string,
  actorUid: string,
): Promise<number> {
  const events = await listGameEvents(gameId);
  let patched = 0;

  for (const event of events) {
    const personIds = getEventPersonIds(event);
    if (!personIds.includes(fromPersonId)) continue;

    const playerIds = getEventPlayerIds(event);
    const merged = [
      ...new Set(
        personIds.map((id) => (id === fromPersonId ? toPersonId : id)),
      ),
    ];

    await addGameEvent(
      gameId,
      eventToInput(event, playerIds, merged),
      { actorUid },
    );
    patched++;
  }

  return patched;
}

function eventToInput(
  event: GameTimelineEvent,
  playerIds: string[],
  personIds: string[],
) {
  return {
    id: event.id,
    type: event.type,
    t: event.t,
    ...(event.label ? { label: event.label } : {}),
    ...(event.sourceId ? { sourceId: event.sourceId } : {}),
    payload: withEventPlayerIds(
      event.payload as Record<string, unknown> | undefined,
      playerIds,
      personIds,
    ),
    ...(event.createdBy ? { createdBy: event.createdBy } : {}),
    ...(event.createdByRole ? { createdByRole: event.createdByRole } : {}),
    ...(event.createdByName ? { createdByName: event.createdByName } : {}),
  };
}

/** Replace person ids across every game on a team. */
export async function replacePersonIdInTeamGames(
  teamId: string,
  fromPersonId: string,
  toPersonId: string,
  actorUid: string,
): Promise<number> {
  const games = await listGamesForTeam(teamId);
  let patched = 0;
  for (const game of games) {
    patched += await replacePersonIdInGameEvents(
      game.id,
      fromPersonId,
      toPersonId,
      actorUid,
    );
  }
  return patched;
}
