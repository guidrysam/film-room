/** Shared team hub and Game Cap URL builders. */

export function teamRosterUrl(teamId: string): string {
  return `/team/${teamId}`;
}

export function teamGamesUrl(teamId: string): string {
  return `/team/${teamId}/games`;
}

export function teamStatsUrl(teamId: string): string {
  return `/team/${teamId}/stats`;
}

export function teamSetupUrl(teamId: string): string {
  return `/team/${teamId}/setup`;
}

export function teamTacticsUrl(teamId: string): string {
  return `/team/${teamId}/tactics`;
}

export function teamTacticsBoardUrl(teamId: string, boardId: string): string {
  return `/team/${teamId}/tactics/${boardId}`;
}

export function gameCapUrl(opts?: {
  teamId?: string;
  gameId?: string;
}): string {
  const params = new URLSearchParams();
  if (opts?.teamId) params.set("teamId", opts.teamId);
  if (opts?.gameId) params.set("gameId", opts.gameId);
  const q = params.toString();
  return q ? `/game-cap?${q}` : "/game-cap";
}

export function playersListUrl(): string {
  return "/app/players";
}

export function personProfileUrl(personId: string): string {
  return `/app/players/${personId}`;
}

export function myPlayersUrl(): string {
  return "/app/my-players";
}

export function linkedPlayerProfileUrl(groupKey: string): string {
  return `/app/my-players/${encodeURIComponent(groupKey)}`;
}

export function teamPlayerProfileUrl(teamId: string, playerId: string): string {
  return `/team/${teamId}/player/${playerId}`;
}

export function teamFilmRoomUrl(gameId: string): string {
  return `/game/${gameId}/room`;
}
