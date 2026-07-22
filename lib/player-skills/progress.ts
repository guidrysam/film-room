import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  BALL_MASTERY_LADDER_ID,
  BALL_MASTERY_LEVELS,
  getBallMasteryLevel,
  getNextBallMasteryLevel,
} from "@/lib/player-skills/ball-mastery-ladder";

export type SkillLevelStatus = "locked" | "active" | "mastered";

export type SkillLevelProgress = {
  status: SkillLevelStatus;
  videoId?: string;
  videoTitle?: string;
  /** When true, do not auto-pin the first YouTube search result. */
  skipAutoSuggest?: boolean;
  masteredAt?: Timestamp | null;
};

export type BallMasteryProgress = {
  ladderId: typeof BALL_MASTERY_LADDER_ID;
  status: "assigned" | "in_progress" | "completed";
  currentLevelId: string;
  masteredLevelIds: string[];
  levels: Record<string, SkillLevelProgress>;
  updatedAt: Timestamp | null;
};

function progressRef(uid: string) {
  return doc(
    firestore,
    "users",
    uid,
    "skillLadders",
    BALL_MASTERY_LADDER_ID,
  );
}

function initialLevels(): Record<string, SkillLevelProgress> {
  const levels: Record<string, SkillLevelProgress> = {};
  for (const level of BALL_MASTERY_LEVELS) {
    levels[level.id] = {
      status: level.order === 1 ? "active" : "locked",
    };
  }
  return levels;
}

function parseProgress(
  raw: Record<string, unknown> | undefined,
): BallMasteryProgress | null {
  if (!raw) return null;
  const first = BALL_MASTERY_LEVELS[0];
  if (!first) return null;
  const levelsRaw =
    raw.levels && typeof raw.levels === "object"
      ? (raw.levels as Record<string, unknown>)
      : {};
  const levels: Record<string, SkillLevelProgress> = {};
  for (const level of BALL_MASTERY_LEVELS) {
    const entry = levelsRaw[level.id];
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      const status =
        e.status === "locked" || e.status === "active" || e.status === "mastered"
          ? e.status
          : level.order === 1
            ? "active"
            : "locked";
      levels[level.id] = {
        status,
        ...(typeof e.videoId === "string" ? { videoId: e.videoId } : {}),
        ...(typeof e.videoTitle === "string"
          ? { videoTitle: e.videoTitle }
          : {}),
        ...(e.skipAutoSuggest === true ? { skipAutoSuggest: true } : {}),
        masteredAt:
          e.masteredAt instanceof Timestamp ? e.masteredAt : null,
      };
    } else {
      levels[level.id] = {
        status: level.order === 1 ? "active" : "locked",
      };
    }
  }
  const masteredLevelIds = Array.isArray(raw.masteredLevelIds)
    ? raw.masteredLevelIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const currentLevelId =
    typeof raw.currentLevelId === "string" && getBallMasteryLevel(raw.currentLevelId)
      ? raw.currentLevelId
      : first.id;
  const status =
    raw.status === "assigned" ||
    raw.status === "in_progress" ||
    raw.status === "completed"
      ? raw.status
      : "assigned";

  return {
    ladderId: BALL_MASTERY_LADDER_ID,
    status,
    currentLevelId,
    masteredLevelIds,
    levels,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

export function ballMasterySummary(progress: BallMasteryProgress): {
  masteredCount: number;
  total: number;
  currentTitle: string;
  label: string;
} {
  const total = BALL_MASTERY_LEVELS.length;
  const masteredCount = progress.masteredLevelIds.length;
  const current = getBallMasteryLevel(progress.currentLevelId);
  const currentTitle = current?.title ?? "Ball mastery";
  if (progress.status === "completed") {
    return {
      masteredCount,
      total,
      currentTitle,
      label: `Complete · ${total} levels`,
    };
  }
  return {
    masteredCount,
    total,
    currentTitle,
    label: `Level ${current?.order ?? masteredCount + 1} of ${total} · ${currentTitle}`,
  };
}

/** Create assignment if missing; return current progress. */
export async function ensureBallMasteryAssignment(
  uid: string,
): Promise<BallMasteryProgress> {
  const ref = progressRef(uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const parsed = parseProgress(snap.data() as Record<string, unknown>);
    if (parsed) return parsed;
  }

  const first = BALL_MASTERY_LEVELS[0];
  if (!first) throw new Error("Ball mastery ladder has no levels.");

  const docData = {
    ladderId: BALL_MASTERY_LADDER_ID,
    status: "assigned" as const,
    currentLevelId: first.id,
    masteredLevelIds: [] as string[],
    levels: initialLevels(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, docData);
  return {
    ladderId: BALL_MASTERY_LADDER_ID,
    status: "assigned",
    currentLevelId: first.id,
    masteredLevelIds: [],
    levels: initialLevels(),
    updatedAt: null,
  };
}

export async function loadBallMasteryProgress(
  uid: string,
): Promise<BallMasteryProgress | null> {
  const snap = await getDoc(progressRef(uid));
  if (!snap.exists()) return null;
  return parseProgress(snap.data() as Record<string, unknown>);
}

export async function pinLevelVideo(
  uid: string,
  levelId: string,
  videoId: string,
  videoTitle: string,
): Promise<BallMasteryProgress> {
  const progress = await ensureBallMasteryAssignment(uid);
  const level = progress.levels[levelId];
  if (!level || level.status === "locked") {
    throw new Error("That level is locked.");
  }
  const nextLevels = {
    ...progress.levels,
    [levelId]: {
      ...level,
      videoId,
      videoTitle,
      skipAutoSuggest: false,
    },
  };
  await updateDoc(progressRef(uid), {
    levels: nextLevels,
    status: progress.status === "assigned" ? "in_progress" : progress.status,
    updatedAt: serverTimestamp(),
  });
  return {
    ...progress,
    status: progress.status === "assigned" ? "in_progress" : progress.status,
    levels: nextLevels,
  };
}

/** Remove the pinned video and stop auto-picking search suggestions. */
export async function clearLevelVideo(
  uid: string,
  levelId: string,
): Promise<BallMasteryProgress> {
  const progress = await ensureBallMasteryAssignment(uid);
  const level = progress.levels[levelId];
  if (!level || level.status === "locked") {
    throw new Error("That level is locked.");
  }
  const nextLevels = {
    ...progress.levels,
    [levelId]: {
      status: level.status,
      skipAutoSuggest: true,
      ...(level.masteredAt ? { masteredAt: level.masteredAt } : {}),
    },
  };
  await updateDoc(progressRef(uid), {
    levels: nextLevels,
    updatedAt: serverTimestamp(),
  });
  return {
    ...progress,
    levels: nextLevels,
  };
}

export async function masterLevel(
  uid: string,
  levelId: string,
): Promise<BallMasteryProgress> {
  const progress = await ensureBallMasteryAssignment(uid);
  const levelDef = getBallMasteryLevel(levelId);
  if (!levelDef) throw new Error("Unknown level.");

  const level = progress.levels[levelId];
  if (!level || level.status === "locked") {
    throw new Error("That level is locked.");
  }
  if (level.status === "mastered") {
    return progress;
  }
  if (progress.currentLevelId !== levelId && level.status !== "active") {
    throw new Error("Finish your current level first.");
  }

  // Prior levels must be mastered
  for (const prior of BALL_MASTERY_LEVELS) {
    if (prior.order >= levelDef.order) break;
    if (!progress.masteredLevelIds.includes(prior.id)) {
      throw new Error("Master earlier levels first.");
    }
  }

  const next = getNextBallMasteryLevel(levelId);
  const masteredLevelIds = progress.masteredLevelIds.includes(levelId)
    ? progress.masteredLevelIds
    : [...progress.masteredLevelIds, levelId];

  const nextLevels: Record<string, SkillLevelProgress> = {
    ...progress.levels,
    [levelId]: {
      ...level,
      status: "mastered",
      masteredAt: Timestamp.now(),
    },
  };

  let currentLevelId = progress.currentLevelId;
  let status: BallMasteryProgress["status"] = "in_progress";

  if (next) {
    currentLevelId = next.id;
    nextLevels[next.id] = {
      ...nextLevels[next.id],
      status: "active",
    };
  } else {
    status = "completed";
    currentLevelId = levelId;
  }

  await updateDoc(progressRef(uid), {
    levels: nextLevels,
    masteredLevelIds,
    currentLevelId,
    status,
    updatedAt: serverTimestamp(),
  });

  return {
    ladderId: BALL_MASTERY_LADDER_ID,
    status,
    currentLevelId,
    masteredLevelIds,
    levels: nextLevels,
    updatedAt: null,
  };
}
