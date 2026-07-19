/**
 * Idempotent migration: legacy board.objects → steps/Step 1.
 */

import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { DEFAULT_PLAYBACK_SETTINGS } from "@/lib/tactics-animation";
import {
  getTacticsBoard,
  type TacticsBoard,
  type TacticsBoardObject,
} from "@/lib/tactics-boards";
import {
  buildPreviewObjects,
  defaultStepTitle,
  listTacticsSteps,
  newStepId,
  writeTacticsStepDoc,
  type TacticsStep,
} from "@/lib/tactics-steps";

export type MigratedTacticsBoard = {
  board: TacticsBoard;
  steps: TacticsStep[];
  migrated: boolean;
};

/**
 * Ensure the board has at least one step document.
 * - If steps already exist: no-op (idempotent).
 * - If legacy `objects` exist: create Step 1 from them.
 * - Otherwise: create an empty Step 1.
 * Legacy `objects` are retained until migration succeeds.
 */
export async function ensureTacticsBoardMigrated(
  teamId: string,
  boardId: string,
  uid: string,
): Promise<MigratedTacticsBoard> {
  const board = await getTacticsBoard(teamId, boardId);
  if (!board) throw new Error("Board not found.");

  const existing = await listTacticsSteps(teamId, boardId);
  if (existing.length > 0) {
    // Backfill board metadata if missing.
    if (
      !board.activeStepId ||
      board.stepCount !== existing.length ||
      !board.playbackSettings
    ) {
      const activeStepId =
        board.activeStepId && existing.some((s) => s.id === board.activeStepId)
          ? board.activeStepId
          : existing[0]!.id;
      await updateDoc(doc(firestore, "teams", teamId, "tactics", boardId), {
        activeStepId,
        stepCount: existing.length,
        playbackSettings: board.playbackSettings ?? {
          ...DEFAULT_PLAYBACK_SETTINGS,
        },
        previewObjects:
          board.previewObjects.length > 0
            ? board.previewObjects
            : buildPreviewObjects(existing[0]!.objects),
        updatedAt: serverTimestamp(),
      });
      const refreshed = await getTacticsBoard(teamId, boardId);
      return {
        board: refreshed ?? board,
        steps: existing,
        migrated: false,
      };
    }
    return { board, steps: existing, migrated: false };
  }

  // No steps yet — migrate from legacy objects (or empty).
  const stepId = newStepId();
  const objects: TacticsBoardObject[] = board.objects ?? [];
  await writeTacticsStepDoc(teamId, boardId, stepId, uid, {
    order: 0,
    title: defaultStepTitle(0),
    objects,
  });

  // Confirm step exists before marking migration metadata.
  const steps = await listTacticsSteps(teamId, boardId);
  if (steps.length === 0) {
    throw new Error("Migration failed: step was not created.");
  }

  await updateDoc(doc(firestore, "teams", teamId, "tactics", boardId), {
    activeStepId: stepId,
    stepCount: 1,
    playbackSettings: board.playbackSettings ?? {
      ...DEFAULT_PLAYBACK_SETTINGS,
    },
    previewObjects: buildPreviewObjects(objects),
    // Keep legacy objects for safety; stop relying on them in the editor.
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });

  const refreshed = await getTacticsBoard(teamId, boardId);
  return {
    board: refreshed ?? { ...board, activeStepId: stepId, stepCount: 1 },
    steps,
    migrated: true,
  };
}

/** Detect whether a raw board doc still looks legacy (no steps metadata). */
export function boardNeedsStepMigration(
  board: TacticsBoard,
  stepCountFromQuery?: number,
): boolean {
  if (typeof stepCountFromQuery === "number" && stepCountFromQuery > 0) {
    return false;
  }
  if (board.activeStepId && board.stepCount > 0) return false;
  return true;
}

/** Test helper: pure transform of legacy objects → step payload. */
export function buildLegacyStepPayload(
  boardId: string,
  objects: TacticsBoardObject[],
  uid: string,
): {
  boardId: string;
  order: number;
  title: string;
  objects: TacticsBoardObject[];
  version: number;
  createdBy: string;
  updatedBy: string;
} {
  return {
    boardId,
    order: 0,
    title: defaultStepTitle(0),
    objects: [...objects],
    version: 1,
    createdBy: uid,
    updatedBy: uid,
  };
}

/** Used by tests / diagnostics. */
export async function countTacticsSteps(
  teamId: string,
  boardId: string,
): Promise<number> {
  const steps = await listTacticsSteps(teamId, boardId);
  return steps.length;
}
