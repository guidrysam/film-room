import { listGamesForTeam, listGameEvents } from "@/lib/games";
import {
  statTypeLabel,
  summarizeGameStatsByPlayer,
  type PlayerStatSummary,
} from "@/lib/game-stats";
import {
  buildTeamGameStatRecords,
  flattenStatsForAggregation,
  loadTeamGameStatsBundle,
  summarizePlayerStatsBySeason,
  type TeamGameStatRecord,
} from "@/lib/season-stats";
import {
  highlightMomentsForPlayer,
  listHighlightDraftsForPlayer,
  type HighlightDraft,
  type HighlightMoment,
} from "@/lib/highlight-draft";
import { eventTagsPlayer } from "@/lib/timeline-players";
import {
  canViewTeam,
  getTeam,
  getTeamPlayer,
  type Player,
  type Team,
} from "@/lib/teams";

export type TaggedMoment = {
  gameId: string;
  gameTitle: string;
  eventId: string;
  type: string;
  t: number;
  label?: string;
};

export type PlayerGameStat = {
  gameId: string;
  gameTitle: string;
  gameDate?: string;
  gameSeason?: string;
  opponent?: string;
  eventId: string;
  statType: string;
  t: number;
  note?: string;
  sourceId?: string;
};

export type PlayerProfileData = {
  team: Team;
  player: Player;
  linkedParentsCount: number;
  highlightDraftsCount: number;
  taggedMomentsCount: number;
  highlightDrafts: HighlightDraft[];
  taggedMoments: TaggedMoment[];
  allTimeStatSummary: PlayerStatSummary;
  seasonStatSummaries: { season: string; summary: PlayerStatSummary }[];
  gameStats: PlayerGameStat[];
};

export type PlayerMomentView = {
  draft: HighlightDraft;
  moment: HighlightMoment;
};

/** Flat list of player-tagged highlight moments across drafts. */
export function flattenPlayerHighlightMoments(
  drafts: HighlightDraft[],
  playerId: string,
): PlayerMomentView[] {
  const out: PlayerMomentView[] = [];
  for (const draft of drafts) {
    for (const moment of highlightMomentsForPlayer(draft, playerId)) {
      out.push({ draft, moment });
    }
  }
  out.sort((a, b) => a.moment.gameTime - b.moment.gameTime);
  return out;
}

function playerGameStatsFromRecords(
  records: TeamGameStatRecord[],
  playerId: string,
): PlayerGameStat[] {
  const out: PlayerGameStat[] = [];
  for (const stat of records) {
    if (!stat.playerIds.includes(playerId)) continue;
    out.push({
      gameId: stat.gameId,
      gameTitle: stat.gameTitle,
      ...(stat.gameDate ? { gameDate: stat.gameDate } : {}),
      ...(stat.gameSeason ? { gameSeason: stat.gameSeason } : {}),
      ...(stat.opponent ? { opponent: stat.opponent } : {}),
      eventId: stat.eventId,
      statType: statTypeLabel(stat.statType),
      t: stat.t,
      ...(stat.note ? { note: stat.note } : {}),
      ...(stat.sourceId ? { sourceId: stat.sourceId } : {}),
    });
  }
  return out.sort(
    (a, b) =>
      (a.gameDate ?? "").localeCompare(b.gameDate ?? "") || a.t - b.t,
  );
}

export async function loadPlayerProfile(
  teamId: string,
  playerId: string,
  uid: string,
): Promise<PlayerProfileData | null> {
  const team = await getTeam(teamId);
  if (!team || !canViewTeam(team, uid)) return null;
  const player = await getTeamPlayer(teamId, playerId);
  if (!player) return null;

  const bundle = await loadTeamGameStatsBundle(teamId);
  const allRecords = buildTeamGameStatRecords(bundle.games, bundle.statsByGameId);
  const playerRecords = allRecords.filter((r) => r.playerIds.includes(playerId));

  const summaries = summarizeGameStatsByPlayer(
    flattenStatsForAggregation(playerRecords),
    bundle.players,
  );
  const allTimeStatSummary =
    summaries.find((s) => s.playerId === playerId) ?? {
      playerId,
      playerName: player.name,
      ...(player.jerseyNumber ? { jerseyNumber: player.jerseyNumber } : {}),
      counts: {},
      total: 0,
    };

  const bySeason = summarizePlayerStatsBySeason(
    allRecords,
    bundle.players,
    playerId,
  );
  const seasonStatSummaries = [...bySeason.entries()]
    .map(([season, summary]) => ({ season, summary }))
    .sort((a, b) => a.season.localeCompare(b.season));

  const gameStats = playerGameStatsFromRecords(allRecords, playerId);

  const games = await listGamesForTeam(teamId);
  const taggedMoments: TaggedMoment[] = [];
  await Promise.all(
    games.map(async (game) => {
      const events = await listGameEvents(game.id);
      for (const ev of events) {
        if (!eventTagsPlayer(ev, playerId)) continue;
        if (ev.type === "stat") continue;
        taggedMoments.push({
          gameId: game.id,
          gameTitle: game.title,
          eventId: ev.id,
          type: ev.type,
          t: ev.t,
          ...(ev.label ? { label: ev.label } : {}),
        });
      }
    }),
  );
  taggedMoments.sort((a, b) => a.t - b.t);

  const highlightDrafts = await listHighlightDraftsForPlayer(
    teamId,
    playerId,
    uid,
  );

  return {
    team,
    player,
    linkedParentsCount: player.parentUids?.length ?? 0,
    highlightDraftsCount: highlightDrafts.length,
    taggedMomentsCount: taggedMoments.length,
    highlightDrafts,
    taggedMoments,
    allTimeStatSummary,
    seasonStatSummaries,
    gameStats,
  };
}

export function gameReviewUrl(
  gameId: string,
  gameTime: number,
  sourceId?: string,
): string {
  const params = new URLSearchParams({
    gameTime: String(gameTime),
  });
  if (sourceId) params.set("sourceId", sourceId);
  return `/game/${gameId}/review?${params.toString()}`;
}
