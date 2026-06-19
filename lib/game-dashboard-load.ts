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
import { isPermissionDeniedError } from "@/lib/firestore-errors";
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

function logGameDashboardLoad(
  gameId: string,
  uid: string,
  step: string,
  details?: Record<string, unknown>,
) {
  console.info("[game:dashboard:load]", { gameId, uid, step, ...details });
}

function logGameDashboardError(
  gameId: string,
  uid: string,
  step: string,
  err: unknown,
) {
  console.error("[game:dashboard:load]", {
    gameId,
    uid,
    step,
    permissionDenied: isPermissionDeniedError(err),
    message: err instanceof Error ? err.message : String(err),
    code:
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : undefined,
  });
}

export async function loadGameDashboard(
  gameId: string,
  uid: string,
): Promise<GameDashboardData | null> {
  logGameDashboardLoad(gameId, uid, "start", { fetchPath: `games/${gameId}` });

  const game = await getGame(gameId);
  if (!game) {
    logGameDashboardLoad(gameId, uid, "getGame:missing");
    return null;
  }

  logGameDashboardLoad(gameId, uid, "getGame:ok", {
    ownerId: game.ownerId,
    memberUids: game.memberUids,
    contributors: Object.keys(game.contributors),
    teamId: game.teamId ?? null,
  });

  let team: Team | null = null;
  if (game.teamId) {
    try {
      team = await getTeam(game.teamId);
      logGameDashboardLoad(gameId, uid, "getTeam:ok", {
        teamId: game.teamId,
        found: Boolean(team),
      });
    } catch (err) {
      logGameDashboardError(gameId, uid, "getTeam", err);
      throw err;
    }
  }

  const teamRole = team ? teamRoleFor(team, uid) : null;
  if (!canViewGame(game, uid, teamRole)) {
    logGameDashboardLoad(gameId, uid, "canViewGame:denied", {
      teamRole,
      visibility: game.visibility,
    });
    return null;
  }

  let sources: GameVideoSource[];
  let events: GameTimelineEvent[];
  let tracks: Awaited<ReturnType<typeof listDirectorTracks>>;

  try {
    sources = await listGameSources(gameId);
    logGameDashboardLoad(gameId, uid, "listGameSources:ok", {
      count: sources.length,
    });
  } catch (err) {
    logGameDashboardError(gameId, uid, "listGameSources", err);
    throw err;
  }

  try {
    events = await listGameEvents(gameId);
    logGameDashboardLoad(gameId, uid, "listGameEvents:ok", {
      count: events.length,
    });
  } catch (err) {
    logGameDashboardError(gameId, uid, "listGameEvents", err);
    throw err;
  }

  try {
    tracks = await listDirectorTracks(gameId, uid);
    logGameDashboardLoad(gameId, uid, "listDirectorTracks:ok", {
      count: tracks.length,
    });
  } catch (err) {
    logGameDashboardError(gameId, uid, "listDirectorTracks", err);
    throw err;
  }

  let players: Player[] = [];
  if (game.teamId && team) {
    try {
      players = await listTeamPlayers(game.teamId);
      logGameDashboardLoad(gameId, uid, "listTeamPlayers:ok", {
        count: players.length,
      });
    } catch (err) {
      logGameDashboardError(gameId, uid, "listTeamPlayers", err);
      throw err;
    }
  }

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

  logGameDashboardLoad(gameId, uid, "complete");

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
