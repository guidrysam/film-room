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

export type TeamLadderLevelVideo = {
  videoId: string;
  videoTitle: string;
};

export type TeamBallMasteryLadder = {
  ladderId: typeof BALL_MASTERY_LADDER_ID;
  levels: Record<string, TeamLadderLevelVideo>;
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

function parseTeamLadder(
  raw: Record<string, unknown> | undefined,
): TeamBallMasteryLadder {
  const levels: Record<string, TeamLadderLevelVideo> = {};
  const levelsRaw =
    raw?.levels && typeof raw.levels === "object"
      ? (raw.levels as Record<string, unknown>)
      : {};
  for (const level of BALL_MASTERY_LEVELS) {
    const entry = levelsRaw[level.id];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.videoId !== "string" || !e.videoId.trim()) continue;
    levels[level.id] = {
      videoId: e.videoId.trim(),
      videoTitle:
        typeof e.videoTitle === "string" && e.videoTitle.trim()
          ? e.videoTitle.trim()
          : "Teaching video",
    };
  }
  return {
    ladderId: BALL_MASTERY_LADDER_ID,
    levels,
    updatedAt: raw?.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

export async function loadTeamBallMasteryLadder(
  teamId: string,
): Promise<TeamBallMasteryLadder> {
  const snap = await getDoc(teamLadderRef(teamId));
  if (!snap.exists()) {
    return { ladderId: BALL_MASTERY_LADDER_ID, levels: {}, updatedAt: null };
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
  const levels = {
    ...current.levels,
    [levelId]: { videoId, videoTitle },
  };
  await setDoc(
    teamLadderRef(teamId),
    {
      ladderId: BALL_MASTERY_LADDER_ID,
      levels,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { ladderId: BALL_MASTERY_LADDER_ID, levels, updatedAt: null };
}

export async function clearTeamLevelVideo(
  teamId: string,
  levelId: string,
): Promise<TeamBallMasteryLadder> {
  const current = await loadTeamBallMasteryLadder(teamId);
  const levels = { ...current.levels };
  delete levels[levelId];
  await setDoc(
    teamLadderRef(teamId),
    {
      ladderId: BALL_MASTERY_LADDER_ID,
      levels,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { ladderId: BALL_MASTERY_LADDER_ID, levels, updatedAt: null };
}
