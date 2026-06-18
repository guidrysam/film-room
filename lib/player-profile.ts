import { listGameEvents, listGamesForTeam } from "@/lib/games";
import {
  listGameStatsFromEvents,
  statTypeLabel,
  summarizeGameStatsByPlayer,
  type PlayerStatSummary,
} from "@/lib/game-stats";
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
  listTeamPlayers,
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
  statSummary: PlayerStatSummary;
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

export async function loadPlayerProfile(
  teamId: string,
  playerId: string,
  uid: string,
): Promise<PlayerProfileData | null> {
  const team = await getTeam(teamId);
  if (!team || !canViewTeam(team, uid)) return null;
  const player = await getTeamPlayer(teamId, playerId);
  if (!player) return null;

  const [games, players] = await Promise.all([
    listGamesForTeam(teamId),
    listTeamPlayers(teamId),
  ]);
  const taggedMoments: TaggedMoment[] = [];
  const gameStats: PlayerGameStat[] = [];
  const allStatsForSummary: ReturnType<typeof listGameStatsFromEvents> = [];

  await Promise.all(
    games.map(async (game) => {
      const events = await listGameEvents(game.id);
      const stats = listGameStatsFromEvents(events);
      for (const stat of stats) {
        if (!stat.playerIds.includes(playerId)) continue;
        allStatsForSummary.push(stat);
        gameStats.push({
          gameId: game.id,
          gameTitle: game.title,
          ...(game.date ? { gameDate: game.date } : {}),
          ...(game.opponent ?? game.awayTeam
            ? { opponent: game.opponent ?? game.awayTeam }
            : {}),
          eventId: stat.eventId,
          statType: statTypeLabel(stat.statType),
          t: stat.t,
          ...(stat.note ? { note: stat.note } : {}),
          ...(stat.sourceId ? { sourceId: stat.sourceId } : {}),
        });
      }
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
  gameStats.sort(
    (a, b) =>
      (a.gameDate ?? "").localeCompare(b.gameDate ?? "") || a.t - b.t,
  );

  const summaries = summarizeGameStatsByPlayer(allStatsForSummary, players);
  const statSummary =
    summaries.find((s) => s.playerId === playerId) ?? {
      playerId,
      playerName: player.name,
      ...(player.jerseyNumber ? { jerseyNumber: player.jerseyNumber } : {}),
      counts: {},
      total: 0,
    };

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
    statSummary,
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
