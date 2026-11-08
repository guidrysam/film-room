/**
 * Build a season highlight session from selected My Film YouTube clips.
 *
 * Flow:
 * 1. Private game + one YouTube source per clip (queue order)
 * 2. Auto-mark each clip as Live then baked Slow-mo (Game Cap format)
 * 3. Highlight reel from those marks (playback rate 1× — slomo is in the VOD)
 * 4. Film Room clip queue so you can browse / tweak marks like a session
 *
 * Team separation comes later.
 */

import { formatGameCapMogoDisplayName } from "@/lib/youtube/mogo-match";
import {
  createHighlightReel,
  type AddHighlightMomentInput,
} from "@/lib/highlight-draft";
import {
  addGameEvent,
  addGameSourceFromYouTubeUpload,
  createGame,
} from "@/lib/games";
import {
  setFilmSourceReviewGame,
  type FilmSource,
} from "@/lib/film-sources";
import { FILM_HIGHLIGHT_MAX_SEC } from "@/lib/film-source-filters";
import {
  openSeasonHighlightInFilmRoom,
  type SeasonRoomChapterSeed,
} from "@/lib/open-season-highlight-room";
import {
  seasonHighlightSegmentsForDuration,
  seasonSegmentMarkLabel,
} from "@/lib/season-highlight-split";

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

/** Reel moments for one clip: Live then Slow-mo (both speed 1). */
export function momentInputsForSeasonClip(
  sourceId: string,
  clip: SeasonHighlightClipInput,
): AddHighlightMomentInput[] {
  const duration = seasonClipDurationSec(clip);
  return seasonHighlightSegmentsForDuration(duration).map((seg) => ({
    gameTime: 0,
    activeSourceId: sourceId,
    startOffsetSec: seg.startSec,
    endOffsetSec: seg.endSec,
    label: seasonSegmentMarkLabel(clip.label, seg),
    speed: 1,
  }));
}

/** @deprecated Use momentInputsForSeasonClip (live + slomo). */
export function momentInputForSeasonClip(
  sourceId: string,
  clip: SeasonHighlightClipInput,
): AddHighlightMomentInput {
  const moments = momentInputsForSeasonClip(sourceId, clip);
  return moments[0] ?? {
    gameTime: 0,
    activeSourceId: sourceId,
    startOffsetSec: 0,
    endOffsetSec: seasonClipDurationSec(clip),
    label: clip.label,
  };
}

export function seasonHighlightChapterSeeds(
  clips: SeasonHighlightClipInput[],
): SeasonRoomChapterSeed[] {
  const chapters: SeasonRoomChapterSeed[] = [];
  for (const clip of clips) {
    const duration = seasonClipDurationSec(clip);
    for (const seg of seasonHighlightSegmentsForDuration(duration)) {
      chapters.push({
        time: seg.startSec,
        label: seasonSegmentMarkLabel(clip.label, seg),
        videoId: clip.youtubeVideoId,
      });
    }
  }
  return chapters;
}

export type CreateSeasonHighlightResult = {
  gameId: string;
  draftId: string;
  roomId: string;
  roomUrl: string;
  clipCount: number;
  markCount: number;
};

/**
 * Create a private game, auto-mark Live + Slow-mo per clip, build a reel from
 * those marks, and open a Film Room clip queue for the banquet session.
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
  let markCount = 0;

  for (const clip of clips) {
    const duration = seasonClipDurationSec(clip);
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

    const segs = seasonHighlightSegmentsForDuration(duration);
    for (const seg of segs) {
      const label = seasonSegmentMarkLabel(clip.label, seg);
      await addGameEvent(
        gameId,
        {
          type: "coach_mark",
          t: seg.startSec,
          label,
          sourceId,
          createdBy: uid,
          ...(opts?.createdByName
            ? { createdByName: opts.createdByName }
            : {}),
          payload: {
            videoId: clip.youtubeVideoId,
            seasonSegment: seg.kind,
            segmentStartSec: seg.startSec,
            segmentEndSec: seg.endSec,
            autoMarked: true,
          },
        },
        { actorUid: uid },
      );
      markCount += 1;
    }

    moments.push(...momentInputsForSeasonClip(sourceId, clip));
  }

  const draftId = await createHighlightReel(gameId, uid, {
    name,
    moments,
    ...(opts?.createdByName ? { createdByName: opts.createdByName } : {}),
  });

  const { roomId, url: roomUrl } = await openSeasonHighlightInFilmRoom(
    gameId,
    clips.map((c) => ({
      youtubeVideoId: c.youtubeVideoId,
      label: c.label,
    })),
    seasonHighlightChapterSeeds(clips),
    uid,
  );

  await Promise.all(
    clips.map((clip) =>
      setFilmSourceReviewGame(uid, clip.id, gameId).catch(() => {
        /* non-fatal */
      }),
    ),
  );

  return {
    gameId,
    draftId,
    roomId,
    roomUrl,
    clipCount: clips.length,
    markCount,
  };
}
