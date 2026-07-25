import { formatTimelineSeconds } from "@/lib/game-timeline";
import {
  addGameEvent,
  deleteGameEvent,
  listGameEvents,
  type Game,
  type GameTimelineEvent,
} from "@/lib/games";
import {
  getEventPersonIds,
  getEventPlayerIds,
  withEventPlayerIds,
} from "@/lib/timeline-players";
import { canCoachTeam, type Player, type Team } from "@/lib/teams";
import { isBasketballSport } from "@/lib/sports";

export type GameStatType =
  | "goal"
  | "assist"
  | "shot"
  | "shot_on_goal"
  | "save"
  | "foul"
  | "yellow_card"
  | "red_card"
  | "corner"
  | "key_pass"
  | "defensive_stop"
  | "turnover"
  | "field_goal"
  | "three_pointer"
  | "rebound"
  | "block"
  | "steal"
  | "custom";

export const GAME_STAT_TYPES: GameStatType[] = [
  "goal",
  "assist",
  "shot",
  "shot_on_goal",
  "save",
  "foul",
  "yellow_card",
  "red_card",
  "corner",
  "key_pass",
  "defensive_stop",
  "turnover",
  "field_goal",
  "three_pointer",
  "rebound",
  "block",
  "steal",
  "custom",
];

const STAT_TYPE_LABELS: Record<GameStatType, string> = {
  goal: "Goal",
  assist: "Assist",
  shot: "Shot",
  shot_on_goal: "Shot on goal",
  save: "Save",
  foul: "Foul",
  yellow_card: "Yellow card",
  red_card: "Red card",
  corner: "Corner",
  key_pass: "Key pass",
  defensive_stop: "Defensive stop",
  turnover: "Turnover",
  field_goal: "Bucket",
  three_pointer: "3-pointer",
  rebound: "Rebound",
  block: "Block",
  steal: "Steal",
  custom: "Custom",
};

/** Soccer-oriented types hidden when reviewing basketball. */
const SOCCER_ONLY_STAT_TYPES: ReadonlySet<GameStatType> = new Set([
  "goal",
  "shot_on_goal",
  "save",
  "yellow_card",
  "red_card",
  "corner",
  "key_pass",
  "defensive_stop",
]);

/** Basketball-oriented types hidden when reviewing soccer. */
const BASKETBALL_ONLY_STAT_TYPES: ReadonlySet<GameStatType> = new Set([
  "field_goal",
  "three_pointer",
  "rebound",
  "block",
  "steal",
]);

export function gameStatTypesForSport(
  sportRaw: string | null | undefined,
): GameStatType[] {
  const isBb = isBasketballSport(sportRaw);
  return GAME_STAT_TYPES.filter((t) => {
    if (t === "custom") return true;
    if (isBb) return !SOCCER_ONLY_STAT_TYPES.has(t);
    return !BASKETBALL_ONLY_STAT_TYPES.has(t);
  });
}

export function statTypeLabel(
  statType: string,
  sportRaw?: string | null,
): string {
  const isBb = isBasketballSport(sportRaw);
  if (isBb) {
    if (statType === "goal") return "Bucket";
    if (statType === "save") return "Block";
    if (statType === "shot") return "Shot";
    if (statType === "defensive_stop") return "Steal";
  }
  if (statType in STAT_TYPE_LABELS) {
    return STAT_TYPE_LABELS[statType as GameStatType];
  }
  return statType.replace(/_/g, " ");
}

export type GameStatRecord = {
  eventId: string;
  t: number;
  statType: GameStatType | string;
  playerIds: string[];
  personIds?: string[];
  note?: string;
  sourceId?: string;
  label?: string;
  createdBy?: string;
  createdByName?: string;
};

export type GameStatCsvRow = {
  game: string;
  date?: string;
  team?: string;
  opponent?: string;
  player: string;
  jersey?: string;
  statType: string;
  gameTime: string;
  note?: string;
  sourceId?: string;
  eventId: string;
};

export type PlayerStatSummary = {
  playerId: string;
  playerName: string;
  jerseyNumber?: string;
  counts: Record<string, number>;
  total: number;
};

export type TeamStatSummary = {
  teamName?: string;
  totalStats: number;
  byType: Record<string, number>;
  players: PlayerStatSummary[];
};

export function isGameStatType(value: unknown): value is GameStatType {
  return typeof value === "string" && GAME_STAT_TYPES.includes(value as GameStatType);
}

export function isGameStatEvent(event: GameTimelineEvent): boolean {
  return event.type === "stat";
}

export function parseGameStat(event: GameTimelineEvent): GameStatRecord | null {
  if (event.type !== "stat") return null;
  const rawType = event.payload?.statType;
  const statType =
    typeof rawType === "string" && rawType.trim()
      ? rawType.trim()
      : event.label?.trim() || "custom";
  const playerIds = getEventPlayerIds(event);
  const personIds = getEventPersonIds(event);
  const note =
    typeof event.payload?.note === "string" && event.payload.note.trim()
      ? event.payload.note.trim()
      : undefined;

  return {
    eventId: event.id,
    t: event.t,
    statType,
    playerIds,
    ...(personIds.length > 0 ? { personIds } : {}),
    ...(note ? { note } : {}),
    ...(event.sourceId ? { sourceId: event.sourceId } : {}),
    ...(event.label ? { label: event.label } : {}),
    ...(event.createdBy ? { createdBy: event.createdBy } : {}),
    ...(event.createdByName ? { createdByName: event.createdByName } : {}),
  };
}

export function listGameStatsFromEvents(
  events: GameTimelineEvent[],
): GameStatRecord[] {
  return events
    .map(parseGameStat)
    .filter((s): s is GameStatRecord => s != null)
    .sort((a, b) => a.t - b.t);
}

export async function listGameStats(gameId: string): Promise<GameStatRecord[]> {
  return listGameStatsFromEvents(await listGameEvents(gameId));
}

export function canManageGameStats(
  game: Game,
  uid: string,
  team: Team | null,
): boolean {
  if (!uid) return false;
  if (team && canCoachTeam(team, uid)) return true;
  const role = game.contributors[uid];
  return role === "owner" || role === "editor";
}

export type AddGameStatInput = {
  t: number;
  statType: GameStatType | string;
  playerIds: string[];
  personIds?: string[];
  note?: string;
  sourceId?: string;
  label?: string;
  createdBy?: string;
  createdByRole?: string;
  createdByName?: string;
};

export async function addGameStat(
  gameId: string,
  input: AddGameStatInput,
): Promise<string> {
  const playerIds = [...new Set(input.playerIds.filter(Boolean))];
  if (playerIds.length === 0) {
    throw new Error("Select at least one player for this stat.");
  }

  const statType = input.statType.trim() || "custom";
  const note = input.note?.trim();
  const label =
    input.label?.trim() ||
    (statType === "custom" && note ? note : statTypeLabel(statType));

  return addGameEvent(gameId, {
    type: "stat",
    t: input.t,
    label,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    payload: withEventPlayerIds(
      {
        statType,
        ...(note ? { note } : {}),
      },
      playerIds,
      input.personIds,
    ),
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    ...(input.createdByRole ? { createdByRole: input.createdByRole } : {}),
    ...(input.createdByName ? { createdByName: input.createdByName } : {}),
  });
}

export async function deleteGameStat(
  gameId: string,
  eventId: string,
): Promise<void> {
  await deleteGameEvent(gameId, eventId);
}

export function statFromCoachMark(
  event: GameTimelineEvent,
  overrides?: Partial<AddGameStatInput>,
): AddGameStatInput | null {
  if (event.type !== "coach_mark") return null;
  const playerIds = getEventPlayerIds(event);
  const note =
    typeof event.payload?.note === "string"
      ? event.payload.note
      : event.label?.trim();
  return {
    t: overrides?.t ?? event.t,
    statType: overrides?.statType ?? "custom",
    playerIds: overrides?.playerIds ?? playerIds,
    note: overrides?.note ?? note,
    sourceId: overrides?.sourceId ?? event.sourceId,
    label: overrides?.label ?? event.label,
  };
}

export function summarizeGameStatsByPlayer(
  stats: GameStatRecord[],
  players: Player[],
): PlayerStatSummary[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const countsByPlayer = new Map<string, Record<string, number>>();

  for (const stat of stats) {
    for (const playerId of stat.playerIds) {
      const bucket = countsByPlayer.get(playerId) ?? {};
      bucket[stat.statType] = (bucket[stat.statType] ?? 0) + 1;
      countsByPlayer.set(playerId, bucket);
    }
  }

  const summaries: PlayerStatSummary[] = [];
  for (const [playerId, counts] of countsByPlayer) {
    const player = byId.get(playerId);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    summaries.push({
      playerId,
      playerName: player?.name ?? playerId,
      ...(player?.jerseyNumber ? { jerseyNumber: player.jerseyNumber } : {}),
      counts,
      total,
    });
  }

  return summaries.sort(
    (a, b) => b.total - a.total || a.playerName.localeCompare(b.playerName),
  );
}

export function summarizeGameStatsByTeam(
  stats: GameStatRecord[],
  players: Player[],
  teamName?: string,
): TeamStatSummary {
  const byType: Record<string, number> = {};
  for (const stat of stats) {
    byType[stat.statType] = (byType[stat.statType] ?? 0) + 1;
  }

  return {
    ...(teamName ? { teamName } : {}),
    totalStats: stats.length,
    byType,
    players: summarizeGameStatsByPlayer(stats, players),
  };
}

export function formatPlayerStatLine(summary: PlayerStatSummary): string {
  const parts = Object.entries(summary.counts)
    .sort((a, b) => b[1] - a[1] || statTypeLabel(a[0]).localeCompare(statTypeLabel(b[0])))
    .map(([type, count]) => `${count} ${statTypeLabel(type).toLowerCase()}${count === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function gameStatsToCsv(rows: GameStatCsvRow[]): string {
  const headers = [
    "Game",
    "Date",
    "Team",
    "Opponent",
    "Player",
    "Jersey",
    "Stat Type",
    "Game Time",
    "Note",
    "Source ID",
    "Event ID",
  ];

  const lines = rows.map((row) =>
    [
      row.game,
      row.date ?? "",
      row.team ?? "",
      row.opponent ?? "",
      row.player,
      row.jersey ?? "",
      row.statType,
      row.gameTime,
      row.note ?? "",
      row.sourceId ?? "",
      row.eventId,
    ]
      .map((cell) => csvEscape(cell))
      .join(","),
  );

  return [headers.join(","), ...lines].join("\n");
}

export function buildGameStatCsvRows(input: {
  game: Game;
  team?: Team | null;
  stats: GameStatRecord[];
  players: Player[];
}): GameStatCsvRow[] {
  const playerById = new Map(input.players.map((p) => [p.id, p]));
  const rows: GameStatCsvRow[] = [];

  for (const stat of input.stats) {
    for (const playerId of stat.playerIds) {
      const player = playerById.get(playerId);
      rows.push({
        game: input.game.title,
        ...(input.game.date ? { date: input.game.date } : {}),
        ...(input.team?.name ? { team: input.team.name } : {}),
        ...(input.game.opponent ?? input.game.awayTeam
          ? { opponent: input.game.opponent ?? input.game.awayTeam }
          : {}),
        player: player?.name ?? playerId,
        ...(player?.jerseyNumber ? { jersey: player.jerseyNumber } : {}),
        statType: statTypeLabel(stat.statType),
        gameTime: formatTimelineSeconds(stat.t),
        ...(stat.note ? { note: stat.note } : {}),
        ...(stat.sourceId ? { sourceId: stat.sourceId } : {}),
        eventId: stat.eventId,
      });
    }
  }

  return rows.sort(
    (a, b) =>
      a.game.localeCompare(b.game) ||
      a.gameTime.localeCompare(b.gameTime) ||
      a.player.localeCompare(b.player),
  );
}

export function buildTeamPlayerStatCsvRows(input: {
  team: Team;
  games: Game[];
  statsByGameId: Map<string, GameStatRecord[]>;
  players: Player[];
}): GameStatCsvRow[] {
  const rows: GameStatCsvRow[] = [];
  for (const game of input.games) {
    const stats = input.statsByGameId.get(game.id) ?? [];
    rows.push(
      ...buildGameStatCsvRows({
        game,
        team: input.team,
        stats,
        players: input.players,
      }),
    );
  }
  return rows;
}

export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
