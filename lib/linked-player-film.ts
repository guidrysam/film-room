import { listGamesForTeam, listGameEvents, type Game } from "@/lib/games";
import { listGameStatsFromEvents, statTypeLabel } from "@/lib/game-stats";
import {
  statRecordMatchesPerson,
  type PersonFilmMoment,
} from "@/lib/person-profile";
import type { LinkedPlayerGroup } from "@/lib/linked-players";
import { eventTagsPersonOrPlayers } from "@/lib/timeline-players";
import { canViewTeam, getTeam } from "@/lib/teams";

/** Load tagged stats and coach marks for a parent-linked player group. */
export async function loadLinkedPlayerFilmMoments(
  parentUid: string,
  group: LinkedPlayerGroup,
): Promise<PersonFilmMoment[]> {
  const out: PersonFilmMoment[] = [];
  const personId = group.personId ?? "";

  for (const entry of group.entries) {
    const team = await getTeam(entry.teamId);
    if (!team || !canViewTeam(team, parentUid)) continue;

    const rosterPlayerIds = [entry.playerId];
    const games = await listGamesForTeam(entry.teamId);

    await Promise.all(
      games.map(async (game: Game) => {
        const events = await listGameEvents(game.id);
        const stats = listGameStatsFromEvents(events);

        for (const stat of stats) {
          if (!statRecordMatchesPerson(stat, personId, rosterPlayerIds)) {
            continue;
          }
          out.push({
            gameId: game.id,
            gameTitle: game.title,
            ...(game.date ? { gameDate: game.date } : {}),
            ...(entry.eventLabel ? { eventLabel: entry.eventLabel } : {}),
            teamName: entry.teamName,
            eventId: stat.eventId,
            kind: "stat",
            label: statTypeLabel(stat.statType),
            statType: stat.statType,
            t: stat.t,
            ...(stat.sourceId ? { sourceId: stat.sourceId } : {}),
          });
        }

        for (const ev of events) {
          if (ev.type === "stat") continue;
          if (
            !eventTagsPersonOrPlayers(ev, personId, rosterPlayerIds)
          ) {
            continue;
          }
          out.push({
            gameId: game.id,
            gameTitle: game.title,
            ...(game.date ? { gameDate: game.date } : {}),
            ...(entry.eventLabel ? { eventLabel: entry.eventLabel } : {}),
            teamName: entry.teamName,
            eventId: ev.id,
            kind: "tag",
            label: ev.label?.trim() || ev.type,
            t: ev.t,
            ...(ev.sourceId ? { sourceId: ev.sourceId } : {}),
          });
        }
      }),
    );
  }

  out.sort(
    (a, b) =>
      (b.gameDate ?? "").localeCompare(a.gameDate ?? "") || b.t - a.t,
  );
  return out;
}
