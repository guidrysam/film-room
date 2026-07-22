import { getGame } from "@/lib/games";
import type { BallMasteryLevel } from "@/lib/player-skills/ball-mastery-ladder";
import {
  loadTeamBallMasteryLadder,
  setTeamLevelReviewGame,
  type TeamLadderLevelEntry,
} from "@/lib/player-skills/team-ladder-videos";
import { createTeamGameFromYouTubeStream } from "@/lib/team-game-from-video";

export type EnsureLadderDrillGameResult = {
  gameId: string;
  created: boolean;
};

/**
 * Reuse or create a team Game for a Ball Mastery drill so the coach can mark
 * it in Review and open a Team Film Room.
 */
export async function ensureLadderDrillGame(opts: {
  uid: string;
  teamId: string;
  level: BallMasteryLevel;
  videoId: string;
  videoTitle: string;
  entry?: TeamLadderLevelEntry;
  /** Persist game id on the ladder level (default true). */
  persistLink?: boolean;
}): Promise<EnsureLadderDrillGameResult> {
  const { uid, teamId, level, videoId, videoTitle } = opts;
  const persistLink = opts.persistLink !== false;
  const entry =
    opts.entry ??
    (await loadTeamBallMasteryLadder(teamId)).levels[level.id];

  const existingGameId = entry?.reviewGameId?.trim();
  if (existingGameId && entry?.reviewVideoId === videoId) {
    const game = await getGame(existingGameId, { uid });
    if (game && (!game.teamId || game.teamId === teamId)) {
      return { gameId: existingGameId, created: false };
    }
  }

  const created = await createTeamGameFromYouTubeStream(uid, teamId, {
    urlOrId: videoId,
    title: `Ball Mastery · ${level.title}`,
    sourceLabel: videoTitle.trim() || "Teaching drill",
  });

  if (persistLink) {
    await setTeamLevelReviewGame(
      teamId,
      level.id,
      created.gameId,
      videoId,
    );
  }

  return { gameId: created.gameId, created: true };
}
