import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";
import { getTacticsBoard } from "@/lib/tactics-boards";
import { listTacticsSteps } from "@/lib/tactics-steps";
import type {
  TacticsPreset,
  TeamTacticsPreset,
} from "@/lib/tactics-presets/types";
import { validateTacticsPreset } from "@/lib/tactics-presets/validation";
import { canCoachTeam, getTeam } from "@/lib/teams";

function teamPresetsCol(teamId: string) {
  return collection(firestore, "teams", teamId, "tacticsPresets");
}

function teamPresetRef(teamId: string, presetId: string) {
  return doc(teamPresetsCol(teamId), presetId);
}

function newTeamPresetId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `tp_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  }
  return `tp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function parseTeamPreset(
  teamId: string,
  id: string,
  raw: Record<string, unknown>,
): TeamTacticsPreset | null {
  const presetRaw =
    raw.preset && typeof raw.preset === "object"
      ? (raw.preset as TacticsPreset)
      : null;
  if (!presetRaw) return null;
  const preset: TacticsPreset = {
    ...presetRaw,
    id,
    version:
      typeof presetRaw.version === "number"
        ? Math.max(1, Math.floor(presetRaw.version))
        : 1,
  };
  if (!validateTacticsPreset(preset).valid) return null;
  const createdBy =
    typeof raw.createdBy === "string" ? raw.createdBy.trim() : "";
  if (!createdBy) return null;
  return {
    ...preset,
    teamId,
    sourceType: "team",
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
    createdBy,
    updatedBy:
      typeof raw.updatedBy === "string" ? raw.updatedBy : createdBy,
  };
}

async function requireCoach(teamId: string, uid: string): Promise<void> {
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only team coaches can manage team presets.");
  }
}

export async function listTeamTacticsPresets(
  teamId: string,
  uid: string,
): Promise<TeamTacticsPreset[]> {
  await requireCoach(teamId, uid);
  const snap = await getDocs(
    query(teamPresetsCol(teamId), orderBy("updatedAt", "desc")),
  );
  return snap.docs
    .map((row) =>
      parseTeamPreset(
        teamId,
        row.id,
        row.data() as Record<string, unknown>,
      ),
    )
    .filter((preset): preset is TeamTacticsPreset => Boolean(preset));
}

export async function getTeamTacticsPreset(
  teamId: string,
  presetId: string,
  uid: string,
): Promise<TeamTacticsPreset | null> {
  await requireCoach(teamId, uid);
  const snap = await getDoc(teamPresetRef(teamId, presetId));
  if (!snap.exists()) return null;
  return parseTeamPreset(
    teamId,
    snap.id,
    snap.data() as Record<string, unknown>,
  );
}

export async function saveBoardAsTeamPreset(
  teamId: string,
  boardId: string,
  uid: string,
  opts?: { title?: string },
): Promise<TeamTacticsPreset> {
  await requireCoach(teamId, uid);
  const [board, steps] = await Promise.all([
    getTacticsBoard(teamId, boardId),
    listTacticsSteps(teamId, boardId),
  ]);
  if (!board || steps.length === 0) {
    throw new Error("Board or steps could not be loaded.");
  }
  const presetId = newTeamPresetId();
  const playerIds = new Set(
    steps.flatMap((step) =>
      step.objects
        .filter((object) => object.type === "player")
        .map((object) => object.id),
    ),
  );
  const preset: TacticsPreset = {
    id: presetId,
    version: 1,
    title: opts?.title?.trim() || board.title,
    shortDescription: `Reusable team preset created from ${board.title}.`,
    kind: steps.length > 1 ? "tactical_sequence" : "formation",
    category: steps.length > 1 ? "attacking" : "formations",
    format:
      playerIds.size >= 10
        ? "11v11"
        : playerIds.size >= 8
          ? "9v9"
          : "small_sided",
    ...(playerIds.size > 0 ? { playerCount: playerIds.size } : {}),
    difficulty: "developing",
    fieldOrientation: board.fieldOrientation,
    fieldView: board.fieldView,
    fieldArea: board.fieldView === "full" ? "full" : "half",
    objectives: ["Provide a reusable starting point for this team."],
    setupInstructions: [
      "Review the copied positions, labels, and field area before use.",
    ],
    coachingPoints: [
      "Adapt the preset to the players, context, and learning objective.",
    ],
    playbackSettings: { ...board.playbackSettings },
    steps: steps.map((step, index) => ({
      id: `step-${index + 1}`,
      order: index,
      title: step.title,
      ...(step.notes ? { notes: step.notes } : {}),
      ...(step.durationMs !== undefined
        ? { durationMs: step.durationMs }
        : {}),
      objects: step.objects,
    })),
    tags: ["team preset", board.title.toLocaleLowerCase()],
  };

  try {
    await setDoc(teamPresetRef(teamId, presetId), {
      teamId,
      preset,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    });
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not save team preset.");
  }
  const saved = await getTeamTacticsPreset(teamId, presetId, uid);
  if (!saved) throw new Error("Team preset saved but could not be loaded.");
  return saved;
}

export async function updateTeamPresetFromBoard(
  teamId: string,
  presetId: string,
  boardId: string,
  uid: string,
): Promise<TeamTacticsPreset> {
  await requireCoach(teamId, uid);
  const [current, board, steps] = await Promise.all([
    getTeamTacticsPreset(teamId, presetId, uid),
    getTacticsBoard(teamId, boardId),
    listTacticsSteps(teamId, boardId),
  ]);
  if (!current || !board || steps.length === 0) {
    throw new Error("Team preset or board could not be loaded.");
  }
  const nextPreset: TacticsPreset = {
    id: presetId,
    version: current.version + 1,
    title: board.title,
    shortDescription: current.shortDescription,
    kind: steps.length > 1 ? "tactical_sequence" : current.kind,
    category: current.category,
    format: current.format,
    ...(current.playerCount !== undefined
      ? { playerCount: current.playerCount }
      : {}),
    ...(current.goalkeeperCount !== undefined
      ? { goalkeeperCount: current.goalkeeperCount }
      : {}),
    ...(current.ageGuidance ? { ageGuidance: current.ageGuidance } : {}),
    difficulty: current.difficulty,
    ...(current.estimatedMinutes !== undefined
      ? { estimatedMinutes: current.estimatedMinutes }
      : {}),
    fieldOrientation: board.fieldOrientation,
    fieldView: board.fieldView,
    fieldArea: board.fieldView === "full" ? "full" : "half",
    objectives: [...current.objectives],
    setupInstructions: [...current.setupInstructions],
    ...(current.activityInstructions
      ? { activityInstructions: [...current.activityInstructions] }
      : {}),
    coachingPoints: [...current.coachingPoints],
    ...(current.progressions
      ? { progressions: [...current.progressions] }
      : {}),
    ...(current.regressions
      ? { regressions: [...current.regressions] }
      : {}),
    ...(current.safetyNotes
      ? { safetyNotes: [...current.safetyNotes] }
      : {}),
    ...(current.equipment ? { equipment: { ...current.equipment } } : {}),
    playbackSettings: { ...board.playbackSettings },
    steps: steps.map((step, index) => ({
      id: `step-${index + 1}`,
      order: index,
      title: step.title,
      ...(step.notes ? { notes: step.notes } : {}),
      ...(step.durationMs !== undefined
        ? { durationMs: step.durationMs }
        : {}),
      objects: step.objects,
    })),
    tags: [...current.tags],
  };
  return updateTeamTacticsPreset(teamId, presetId, uid, {
    preset: nextPreset,
  });
}

export async function updateTeamTacticsPreset(
  teamId: string,
  presetId: string,
  uid: string,
  patch: { title?: string; preset?: TacticsPreset },
): Promise<TeamTacticsPreset> {
  await requireCoach(teamId, uid);
  const current = await getTeamTacticsPreset(teamId, presetId, uid);
  if (!current) throw new Error("Team preset not found.");
  const nextPreset: TacticsPreset = patch.preset
    ? { ...patch.preset, id: presetId, version: current.version + 1 }
    : {
        ...current,
        title: patch.title?.trim() || current.title,
        version: current.version + 1,
      };
  const validation = validateTacticsPreset(nextPreset);
  if (!validation.valid) throw new Error(validation.errors[0]);
  await updateDoc(teamPresetRef(teamId, presetId), {
    preset: nextPreset,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  const updated = await getTeamTacticsPreset(teamId, presetId, uid);
  if (!updated) throw new Error("Team preset updated but could not be loaded.");
  return updated;
}

export async function duplicateTeamTacticsPreset(
  teamId: string,
  presetId: string,
  uid: string,
): Promise<TeamTacticsPreset> {
  await requireCoach(teamId, uid);
  const current = await getTeamTacticsPreset(teamId, presetId, uid);
  if (!current) throw new Error("Team preset not found.");
  const nextId = newTeamPresetId();
  const preset: TacticsPreset = {
    ...current,
    id: nextId,
    version: 1,
    title: `${current.title} — copy`,
    steps: current.steps.map((step) => ({
      ...step,
      objects: step.objects.map((object) =>
        "points" in object
          ? {
              ...object,
              points: object.points.map((point) => ({ ...point })),
            }
          : { ...object },
      ),
    })),
  };
  await setDoc(teamPresetRef(teamId, nextId), {
    teamId,
    preset,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  const copy = await getTeamTacticsPreset(teamId, nextId, uid);
  if (!copy) throw new Error("Team preset copied but could not be loaded.");
  return copy;
}

export async function deleteTeamTacticsPreset(
  teamId: string,
  presetId: string,
  uid: string,
): Promise<void> {
  await requireCoach(teamId, uid);
  await deleteDoc(teamPresetRef(teamId, presetId));
}
