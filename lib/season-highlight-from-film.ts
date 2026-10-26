/**
 * Build a season highlight reel game from selected My Film YouTube clips.
 * Each clip becomes one full-length reel segment (team separation comes later).
 */

import { formatGameCapMogoDisplayName } from "@/lib/youtube/mogo-match";
import {
  createHighlightReel,
  type AddHighlightMomentInput,
} from "@/lib/highlight-draft";
import {
  addGameSourceFromYouTubeUpload,
  createGame,
} from "@/lib/games";
import {
  setFilmSourceReviewGame,
  type FilmSource,
} from "@/lib/film-sources";
import { FILM_HIGHLIGHT_MAX_SEC } from "@/lib/film-source-filters";

/** Fallback when a short clip has no stored duration. */
export const SEASON_CLIP_DEFAULT_DURATION_SEC = 90;

export type SeasonHighlightClipInput = {
  id: string;
  label: string;
  youtubeVideoId: string;
  durationSec?: number;
};

export function filmSourceToSeasonClip(
  source: FilmSource,
): SeasonHighlightClipInput | null {
  const youtubeVideoId = (
    source.youtubeVideoId ||
    source.videoId ||
    ""
  ).trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(youtubeVideoId)) return null;
  return {
    id: source.id,
    label:
      formatGameCapMogoDisplayName(source.label) ||
      source.label.trim() ||
      youtubeVideoId,
    youtubeVideoId,
    ...(typeof source.durationSec === "number" &&
    Number.isFinite(source.durationSec) &&
    source.durationSec > 0
      ? { durationSec: source.durationSec }
      : {}),
  };
}

export function seasonClipDurationSec(clip: SeasonHighlightClipInput): number {
  if (
    typeof clip.durationSec === "number" &&
    Number.isFinite(clip.durationSec) &&
    clip.durationSec > 0
  ) {
    return Math.min(clip.durationSec, FILM_HIGHLIGHT_MAX_SEC * 3);
  }
  return SEASON_CLIP_DEFAULT_DURATION_SEC;
}

/** One full-clip moment per source (gameTime 0, offsets cover the VOD). */
export function momentInputForSeasonClip(
  sourceId: string,
  clip: SeasonHighlightClipInput,
): AddHighlightMomentInput {
  const end = seasonClipDurationSec(clip);
  return {
    gameTime: 0,
    activeSourceId: sourceId,
    startOffsetSec: 0,
    endOffsetSec: end,
    label: clip.label,
  };
}

export type CreateSeasonHighlightResult = {
  gameId: string;
  draftId: string;
  clipCount: number;
};

/**
 * Create a private game, attach each clip as a YouTube source, and open a
 * highlight reel with one segment per clip (selection order preserved).
 */
export async function createSeasonHighlightFromClips(
  uid: string,
  clips: SeasonHighlightClipInput[],
  opts?: { name?: string; createdByName?: string },
): Promise<CreateSeasonHighlightResult> {
  if (clips.length === 0) {
    throw new Error("Select at least one clip.");
  }
  for (const clip of clips) {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(clip.youtubeVideoId)) {
      throw new Error(`Invalid YouTube id on “${clip.label}”.`);
    }
  }

  const name =
    opts?.name?.trim() ||
    `Season highlights · ${new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;

  const gameId = await createGame(uid, {
    title: name,
    visibility: "private",
  });

  const moments: AddHighlightMomentInput[] = [];
  for (const clip of clips) {
    const sourceId = await addGameSourceFromYouTubeUpload(gameId, uid, {
      videoId: clip.youtubeVideoId,
      label: clip.label,
      youtubePrivacyStatus: "unlisted",
      offsetFromGameTime: 0,
      syncStatus: "manually_synced",
      ...(typeof clip.durationSec === "number"
        ? { durationSec: clip.durationSec }
        : {}),
    });
    moments.push(momentInputForSeasonClip(sourceId, clip));
  }

  const draftId = await createHighlightReel(gameId, uid, {
    name,
    moments,
    ...(opts?.createdByName ? { createdByName: opts.createdByName } : {}),
  });

  // Mark inbox items reviewed so they leave the default unreviewed filter.
  await Promise.all(
    clips.map((clip) =>
      setFilmSourceReviewGame(uid, clip.id, gameId).catch(() => {
        /* non-fatal */
      }),
    ),
  );

  return { gameId, draftId, clipCount: clips.length };
}
