import { replacePersonIdInTeamGames } from "@/lib/person-event-replace";
import { deletePerson, getPerson } from "@/lib/persons";
import {
  canCoachTeam,
  listMyTeams,
  listTeamPlayers,
  upsertTeamPlayer,
} from "@/lib/teams";
import { auth } from "@/lib/firebase";

export type MergePersonsResult = {
  keptPersonId: string;
  keptName: string;
  rosterRowsUpdated: number;
  eventsUpdated: number;
};

/**
 * Merge two person records — keep one identity, re-point roster rows and
 * tagged events, then delete the duplicate person doc.
 */
export async function mergePersons(
  ownerUid: string,
  keepPersonId: string,
  mergePersonId: string,
): Promise<MergePersonsResult> {
  const user = auth.currentUser;
  if (!user || user.uid !== ownerUid) {
    throw new Error("Sign in required to merge player records.");
  }
  if (keepPersonId === mergePersonId) {
    throw new Error("Choose two different player records to merge.");
  }

  const [keep, merge] = await Promise.all([
    getPerson(ownerUid, keepPersonId),
    getPerson(ownerUid, mergePersonId),
  ]);
  if (!keep || !merge) {
    throw new Error("Could not find both player records.");
  }

  const teams = await listMyTeams(ownerUid);
  let rosterRowsUpdated = 0;
  let eventsUpdated = 0;

  for (const team of teams) {
    if (!canCoachTeam(team, ownerUid)) continue;

    const players = await listTeamPlayers(team.id);
    for (const player of players) {
      if (player.personId !== mergePersonId) continue;
      await upsertTeamPlayer(team.id, {
        name: player.name,
        ...(player.jerseyNumber ? { jerseyNumber: player.jerseyNumber } : {}),
        ...(player.position ? { position: player.position } : {}),
        personId: keepPersonId,
      });
      rosterRowsUpdated++;
    }

    eventsUpdated += await replacePersonIdInTeamGames(
      team.id,
      mergePersonId,
      keepPersonId,
      ownerUid,
    );
  }

  await deletePerson(ownerUid, mergePersonId);

  return {
    keptPersonId: keepPersonId,
    keptName: keep.name,
    rosterRowsUpdated,
    eventsUpdated,
  };
}
