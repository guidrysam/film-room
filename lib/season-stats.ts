import { listGameEvents, listGamesForTeam, type Game } from "@/lib/games";
import {
  buildGameStatCsvRows,
  listGameStatsFromEvents,
  statTypeLabel,
  summarizeGameStatsByPlayer,
  summarizeGameStatsByTeam,
  type GameStatRecord,
  type GameStatType,
  type PlayerStatSummary,
  type TeamStatSummary,
} from "@/lib/game-stats";
import { listTeamPlayers, type Player } from "@/lib/teams";

export type SeasonStatFilters = {
  season?: string;
  dateFrom?: string;
  dateTo?: string;
  playerId?: string;
  statType?: GameStatType | string;
};

export type TeamGameStatRecord = GameStatRecord & {
  gameId: string;
  gameTitle: string;
  gameDate?: string;
  gameSeason?: string;
  opponent?: string;
};

export type SeasonPlayerTableRow = {
  playerId: string;
  playerName: string;
  jerseyNumber?: string;
  goals: number;
  assists: number;
  shots: number;
  shotOnGoal: number;
  saves: number;
  fouls: number;
  yellow: number;
  red: number;
  customOther: number;
  total: number;
};

export type SeasonStatSummaryCsvRow = {
  team: string;
  season: string;
  player: string;
  jersey?: string;
  statType: string;
  count: number;
};

const TABLE_STANDARD_TYPES = new Set<GameStatType>([
  "goal",
  "assist",
  "shot",
  "shot_on_goal",
  "save",
  "foul",
  "yellow_card",
  "red_card",
  "field_goal",
  "three_pointer",
  "rebound",
  "block",
  "steal",
  "turnover",
]);

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Filter team games by season and optional date range. */
export function filterTeamStatGames(
  games: Game[],
  filters?: SeasonStatFilters,
): Game[] {
  return games.filter((game) => gameMatchesFilters(game, filters));
}

function gameMatchesFilters(game: Game, filters?: SeasonStatFilters): boolean {
  if (!filters) return true;
  if (filters.season && game.season?.trim() !== filters.season) return false;
  if (filters.dateFrom && (!game.date || game.date < filters.dateFrom)) {
    return false;
  }
  if (filters.dateTo && (!game.date || game.date > filters.dateTo)) {
    return false;
  }
  return true;
}

export function buildTeamGameStatRecords(
  games: Game[],
  statsByGameId: Map<string, GameStatRecord[]>,
): TeamGameStatRecord[] {
  const rows: TeamGameStatRecord[] = [];
  for (const game of games) {
    const stats = statsByGameId.get(game.id) ?? [];
    for (const stat of stats) {
      rows.push({
        ...stat,
        gameId: game.id,
        gameTitle: game.title,
        ...(game.date ? { gameDate: game.date } : {}),
        ...(game.season ? { gameSeason: game.season } : {}),
        ...(game.opponent ?? game.awayTeam
          ? { opponent: game.opponent ?? game.awayTeam }
          : {}),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      (a.gameDate ?? "").localeCompare(b.gameDate ?? "") ||
      a.t - b.t ||
      a.gameTitle.localeCompare(b.gameTitle),
  );
}

/** Filter stat rows by player and stat type. */
export function filterTeamGameStats(
  records: TeamGameStatRecord[],
  filters?: SeasonStatFilters,
): TeamGameStatRecord[] {
  if (!filters) return records;
  return records.filter((row) => {
    if (filters.playerId && !row.playerIds.includes(filters.playerId)) {
      return false;
    }
    if (filters.statType && row.statType !== filters.statType) {
      return false;
    }
    return true;
  });
}

export function flattenStatsForAggregation(
  records: TeamGameStatRecord[],
): GameStatRecord[] {
  return records.map((record) => ({
    eventId: record.eventId,
    t: record.t,
    statType: record.statType,
    playerIds: record.playerIds,
    ...(record.note ? { note: record.note } : {}),
    ...(record.sourceId ? { sourceId: record.sourceId } : {}),
    ...(record.label ? { label: record.label } : {}),
    ...(record.createdBy ? { createdBy: record.createdBy } : {}),
    ...(record.createdByName ? { createdByName: record.createdByName } : {}),
    ...(record.personIds?.length ? { personIds: record.personIds } : {}),
  }));
}

export function summarizeSeasonStatsByPlayerFromRecords(
  records: TeamGameStatRecord[],
  players: Player[],
): PlayerStatSummary[] {
  return summarizeGameStatsByPlayer(flattenStatsForAggregation(records), players);
}

export function summarizeSeasonStatsByTeamFromRecords(
  records: TeamGameStatRecord[],
  players: Player[],
  teamName?: string,
): TeamStatSummary {
  return summarizeGameStatsByTeam(
    flattenStatsForAggregation(records),
    players,
    teamName,
  );
}

function countType(summary: PlayerStatSummary, type: GameStatType): number {
  return summary.counts[type] ?? 0;
}

function countTypes(
  summary: PlayerStatSummary,
  types: GameStatType[],
): number {
  return types.reduce((sum, t) => sum + countType(summary, t), 0);
}

export function customOrOtherStatCount(summary: PlayerStatSummary): number {
  let total = 0;
  for (const [type, count] of Object.entries(summary.counts)) {
    if (!TABLE_STANDARD_TYPES.has(type as GameStatType)) {
      total += count;
    }
  }
  return total;
}

export function buildSeasonPlayerTableRows(
  summaries: PlayerStatSummary[],
  players: Player[],
): SeasonPlayerTableRow[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = summaries.map((summary) => {
    const player = byId.get(summary.playerId);
    return {
      playerId: summary.playerId,
      playerName: player?.name ?? summary.playerName,
      ...(player?.jerseyNumber ?? summary.jerseyNumber
        ? { jerseyNumber: player?.jerseyNumber ?? summary.jerseyNumber }
        : {}),
      // Soccer: goals; basketball: field_goal + three_pointer (+ legacy goal)
      goals: countTypes(summary, ["goal", "field_goal", "three_pointer"]),
      assists: countType(summary, "assist"),
      shots: countType(summary, "shot"),
      // Soccer: SOG; basketball: rebounds
      shotOnGoal: countTypes(summary, ["shot_on_goal", "rebound"]),
      // Soccer: saves; basketball: blocks (+ legacy save)
      saves: countTypes(summary, ["save", "block"]),
      fouls: countType(summary, "foul"),
      // Soccer cards; basketball: steals / turnovers in Y/R columns when present
      yellow: countTypes(summary, ["yellow_card", "steal"]),
      red: countTypes(summary, ["red_card", "turnover"]),
      customOther: customOrOtherStatCount(summary),
      total: summary.total,
    };
  });

  const seen = new Set(rows.map((r) => r.playerId));
  for (const player of players) {
    if (seen.has(player.id)) continue;
    rows.push({
      playerId: player.id,
      playerName: player.name,
      ...(player.jerseyNumber ? { jerseyNumber: player.jerseyNumber } : {}),
      goals: 0,
      assists: 0,
      shots: 0,
      shotOnGoal: 0,
      saves: 0,
      fouls: 0,
      yellow: 0,
      red: 0,
      customOther: 0,
      total: 0,
    });
  }

  return rows.sort(
    (a, b) => b.total - a.total || a.playerName.localeCompare(b.playerName),
  );
}

export function listSeasonOptions(games: Game[]): string[] {
  const seasons = new Set<string>();
  for (const game of games) {
    const season = game.season?.trim();
    if (season) seasons.add(season);
  }
  return [...seasons].sort();
}

export function buildSeasonStatSummaryCsvRows(input: {
  teamName: string;
  seasonLabel: string;
  summaries: PlayerStatSummary[];
  players: Player[],
}): SeasonStatSummaryCsvRow[] {
  const playerById = new Map(input.players.map((p) => [p.id, p]));
  const rows: SeasonStatSummaryCsvRow[] = [];

  for (const summary of input.summaries) {
    const player = playerById.get(summary.playerId);
    for (const [type, count] of Object.entries(summary.counts)) {
      if (count <= 0) continue;
      rows.push({
        team: input.teamName,
        season: input.seasonLabel,
        player: player?.name ?? summary.playerName,
        ...(player?.jerseyNumber ?? summary.jerseyNumber
          ? { jersey: player?.jerseyNumber ?? summary.jerseyNumber }
          : {}),
        statType: statTypeLabel(type),
        count,
      });
    }
  }

  return rows.sort(
    (a, b) =>
      a.player.localeCompare(b.player) ||
      a.statType.localeCompare(b.statType),
  );
}

export function seasonStatsToCsv(rows: SeasonStatSummaryCsvRow[]): string {
  const headers = ["Team", "Season", "Player", "Jersey", "Stat Type", "Count"];
  const lines = rows.map((row) =>
    [
      row.team,
      row.season,
      row.player,
      row.jersey ?? "",
      row.statType,
      String(row.count),
    ]
      .map((cell) => csvEscape(cell))
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

export function buildDetailedSeasonStatCsvRows(input: {
  teamName: string;
  games: Game[];
  records: TeamGameStatRecord[];
  players: Player[];
}) {
  const byGame = new Map<string, TeamGameStatRecord[]>();
  for (const record of input.records) {
    const list = byGame.get(record.gameId) ?? [];
    list.push(record);
    byGame.set(record.gameId, list);
  }

  const rows = [];
  for (const game of input.games) {
    const stats = byGame.get(game.id) ?? [];
    if (stats.length === 0) continue;
    rows.push(
      ...buildGameStatCsvRows({
        game,
        team: null,
        stats,
        players: input.players,
      }).map((row) => ({ ...row, team: input.teamName })),
    );
  }
  return rows;
}

/**
 * MVP: list games, fetch stat events per game, aggregate client-side.
 * TODO: For large clubs, add denormalized season summaries later.
 */
export async function listTeamStatGames(
  teamId: string,
  filters?: SeasonStatFilters,
): Promise<Game[]> {
  const games = await listGamesForTeam(teamId);
  return filterTeamStatGames(games, filters);
}

export async function loadTeamGameStatsBundle(teamId: string): Promise<{
  games: Game[];
  players: Player[];
  statsByGameId: Map<string, GameStatRecord[]>;
}> {
  const [games, players] = await Promise.all([
    listGamesForTeam(teamId),
    listTeamPlayers(teamId),
  ]);
  const statsByGameId = new Map<string, GameStatRecord[]>();

  await Promise.all(
    games.map(async (game) => {
      const events = await listGameEvents(game.id);
      statsByGameId.set(game.id, listGameStatsFromEvents(events));
    }),
  );

  return { games, players, statsByGameId };
}

export async function listTeamGameStats(
  teamId: string,
  filters?: SeasonStatFilters,
): Promise<TeamGameStatRecord[]> {
  const { games, statsByGameId } = await loadTeamGameStatsBundle(teamId);
  const filteredGames = filterTeamStatGames(games, filters);
  const records = buildTeamGameStatRecords(filteredGames, statsByGameId);
  return filterTeamGameStats(records, filters);
}

export async function summarizeSeasonStatsByPlayer(
  teamId: string,
  filters?: SeasonStatFilters,
): Promise<PlayerStatSummary[]> {
  const { games, players, statsByGameId } = await loadTeamGameStatsBundle(teamId);
  const filteredGames = filterTeamStatGames(games, filters);
  const records = filterTeamGameStats(
    buildTeamGameStatRecords(filteredGames, statsByGameId),
    filters,
  );
  return summarizeSeasonStatsByPlayerFromRecords(records, players);
}

export async function summarizeSeasonStatsByTeam(
  teamId: string,
  teamName: string,
  filters?: SeasonStatFilters,
): Promise<TeamStatSummary> {
  const { games, players, statsByGameId } = await loadTeamGameStatsBundle(teamId);
  const filteredGames = filterTeamStatGames(games, filters);
  const records = filterTeamGameStats(
    buildTeamGameStatRecords(filteredGames, statsByGameId),
    filters,
  );
  return summarizeSeasonStatsByTeamFromRecords(records, players, teamName);
}

export function seasonLabelFromFilters(
  filters?: SeasonStatFilters,
): string {
  if (filters?.season) return filters.season;
  if (filters?.dateFrom || filters?.dateTo) {
    return [filters.dateFrom, filters.dateTo].filter(Boolean).join(" – ");
  }
  return "All time";
}

export function summarizePlayerStatsBySeason(
  records: TeamGameStatRecord[],
  players: Player[],
  playerId: string,
): Map<string, PlayerStatSummary> {
  const bySeason = new Map<string, TeamGameStatRecord[]>();
  for (const record of records) {
    if (!record.playerIds.includes(playerId)) continue;
    const season = record.gameSeason?.trim() || "Unassigned";
    const bucket = bySeason.get(season) ?? [];
    bucket.push(record);
    bySeason.set(season, bucket);
  }

  const out = new Map<string, PlayerStatSummary>();
  for (const [season, seasonRecords] of bySeason) {
    const summaries = summarizeSeasonStatsByPlayerFromRecords(
      seasonRecords,
      players,
    );
    const summary = summaries.find((s) => s.playerId === playerId);
    if (summary) out.set(season, summary);
  }
  return out;
}
