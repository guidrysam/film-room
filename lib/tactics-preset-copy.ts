import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";
import { deepCloneObjects } from "@/lib/tactics-animation";
import {
  generateTacticsBoardId,
  getTacticsBoard,
  type TacticsBoard,
  type TacticsBoardObject,
} from "@/lib/tactics-boards";
import { buildPreviewObjects, newStepId } from "@/lib/tactics-steps";
import type {
  PresetSource,
  TacticsPreset,
  TacticsPresetStep,
  TacticsPresetSourceType,
} from "@/lib/tactics-presets/types";
import { validateTacticsPreset } from "@/lib/tactics-presets/validation";
import { canCoachTeam, getTeam } from "@/lib/teams";

export function clonePresetSteps(
  preset: TacticsPreset,
): Array<{
  sourceStepId: string;
  order: number;
  title: string;
  notes?: string;
  durationMs?: number;
  objects: TacticsBoardObject[];
}> {
  const notesFor = (step: TacticsPresetStep): string | undefined => {
    const instructional = [
      step.explanation,
      step.coachCue ? `Coach cue: “${step.coachCue}”` : undefined,
      step.playerAction ? `Players: ${step.playerAction}` : undefined,
      step.ballAction ? `Ball: ${step.ballAction}` : undefined,
      step.notes,
    ].filter((value): value is string => Boolean(value?.trim()));
    return instructional.length > 0 ? instructional.join("\n\n") : undefined;
  };
  return preset.steps.map((step) => {
    const notes = notesFor(step);
    return {
      sourceStepId: step.id,
      order: step.order,
      title: step.title,
      ...(notes ? { notes } : {}),
      ...(step.durationMs !== undefined ? { durationMs: step.durationMs } : {}),
      objects: deepCloneObjects(step.objects),
    };
  });
}

export function buildPresetSource(
  preset: TacticsPreset,
  sourceType: TacticsPresetSourceType,
): PresetSource {
  return {
    presetId: preset.id,
    presetVersion: preset.version,
    presetTitle: preset.title,
    sourceType,
  };
}

/**
 * Copy a built-in or team preset into an independent team-owned board.
 * Step document IDs are new; tactical object IDs remain stable across steps.
 */
export async function createBoardFromPreset(
  teamId: string,
  uid: string,
  preset: TacticsPreset,
  sourceType: TacticsPresetSourceType,
  displayName?: string | null,
): Promise<TacticsBoard> {
  const validation = validateTacticsPreset(preset, {
    allowLegacyDrill: sourceType === "team",
  });
  if (!validation.valid) {
    throw new Error(`This preset is invalid: ${validation.errors[0]}`);
  }
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only coaches can add tactics presets.");
  }

  const boardId = generateTacticsBoardId();
  const copiedSteps = clonePresetSteps(preset);
  const stepIds = copiedSteps.map(() => newStepId());
  const firstStep = copiedSteps[0]!;
  const firstStepId = stepIds[0]!;
  const name = displayName?.trim();
  const boardRef = doc(firestore, "teams", teamId, "tactics", boardId);
  const presetSource = buildPresetSource(preset, sourceType);

  // Parent first: nested-step rules resolve the owning board document.
  try {
    await setDoc(boardRef, {
      teamId,
      title: preset.title,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
      ...(name ? { createdByName: name, updatedByName: name } : {}),
      sport: "soccer",
      fieldOrientation: preset.fieldOrientation,
      fieldView: preset.fieldView,
      visibility: "team_coaches",
      objects: [] as TacticsBoardObject[],
      previewObjects: buildPreviewObjects(firstStep.objects),
      activeStepId: firstStepId,
      stepCount: copiedSteps.length,
      playbackSettings: { ...preset.playbackSettings },
      presetSource,
      version: 1,
    });

    const batch = writeBatch(firestore);
    copiedSteps.forEach((step, index) => {
      batch.set(
        doc(
          firestore,
          "teams",
          teamId,
          "tactics",
          boardId,
          "steps",
          stepIds[index]!,
        ),
        {
          boardId,
          order: index,
          title: step.title,
          ...(step.notes ? { notes: step.notes } : {}),
          ...(step.durationMs !== undefined
            ? { durationMs: step.durationMs }
            : {}),
          objects: step.objects,
          version: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid,
          updatedBy: uid,
        },
      );
    });
    await batch.commit();
    await updateDoc(boardRef, {
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw formatFirestoreWriteError(error, "Could not use this preset.");
  }

  const board = await getTacticsBoard(teamId, boardId);
  if (!board) {
    throw new Error("Preset board was created but could not be loaded.");
  }
  return board;
}
