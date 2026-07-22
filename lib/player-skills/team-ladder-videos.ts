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
      ...prev,
      videoId,
      videoTitle,
    },
  };
  return writeLevels(teamId, levels);
}

/** Clear the coach-selected video; keep cached suggestions. */
export async function clearTeamLevelVideo(
  teamId: string,
  levelId: string,
): Promise<TeamBallMasteryLadder> {
  const current = await loadTeamBallMasteryLadder(teamId);
  const prev = current.levels[levelId] ?? emptyLevel();
  const levels = {
    ...current.levels,
    [levelId]: {
      suggestions: prev.suggestions,
      discardedSuggestionIds: prev.discardedSuggestionIds,
    },
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
  const levels = {
    ...current.levels,
    [levelId]: {
      ...prev,
      suggestions,
      discardedSuggestionIds: [],
    },
  };
  return writeLevels(teamId, levels);
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
  const clearedSelection =
    prev.videoId === videoId
      ? {
          suggestions: prev.suggestions,
          discardedSuggestionIds,
        }
      : {
          ...prev,
          discardedSuggestionIds,
        };
  const levels = {
    ...current.levels,
    [levelId]: clearedSelection,
  };
  return writeLevels(teamId, levels);
}
