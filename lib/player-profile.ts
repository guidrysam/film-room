import { listGameEvents, listGamesForTeam } from "@/lib/games";
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

export type PlayerProfileData = {
  team: Team;
  player: Player;
  linkedParentsCount: number;
  highlightDraftsCount: number;
  taggedMomentsCount: number;
  highlightDrafts: HighlightDraft[];
  taggedMoments: TaggedMoment[];
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

  const games = await listGamesForTeam(teamId);
  const taggedMoments: TaggedMoment[] = [];

  await Promise.all(
    games.map(async (game) => {
      const events = await listGameEvents(game.id);
      for (const ev of events) {
        if (!eventTagsPlayer(ev, playerId)) continue;
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
