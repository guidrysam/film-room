import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  BALL_MASTERY_LADDER_ID,
  BALL_MASTERY_LEVELS,
} from "@/lib/player-skills/ball-mastery-ladder";

export type TeamLadderSuggestion = {
  videoId: string;
  title: string;
  channelTitle?: string;
  thumbnailUrl?: string | null;
  watchUrl?: string;
  embedUrl?: string;
};

export type TeamLadderLevelEntry = {
  /** Coach-selected video shown to players. */
  videoId?: string;
  videoTitle?: string;
  /** Team game used for Review marks + Team Film Room for this drill. */
  reviewGameId?: string;
  /** YouTube id the reviewGameId was created for (invalidate on video change). */
  reviewVideoId?: string;
  /** Cached YouTube suggestions — kept until coach refreshes. */
  suggestions: TeamLadderSuggestion[];
  /** Suggestion ids the coach discarded (persist across visits). */
  discardedSuggestionIds: string[];
};

export type TeamBallMasteryLadder = {
  ladderId: typeof BALL_MASTERY_LADDER_ID;
  levels: Record<string, TeamLadderLevelEntry>;
  updatedAt: Timestamp | null;
};

function teamLadderRef(teamId: string) {
  return doc(
    firestore,
    "teams",
    teamId,
    "skillLadders",
    BALL_MASTERY_LADDER_ID,
  );
}

function emptyLevel(): TeamLadderLevelEntry {
  return { suggestions: [], discardedSuggestionIds: [] };
}

/** First suggestion the coach has not discarded. */
export function firstAvailableSuggestion(
  entry: TeamLadderLevelEntry | undefined,
): TeamLadderSuggestion | null {
  if (!entry) return null;
  const discarded = new Set(entry.discardedSuggestionIds);
  return (
    entry.suggestions.find((video) => !discarded.has(video.videoId)) ?? null
  );
}

/**
 * Video shown to players: coach selection, else first non-discarded suggestion.
 */
export function resolveLevelTeachingVideo(
  entry: TeamLadderLevelEntry | undefined,
): { videoId: string; videoTitle: string } | null {
  if (!entry) return null;
  if (entry.videoId) {
    return {
      videoId: entry.videoId,
      videoTitle: entry.videoTitle?.trim() || "Teaching video",
    };
  }
  const fallback = firstAvailableSuggestion(entry);
  if (!fallback) return null;
  return { videoId: fallback.videoId, videoTitle: fallback.title };
}

function withDefaultSelection(
  entry: TeamLadderLevelEntry,
): TeamLadderLevelEntry {
  if (entry.videoId) return entry;
  const fallback = firstAvailableSuggestion(entry);
  if (!fallback) return entry;
  const keepReview =
    entry.reviewGameId && entry.reviewVideoId === fallback.videoId
      ? {
          reviewGameId: entry.reviewGameId,
          reviewVideoId: entry.reviewVideoId,
        }
      : {};
  return {
    suggestions: entry.suggestions,
    discardedSuggestionIds: entry.discardedSuggestionIds,
    videoId: fallback.videoId,
    videoTitle: fallback.title,
    ...keepReview,
  };
}

/** Keep review game link only when it still matches this YouTube id. */
function reviewLinkForVideo(
  entry: TeamLadderLevelEntry,
  videoId: string | undefined,
): Pick<TeamLadderLevelEntry, "reviewGameId" | "reviewVideoId"> {
  if (
    videoId &&
    entry.reviewGameId &&
    entry.reviewVideoId === videoId
  ) {
    return {
      reviewGameId: entry.reviewGameId,
      reviewVideoId: entry.reviewVideoId,
    };
  }
  return {};
}

function parseSuggestion(raw: unknown): TeamLadderSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.videoId !== "string" || !e.videoId.trim()) return null;
  if (typeof e.title !== "string" || !e.title.trim()) return null;
  return {
    videoId: e.videoId.trim(),
    title: e.title.trim(),
    ...(typeof e.channelTitle === "string"
      ? { channelTitle: e.channelTitle }
      : {}),
    ...(e.thumbnailUrl === null || typeof e.thumbnailUrl === "string"
      ? { thumbnailUrl: e.thumbnailUrl }
      : {}),
    ...(typeof e.watchUrl === "string" ? { watchUrl: e.watchUrl } : {}),
    ...(typeof e.embedUrl === "string" ? { embedUrl: e.embedUrl } : {}),
  };
}

function parseLevelEntry(raw: unknown): TeamLadderLevelEntry {
  if (!raw || typeof raw !== "object") return emptyLevel();
  const e = raw as Record<string, unknown>;
  const suggestions = Array.isArray(e.suggestions)
    ? e.suggestions
        .map(parseSuggestion)
        .filter((s): s is TeamLadderSuggestion => Boolean(s))
    : [];
  const discardedSuggestionIds = Array.isArray(e.discardedSuggestionIds)
    ? e.discardedSuggestionIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  return {
    ...(typeof e.videoId === "string" && e.videoId.trim()
      ? { videoId: e.videoId.trim() }
      : {}),
    ...(typeof e.videoTitle === "string" && e.videoTitle.trim()
      ? { videoTitle: e.videoTitle.trim() }
      : {}),
    ...(typeof e.reviewGameId === "string" && e.reviewGameId.trim()
      ? { reviewGameId: e.reviewGameId.trim() }
      : {}),
    ...(typeof e.reviewVideoId === "string" && e.reviewVideoId.trim()
      ? { reviewVideoId: e.reviewVideoId.trim() }
      : {}),
    suggestions,
    discardedSuggestionIds,
  };
}

function parseTeamLadder(
  raw: Record<string, unknown> | undefined,
): TeamBallMasteryLadder {
  const levels: Record<string, TeamLadderLevelEntry> = {};
  const levelsRaw =
    raw?.levels && typeof raw.levels === "object"
      ? (raw.levels as Record<string, unknown>)
      : {};
  for (const level of BALL_MASTERY_LEVELS) {
    levels[level.id] = parseLevelEntry(levelsRaw[level.id]);
  }
  return {
    ladderId: BALL_MASTERY_LADDER_ID,
    levels,
    updatedAt: raw?.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

async function writeLevels(
  teamId: string,
  levels: Record<string, TeamLadderLevelEntry>,
): Promise<TeamBallMasteryLadder> {
  await setDoc(
    teamLadderRef(teamId),
    {
      ladderId: BALL_MASTERY_LADDER_ID,
      levels,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return {
    ladderId: BALL_MASTERY_LADDER_ID,
    levels,
    updatedAt: null,
  };
}

export async function loadTeamBallMasteryLadder(
  teamId: string,
): Promise<TeamBallMasteryLadder> {
  const snap = await getDoc(teamLadderRef(teamId));
  if (!snap.exists()) {
    const levels: Record<string, TeamLadderLevelEntry> = {};
    for (const level of BALL_MASTERY_LEVELS) {
      levels[level.id] = emptyLevel();
    }
    return { ladderId: BALL_MASTERY_LADDER_ID, levels, updatedAt: null };
  }
  return parseTeamLadder(snap.data() as Record<string, unknown>);
}

export async function setTeamLevelVideo(
  teamId: string,
  levelId: string,
  videoId: string,
  videoTitle: string,
): Promise<TeamBallMasteryLadder> {
  const current = await loadTeamBallMasteryLadder(teamId);
  const prev = current.levels[levelId] ?? emptyLevel();
  const levels = {
    ...current.levels,
    [levelId]: {
      suggestions: prev.suggestions,
      discardedSuggestionIds: prev.discardedSuggestionIds,
      videoId,
      videoTitle,
      ...reviewLinkForVideo(prev, videoId),
    },
  };
  return writeLevels(teamId, levels);
}

/** Link a Review / Team Film Room game to this ladder level. */
export async function setTeamLevelReviewGame(
  teamId: string,
  levelId: string,
  reviewGameId: string,
  reviewVideoId: string,
): Promise<TeamBallMasteryLadder> {
  const current = await loadTeamBallMasteryLadder(teamId);
  const prev = current.levels[levelId] ?? emptyLevel();
  const levels = {
    ...current.levels,
    [levelId]: {
      ...prev,
      reviewGameId,
      reviewVideoId,
    },
  };
  return writeLevels(teamId, levels);
}

/** Clear the coach-selected video; keep cached suggestions and pick next default. */
export async function clearTeamLevelVideo(
  teamId: string,
  levelId: string,
): Promise<TeamBallMasteryLadder> {
  const current = await loadTeamBallMasteryLadder(teamId);
  const prev = current.levels[levelId] ?? emptyLevel();
  const levels = {
    ...current.levels,
    [levelId]: withDefaultSelection({
      suggestions: prev.suggestions,
      discardedSuggestionIds: prev.discardedSuggestionIds,
    }),
  };
  return writeLevels(teamId, levels);
}

/** Persist YouTube search results for a level (replaces previous suggestion cache). */
export async function setTeamLevelSuggestions(
  teamId: string,
  levelId: string,
  suggestions: TeamLadderSuggestion[],
): Promise<TeamBallMasteryLadder> {
  const current = await loadTeamBallMasteryLadder(teamId);
  const prev = current.levels[levelId] ?? emptyLevel();
  const keepSelection =
    prev.videoId && suggestions.some((s) => s.videoId === prev.videoId)
      ? {
          videoId: prev.videoId,
          videoTitle: prev.videoTitle,
          ...reviewLinkForVideo(prev, prev.videoId),
        }
      : {};
  const levels = {
    ...current.levels,
    [levelId]: withDefaultSelection({
      suggestions,
      discardedSuggestionIds: [],
      ...keepSelection,
    }),
  };
  return writeLevels(teamId, levels);
}

/**
 * If suggestions exist but no video is selected, persist the first available
 * as the team teaching video (backfill for older caches).
 */
export async function ensureTeamLevelDefaultVideo(
  teamId: string,
  levelId: string,
): Promise<TeamBallMasteryLadder> {
  const current = await loadTeamBallMasteryLadder(teamId);
  const prev = current.levels[levelId] ?? emptyLevel();
  if (prev.videoId) return current;
  const fallback = firstAvailableSuggestion(prev);
  if (!fallback) return current;
  return setTeamLevelVideo(
    teamId,
    levelId,
    fallback.videoId,
    fallback.title,
  );
}

export async function discardTeamLevelSuggestion(
  teamId: string,
  levelId: string,
  videoId: string,
): Promise<TeamBallMasteryLadder> {
  const current = await loadTeamBallMasteryLadder(teamId);
  const prev = current.levels[levelId] ?? emptyLevel();
  const discardedSuggestionIds = prev.discardedSuggestionIds.includes(videoId)
    ? prev.discardedSuggestionIds
    : [...prev.discardedSuggestionIds, videoId];
  const base: TeamLadderLevelEntry =
    prev.videoId === videoId
      ? {
          suggestions: prev.suggestions,
          discardedSuggestionIds,
        }
      : {
          suggestions: prev.suggestions,
          discardedSuggestionIds,
          ...(prev.videoId
            ? { videoId: prev.videoId, videoTitle: prev.videoTitle }
            : {}),
          ...reviewLinkForVideo(prev, prev.videoId),
        };
  const levels = {
    ...current.levels,
    [levelId]: withDefaultSelection(base),
  };
  return writeLevels(teamId, levels);
}
