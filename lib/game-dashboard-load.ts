import {
  canViewGame,
  ensureGameAccessDocument,
  fetchGameEvents,
  fetchGameSources,
  getGame,
  listDirectorTracks,
  type Game,
  type GameTimelineEvent,
  type GameVideoSource,
} from "@/lib/games";
import { isPermissionDeniedError } from "@/lib/firestore-errors";
import { logFirestorePermissionError } from "@/lib/firestore-permission-log";
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
  path: string,
  err: unknown,
) {
  const code =
    err && typeof err === "object" && "code" in err
      ? (err as { code?: string }).code
      : undefined;
  const message = err instanceof Error ? err.message : String(err);
  console.error("[game:dashboard:load]", {
    gameId,
    uid,
    step,
    path,
    permissionDenied: isPermissionDeniedError(err),
    code,
    message,
  });
  logFirestorePermissionError(
    step.includes("list") ? "list" : "read",
    path,
    err,
    { gameId, uid, step },
  );
}

export async function loadGameDashboard(
  gameId: string,
  uid: string,
): Promise<GameDashboardData | null> {
  logGameDashboardLoad(gameId, uid, "start", { fetchPath: `games/${gameId}` });

  let game = await getGame(gameId, { uid });
  if (!game) {
    logGameDashboardLoad(gameId, uid, "getGame:missing");
    return null;
  }

  game = await ensureGameAccessDocument(game, uid);

  console.log({
    uid,
    gameId,
    ownerId: game.ownerId,
    memberUids: game.memberUids,
    contributors: game.contributors,
    teamId: game.teamId ?? null,
    sourceIds: game.sourceIds ?? [],
    eventIds: game.eventIds ?? [],
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
      logGameDashboardError(gameId, uid, "getTeam", `teams/${game.teamId}`, err);
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
    sources = await fetchGameSources(gameId, game, uid);
    logGameDashboardLoad(gameId, uid, "fetchGameSources:ok", {
      count: sources.length,
      viaSourceIds: (game.sourceIds?.length ?? 0) > 0,
    });
  } catch (err) {
    logGameDashboardError(
      gameId,
      uid,
      "fetchGameSources",
      `games/${gameId}/sources`,
      err,
    );
    throw err;
  }

  try {
    events = await fetchGameEvents(gameId, game, uid);
    logGameDashboardLoad(gameId, uid, "fetchGameEvents:ok", {
      count: events.length,
      viaEventIds: (game.eventIds?.length ?? 0) > 0,
    });
  } catch (err) {
    logGameDashboardError(
      gameId,
      uid,
      "fetchGameEvents",
      `games/${gameId}/events`,
      err,
    );
    throw err;
  }

  try {
    tracks = await listDirectorTracks(gameId, uid);
    logGameDashboardLoad(gameId, uid, "listDirectorTracks:ok", {
      count: tracks.length,
    });
  } catch (err) {
    logGameDashboardError(
      gameId,
      uid,
      "listDirectorTracks",
      `games/${gameId}/cuts`,
      err,
    );
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
      logGameDashboardError(
        gameId,
        uid,
        "listTeamPlayers",
        `teams/${game.teamId}/players`,
        err,
      );
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
