/**
 * Tactics board steps subcollection CRUD.
 *
 * Layout:
 *   teams/{teamId}/tactics/{boardId}/steps/{stepId}
 */

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
  writeBatch,
  type CollectionReference,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";
import { deepCloneObjects } from "@/lib/tactics-animation";
import {
  canEditTacticsBoard,
  canViewTacticsBoard,
  getTacticsBoard,
  parseTacticsBoardObject,
  type TacticsBoard,
  type TacticsBoardObject,
} from "@/lib/tactics-boards";
import { canCoachTeam, getTeam } from "@/lib/teams";

export type TacticsStep = {
  id: string;
  boardId: string;
  order: number;
  title: string;
  notes?: string;
  durationMs?: number;
  objects: TacticsBoardObject[];
  version: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  createdBy: string;
  updatedBy: string;
};

export type TacticsStepConflictError = {
  kind: "version_conflict";
  remote: TacticsStep;
};

export const PREVIEW_OBJECT_CAP = 32;

function stepsCol(teamId: string, boardId: string): CollectionReference {
  return collection(firestore, "teams", teamId, "tactics", boardId, "steps");
}

function stepDoc(teamId: string, boardId: string, stepId: string) {
  return doc(stepsCol(teamId, boardId), stepId);
}

function newStepId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `s_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function trimOrUndef(s: string | undefined | null): string | undefined {
  const t = typeof s === "string" ? s.trim() : "";
  return t || undefined;
}

export function parseTacticsStep(
  id: string,
  boardId: string,
  raw: Record<string, unknown>,
): TacticsStep | null {
  const createdBy =
    typeof raw.createdBy === "string" ? raw.createdBy.trim() : "";
  const updatedBy =
    typeof raw.updatedBy === "string" ? raw.updatedBy.trim() : createdBy;
  if (!createdBy) return null;

  const objectsRaw = Array.isArray(raw.objects) ? raw.objects : [];
  const objects: TacticsBoardObject[] = [];
  for (const row of objectsRaw) {
    const parsed = parseTacticsBoardObject(row);
    if (parsed) objects.push(parsed);
  }

  const order =
    typeof raw.order === "number" && Number.isFinite(raw.order)
      ? Math.max(0, Math.floor(raw.order))
      : 0;
  const title =
    typeof raw.title === "string" && raw.title.trim() !== ""
      ? raw.title.trim()
      : `Step ${order + 1}`;
  const version =
    typeof raw.version === "number" && Number.isFinite(raw.version)
      ? Math.max(1, Math.floor(raw.version))
      : 1;
  const notes = trimOrUndef(raw.notes as string);
  const durationMs =
    typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs)
      ? Math.max(0, Math.floor(raw.durationMs))
      : undefined;

  return {
    id,
    boardId:
      typeof raw.boardId === "string" && raw.boardId.trim()
        ? raw.boardId.trim()
        : boardId,
    order,
    title,
    ...(notes ? { notes } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    objects,
    version,
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
    createdBy,
    updatedBy,
  };
}

export function buildPreviewObjects(
  objects: TacticsBoardObject[],
  cap = PREVIEW_OBJECT_CAP,
): TacticsBoardObject[] {
  return deepCloneObjects(objects.slice(0, cap));
}

export function defaultStepTitle(order: number): string {
  return `Step ${order + 1}`;
}

export async function listTacticsSteps(
  teamId: string,
  boardId: string,
): Promise<TacticsStep[]> {
  const snap = await getDocs(
    query(stepsCol(teamId, boardId), orderBy("order", "asc")),
  );
  const out: TacticsStep[] = [];
  snap.forEach((d) => {
    const parsed = parseTacticsStep(
      d.id,
      boardId,
      d.data() as Record<string, unknown>,
    );
    if (parsed) out.push(parsed);
  });
  return out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export async function getTacticsStep(
  teamId: string,
  boardId: string,
  stepId: string,
): Promise<TacticsStep | null> {
  const snap = await getDoc(stepDoc(teamId, boardId, stepId));
  if (!snap.exists()) return null;
  return parseTacticsStep(
    snap.id,
    boardId,
    snap.data() as Record<string, unknown>,
  );
}

export type CreateTacticsStepInput = {
  order: number;
  title?: string;
  notes?: string;
  objects?: TacticsBoardObject[];
  durationMs?: number;
};

/** Low-level create used by board create/migration (caller enforces auth). */
export async function writeTacticsStepDoc(
  teamId: string,
  boardId: string,
  stepId: string,
  uid: string,
  input: CreateTacticsStepInput,
): Promise<void> {
  const order = Math.max(0, Math.floor(input.order));
  await setDoc(stepDoc(teamId, boardId, stepId), {
    boardId,
    order,
    title: input.title?.trim() || defaultStepTitle(order),
    ...(trimOrUndef(input.notes) ? { notes: trimOrUndef(input.notes) } : {}),
    ...(typeof input.durationMs === "number"
      ? { durationMs: Math.max(0, Math.floor(input.durationMs)) }
      : {}),
    objects: input.objects ?? [],
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
}

export type UpdateTacticsStepPatch = {
  title?: string;
  notes?: string | null;
  objects?: TacticsBoardObject[];
  durationMs?: number | null;
  expectedVersion: number;
  displayName?: string | null;
};

export async function updateTacticsStep(
  teamId: string,
  boardId: string,
  stepId: string,
  uid: string,
  patch: UpdateTacticsStepPatch,
): Promise<
  | { ok: true; step: TacticsStep }
  | { ok: false; conflict: TacticsStepConflictError }
> {
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only coaches can edit tactics steps.");
  }
  const board = await getTacticsBoard(teamId, boardId);
  if (!board || !canEditTacticsBoard(board, team, uid)) {
    throw new Error("You do not have permission to edit this board.");
  }
  const current = await getTacticsStep(teamId, boardId, stepId);
  if (!current) throw new Error("Step not found.");
  if (current.version !== patch.expectedVersion) {
    return {
      ok: false,
      conflict: { kind: "version_conflict", remote: current },
    };
  }

  const nextVersion = current.version + 1;
  const update: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    version: nextVersion,
  };
  if (typeof patch.title === "string") {
    update.title = patch.title.trim() || defaultStepTitle(current.order);
  }
  if (patch.notes === null) {
    update.notes = null;
  } else if (typeof patch.notes === "string") {
    update.notes = patch.notes.trim() || null;
  }
  if (Array.isArray(patch.objects)) {
    update.objects = patch.objects;
  }
  if (patch.durationMs === null) {
    update.durationMs = null;
  } else if (typeof patch.durationMs === "number") {
    update.durationMs = Math.max(0, Math.floor(patch.durationMs));
  }

  try {
    await updateDoc(stepDoc(teamId, boardId, stepId), update);
  } catch (err) {
    throw formatFirestoreWriteError(err, "Could not save tactics step.");
  }

  // Refresh board preview + stepCount when first step objects change.
  if (Array.isArray(patch.objects) && current.order === 0) {
    try {
      await updateDoc(doc(firestore, "teams", teamId, "tactics", boardId), {
        previewObjects: buildPreviewObjects(patch.objects),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    } catch {
      /* best-effort preview sync */
    }
  }

  const step = await getTacticsStep(teamId, boardId, stepId);
  if (!step) throw new Error("Step saved but could not be reloaded.");
  return { ok: true, step };
}

async function requireEditableBoard(
  teamId: string,
  boardId: string,
  uid: string,
): Promise<{ board: TacticsBoard }> {
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only coaches can edit tactics steps.");
  }
  const board = await getTacticsBoard(teamId, boardId);
  if (!board || !canEditTacticsBoard(board, team, uid)) {
    throw new Error("You do not have permission to edit this board.");
  }
  return { board };
}

async function renumberAndPersistOrders(
  teamId: string,
  boardId: string,
  uid: string,
  steps: TacticsStep[],
  activeStepId: string,
): Promise<TacticsStep[]> {
  const batch = writeBatch(firestore);
  const sorted = [...steps].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
  const next: TacticsStep[] = [];
  sorted.forEach((s, i) => {
    const title =
      s.title.trim() && !/^Step \d+$/i.test(s.title)
        ? s.title
        : defaultStepTitle(i);
    batch.update(stepDoc(teamId, boardId, s.id), {
      order: i,
      title,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      version: s.version + 1,
    });
    next.push({
      ...s,
      order: i,
      title,
      version: s.version + 1,
      updatedBy: uid,
    });
  });
  const first = next[0];
  batch.update(doc(firestore, "teams", teamId, "tactics", boardId), {
    stepCount: next.length,
    activeStepId,
    previewObjects: first ? buildPreviewObjects(first.objects) : [],
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  await batch.commit();
  return next;
}

/**
 * Add a step immediately after `afterStepId`, deep-copying its objects
 * (preserving stable object IDs).
 */
export async function addTacticsStepAfter(
  teamId: string,
  boardId: string,
  uid: string,
  afterStepId: string,
  opts?: { title?: string; displayName?: string | null },
): Promise<{ steps: TacticsStep[]; created: TacticsStep }> {
  await requireEditableBoard(teamId, boardId, uid);
  const steps = await listTacticsSteps(teamId, boardId);
  const after = steps.find((s) => s.id === afterStepId);
  if (!after) throw new Error("Step not found.");

  const newId = newStepId();
  const insertOrder = after.order + 1;
  // Shift following steps up.
  const batch = writeBatch(firestore);
  for (const s of steps) {
    if (s.order >= insertOrder) {
      batch.update(stepDoc(teamId, boardId, s.id), {
        order: s.order + 1,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        version: s.version + 1,
      });
    }
  }
  const title = opts?.title?.trim() || defaultStepTitle(insertOrder);
  batch.set(stepDoc(teamId, boardId, newId), {
    boardId,
    order: insertOrder,
    title,
    objects: deepCloneObjects(after.objects),
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  batch.update(doc(firestore, "teams", teamId, "tactics", boardId), {
    stepCount: steps.length + 1,
    activeStepId: newId,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  try {
    await batch.commit();
  } catch (err) {
    throw formatFirestoreWriteError(err, "Could not add step.");
  }

  const refreshed = await listTacticsSteps(teamId, boardId);
  const created = refreshed.find((s) => s.id === newId);
  if (!created) throw new Error("Step created but could not be loaded.");
  return { steps: refreshed, created };
}

export async function duplicateTacticsStep(
  teamId: string,
  boardId: string,
  uid: string,
  stepId: string,
): Promise<{ steps: TacticsStep[]; created: TacticsStep }> {
  return addTacticsStepAfter(teamId, boardId, uid, stepId, {
    title: undefined,
  });
}

export async function deleteTacticsStep(
  teamId: string,
  boardId: string,
  uid: string,
  stepId: string,
): Promise<TacticsStep[]> {
  await requireEditableBoard(teamId, boardId, uid);
  const steps = await listTacticsSteps(teamId, boardId);
  if (steps.length <= 1) {
    throw new Error("Cannot delete the only remaining step.");
  }
  const target = steps.find((s) => s.id === stepId);
  if (!target) throw new Error("Step not found.");

  await deleteDoc(stepDoc(teamId, boardId, stepId));
  const remaining = steps.filter((s) => s.id !== stepId);
  const activeStepId =
    remaining.find((s) => s.order === Math.max(0, target.order - 1))?.id ??
    remaining[0]!.id;
  return renumberAndPersistOrders(
    teamId,
    boardId,
    uid,
    remaining,
    activeStepId,
  );
}

export async function moveTacticsStep(
  teamId: string,
  boardId: string,
  uid: string,
  stepId: string,
  direction: "left" | "right",
): Promise<TacticsStep[]> {
  await requireEditableBoard(teamId, boardId, uid);
  const steps = await listTacticsSteps(teamId, boardId);
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx < 0) throw new Error("Step not found.");
  const swapWith = direction === "left" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= steps.length) return steps;

  const a = steps[idx]!;
  const b = steps[swapWith]!;
  const batch = writeBatch(firestore);
  batch.update(stepDoc(teamId, boardId, a.id), {
    order: b.order,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    version: a.version + 1,
  });
  batch.update(stepDoc(teamId, boardId, b.id), {
    order: a.order,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    version: b.version + 1,
  });
  await batch.commit();
  const refreshed = await listTacticsSteps(teamId, boardId);
  const cover = refreshed[0];
  if (cover) {
    await updateDoc(doc(firestore, "teams", teamId, "tactics", boardId), {
      previewObjects: buildPreviewObjects(cover.objects),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  }
  return refreshed;
}

export async function renameTacticsStep(
  teamId: string,
  boardId: string,
  uid: string,
  stepId: string,
  title: string,
): Promise<TacticsStep> {
  const current = await getTacticsStep(teamId, boardId, stepId);
  if (!current) throw new Error("Step not found.");
  const result = await updateTacticsStep(teamId, boardId, stepId, uid, {
    title,
    expectedVersion: current.version,
  });
  if (!result.ok) {
    throw new Error(
      "This step was updated by another coach. Refresh and try again.",
    );
  }
  return result.step;
}

export async function deleteAllTacticsSteps(
  teamId: string,
  boardId: string,
): Promise<number> {
  const snap = await getDocs(stepsCol(teamId, boardId));
  let n = 0;
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
    n += 1;
  }
  return n;
}

/** Copy all steps from one board to another (new IDs, preserve object IDs). */
export async function copyTacticsStepsToBoard(
  teamId: string,
  sourceBoardId: string,
  destBoardId: string,
  uid: string,
): Promise<{ stepCount: number; activeStepId: string; previewObjects: TacticsBoardObject[] }> {
  const sourceSteps = await listTacticsSteps(teamId, sourceBoardId);
  if (sourceSteps.length === 0) {
    const stepId = newStepId();
    await writeTacticsStepDoc(teamId, destBoardId, stepId, uid, {
      order: 0,
      title: defaultStepTitle(0),
      objects: [],
    });
    return { stepCount: 1, activeStepId: stepId, previewObjects: [] };
  }

  const batch = writeBatch(firestore);
  let firstId = "";
  let preview: TacticsBoardObject[] = [];
  sourceSteps.forEach((s, i) => {
    const id = newStepId();
    if (i === 0) {
      firstId = id;
      preview = buildPreviewObjects(s.objects);
    }
    batch.set(stepDoc(teamId, destBoardId, id), {
      boardId: destBoardId,
      order: i,
      title: s.title || defaultStepTitle(i),
      ...(s.notes ? { notes: s.notes } : {}),
      ...(s.durationMs !== undefined ? { durationMs: s.durationMs } : {}),
      objects: deepCloneObjects(s.objects),
      version: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    });
  });
  await batch.commit();
  return {
    stepCount: sourceSteps.length,
    activeStepId: firstId,
    previewObjects: preview,
  };
}

export async function assertCanViewSteps(
  teamId: string,
  boardId: string,
  uid: string,
): Promise<TacticsBoard> {
  const team = await getTeam(teamId);
  if (!team) throw new Error("Team not found.");
  const board = await getTacticsBoard(teamId, boardId);
  if (!board || !canViewTacticsBoard(board, team, uid)) {
    throw new Error("Board not found.");
  }
  return board;
}

export { newStepId };
