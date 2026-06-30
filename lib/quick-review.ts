import {
  addYouTubeSourceToGame,
  createGame,
} from "@/lib/games";
import { fetchYouTubeVideoMeta } from "@/lib/youtube-video-meta-client";

/** Create a minimal game with one YouTube source for ad-hoc review. */
export async function createQuickReviewGame(
  uid: string,
  videoId: string,
): Promise<{ gameId: string }> {
  const meta = await fetchYouTubeVideoMeta(videoId);
  const title = meta?.title?.trim() || "Quick review";
  const gameId = await createGame(uid, { title });
  await addYouTubeSourceToGame(gameId, uid, {
    urlOrId: videoId,
    label: "YouTube source",
  });
  return { gameId };
}
