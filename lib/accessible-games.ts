import { listGamesForTeam, listMyGames, type Game } from "@/lib/games";
import { type Team } from "@/lib/teams";

/** Dedupe games by id and sort newest first. */
export function mergeAccessibleGames(lists: Game[][]): Game[] {
  const byId = new Map<string, Game>();
  for (const list of lists) {
    for (const game of list) byId.set(game.id, game);
  }
  return [...byId.values()].sort(
    (a, b) =>
      (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
  );
}

/**
 * Games the user can open on the dashboard: direct membership plus any game
 * linked to a team already in their visible team list (includes club teams).
 */
export async function listAccessibleGames(
  uid: string,
  teams: Team[],
): Promise<Game[]> {
  if (!uid.trim()) return [];

  // `teams` is already visibility-filtered (membership + club cascade).
  const teamIds = teams.map((team) => team.id);

  const [directGames, ...teamGameLists] = await Promise.all([
    listMyGames(uid),
    ...teamIds.map((teamId) => listGamesForTeam(teamId)),
  ]);

  return mergeAccessibleGames([directGames, ...teamGameLists]);
}
