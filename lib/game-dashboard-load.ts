import {
  canViewGame,
  getGame,
  listDirectorTracks,
  listGameEvents,
  listGameSources,
  type Game,
  type GameTimelineEvent,
  type GameVideoSource,
} from "@/lib/games";
import {
  highlightDraftFromTrack,
  isHighlightDraft,
  type HighlightDraft,
} from "@/lib/highlight-draft";
import {
  collectTaggedPlayerIds,
  computeGameDashboardMetrics,
  recentCoachMarks,
  recentHighlightDrafts,
  type GameDashboardMetrics,
} from "@/lib/game-dashboard";
import { getTeam, listTeamPlayers, teamRoleFor, type Player, type Team } from "@/lib/teams";

export type GameDashboardData = {
  game: Game;
  team: Team | null;
  teamRole: ReturnType<typeof teamRoleFor>;
  metrics: GameDashboardMetrics;
  sources: GameVideoSource[];
  events: GameTimelineEvent[];
  players: Player[];
  taggedPlayerIds: string[];
  highlightDrafts: HighlightDraft[];
  recentMarks: GameTimelineEvent[];
  recentDrafts: HighlightDraft[];
};

export async function loadGameDashboard(
  gameId: string,
  uid: string,
): Promise<GameDashboardData | null> {
  const game = await getGame(gameId);
  if (!game) return null;

  const team = game.teamId ? await getTeam(game.teamId) : null;
  const teamRole = team ? teamRoleFor(team, uid) : null;
  if (!canViewGame(game, uid, teamRole)) return null;

  const [sources, events, tracks] = await Promise.all([
    listGameSources(gameId),
    listGameEvents(gameId),
    listDirectorTracks(gameId, uid),
  ]);

  const players =
    game.teamId && team ? await listTeamPlayers(game.teamId) : [];

  const highlightDrafts: HighlightDraft[] = [];
  for (const t of tracks) {
    if (!isHighlightDraft(t)) continue;
    const draft = highlightDraftFromTrack(t);
    if (draft) highlightDrafts.push(draft);
  }

  const taggedPlayerIds = collectTaggedPlayerIds(events, highlightDrafts);
  const metrics = computeGameDashboardMetrics({
    sources,
    events,
    players,
    highlightDrafts,
    team,
  });

  return {
    game,
    team,
    teamRole,
    metrics,
    sources,
    events,
    players,
    taggedPlayerIds,
    highlightDrafts,
    recentMarks: recentCoachMarks(events),
    recentDrafts: recentHighlightDrafts(highlightDrafts),
  };
}
