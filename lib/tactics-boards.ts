/**
 * Team tactics boards — digital coaching whiteboard.
 *
 * Layout:
 *   teams/{teamId}/tactics/{boardId}
 *   tacticsBoardShares/{shareToken}  (optional public link snapshot)
 */

import {
  collection,
  deleteDoc,
  deleteField,
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
import {
  DEFAULT_PLAYBACK_SETTINGS,
  parsePlaybackSettings,
  type PlaybackSettings,
} from "@/lib/tactics-animation";
import type { TacticsFieldView } from "@/lib/tactics-field-geometry";
import { canCoachTeam, getTeam, type Team } from "@/lib/teams";

export type TacticsFieldOrientation = "horizontal" | "vertical";
export type { TacticsFieldView };

export type TacticsVisibility =
  | "team_coaches"
  | "private"
  | "shared_link";

export type TacticsSharePermission = "view" | "edit";

export type TacticsPlayerTeam = "home" | "away";

export type TacticsPlayerObject = {
  id: string;
  type: "player";
  team: TacticsPlayerTeam;
  x: number;
  y: number;
  /** Jersey number / short label shown inside the token. */
  label: string;
  color?: string;
  /** When false, treated as absent for render/animation. Defaults to true. */
  visible?: boolean;
};

export type TacticsBallObject = {
  id: string;
  type: "ball";
  x: number;
  y: number;
  visible?: boolean;
};

export type TacticsDrawingKind = "line" | "arrow" | "circle" | "zone";

export type TacticsDrawingObject = {
  id: string;
  type: TacticsDrawingKind;
  /** Normalized points in field space (0–1). Line/arrow: [start, end]. Circle/zone: [cornerA, cornerB]. Free draw uses many points as type "line". */
  points: Array<{ x: number; y: number }>;
  color: string;
  /** When true, render as freehand polyline rather than a single segment. */
  freehand?: boolean;
  visible?: boolean;
};

export type TacticsConeObject = {
  id: string;
  type: "cone";
  x: number;
  y: number;
  color?: string;
  visible?: boolean;
};

export type TacticsMiniGoalObject = {
  id: string;
  type: "mini_goal";
  x: number;
  y: number;
  rotation?: number;
  visible?: boolean;
};

export type TacticsAreaLabelObject = {
  id: string;
  type: "area_label";
  x: number;
  y: number;
  text: string;
  visible?: boolean;
};

export type TacticsPlaybackSettings = PlaybackSettings;

export type TacticsBoardObject =
  | TacticsPlayerObject
  | TacticsBallObject
  | TacticsDrawingObject
  | TacticsConeObject
  | TacticsMiniGoalObject
  | TacticsAreaLabelObject;

export type TacticsPresetSource = {
  presetId: string;
  presetVersion: number;
  presetTitle: string;
  sourceType: "built_in" | "team";
};

export type TacticsBoard = {
  id: string;
  teamId: string;
  title: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  createdBy: string;
  updatedBy: string;
  createdByName?: string;
  updatedByName?: string;
  sport: "soccer";
  fieldOrientation: TacticsFieldOrientation;
  /** Full pitch, or zoomed to attacking / defending half (home attacks left→right). */
  fieldView: TacticsFieldView;
  visibility: TacticsVisibility;
  /**
   * Legacy single-frame objects. Retained for migration; prefer steps.
   * Library previews prefer `previewObjects`.
   */
  objects: TacticsBoardObject[];
  /** Denormalized first-step objects for library cards. */
  previewObjects: TacticsBoardObject[];
  activeStepId?: string;
  stepCount: number;
  playbackSettings: TacticsPlaybackSettings;
  version: number;
  shareToken?: string;
  sharePermission?: TacticsSharePermission;
  shareEnabledAt?: Timestamp | null;
  shareEnabledBy?: string;
  duplicatedFromBoardId?: string;
  duplicatedFromTitle?: string;
  presetSource?: TacticsPresetSource;
};

export type TacticsBoardConflictError = {
  kind: "version_conflict";
  remote: TacticsBoard;
};

function tacticsCol(teamId: string): CollectionReference {
  return collection(firestore, "teams", teamId, "tactics");
}

function tacticsDoc(teamId: string, boardId: string) {
  return doc(tacticsCol(teamId), boardId);
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function generateTacticsBoardId(): string {
  return newId();
}

export function generateTacticsObjectId(): string {
  return `o_${newId()}`;
}

function trimOrUndef(s: string | undefined | null): string | undefined {
  const t = typeof s === "string" ? s.trim() : "";
  return t || undefined;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function parsePoint(raw: unknown): { x: number; y: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== "number" || typeof o.y !== "number") return null;
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) return null;
  return { x: clamp01(o.x), y: clamp01(o.y) };
}

export function parseTacticsBoardObject(raw: unknown): TacticsBoardObject | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const type = o.type;

  if (type === "player") {
    const team = o.team === "away" ? "away" : o.team === "home" ? "home" : null;
    if (!team) return null;
    if (typeof o.x !== "number" || typeof o.y !== "number") return null;
    const label =
      typeof o.label === "string" && o.label.trim() !== ""
        ? o.label.trim().slice(0, 3)
        : "?";
    const color =
      typeof o.color === "string" && o.color.trim() !== ""
        ? o.color.trim()
        : undefined;
    return {
      id,
      type: "player",
      team,
      x: clamp01(o.x),
      y: clamp01(o.y),
      label,
      ...(color ? { color } : {}),
      ...(o.visible === false ? { visible: false } : {}),
    };
  }

  if (type === "ball") {
    if (typeof o.x !== "number" || typeof o.y !== "number") return null;
    return {
      id,
      type: "ball",
      x: clamp01(o.x),
      y: clamp01(o.y),
      ...(o.visible === false ? { visible: false } : {}),
    };
  }

  if (type === "cone") {
    if (typeof o.x !== "number" || typeof o.y !== "number") return null;
    const color =
      typeof o.color === "string" && o.color.trim() !== ""
        ? o.color.trim()
        : undefined;
    return {
      id,
      type: "cone",
      x: clamp01(o.x),
      y: clamp01(o.y),
      ...(color ? { color } : {}),
      ...(o.visible === false ? { visible: false } : {}),
    };
  }

  if (type === "mini_goal") {
    if (typeof o.x !== "number" || typeof o.y !== "number") return null;
    const rotation =
      typeof o.rotation === "number" && Number.isFinite(o.rotation)
        ? o.rotation
        : undefined;
    return {
      id,
      type: "mini_goal",
      x: clamp01(o.x),
      y: clamp01(o.y),
      ...(rotation !== undefined ? { rotation } : {}),
      ...(o.visible === false ? { visible: false } : {}),
    };
  }

  if (type === "area_label") {
    if (typeof o.x !== "number" || typeof o.y !== "number") return null;
    const text =
      typeof o.text === "string" && o.text.trim() !== ""
        ? o.text.trim().slice(0, 48)
        : "";
    if (!text) return null;
    return {
      id,
      type: "area_label",
      x: clamp01(o.x),
      y: clamp01(o.y),
      text,
      ...(o.visible === false ? { visible: false } : {}),
    };
  }

  if (
    type === "line" ||
    type === "arrow" ||
    type === "circle" ||
    type === "zone"
  ) {
    if (!Array.isArray(o.points) || o.points.length < 2) return null;
    const points: Array<{ x: number; y: number }> = [];
    for (const p of o.points) {
      const pt = parsePoint(p);
      if (!pt) return null;
      points.push(pt);
    }
    const color =
      typeof o.color === "string" && o.color.trim() !== ""
        ? o.color.trim()
        : "#60a5fa";
    return {
      id,
      type,
      points,
      color,
      ...(o.freehand === true ? { freehand: true } : {}),
      ...(o.visible === false ? { visible: false } : {}),
    };
  }

  return null;
}

export function parseTacticsBoard(
  id: string,
  teamId: string,
  raw: Record<string, unknown>,
): TacticsBoard | null {
  const title =
    typeof raw.title === "string" && raw.title.trim() !== ""
      ? raw.title.trim()
      : "Untitled board";
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

  const previewRaw = Array.isArray(raw.previewObjects)
    ? raw.previewObjects
    : objectsRaw;
  const previewObjects: TacticsBoardObject[] = [];
  for (const row of previewRaw) {
    const parsed = parseTacticsBoardObject(row);
    if (parsed) previewObjects.push(parsed);
  }

  const visibilityRaw = raw.visibility;
  const visibility: TacticsVisibility =
    visibilityRaw === "private" ||
    visibilityRaw === "shared_link" ||
    visibilityRaw === "team_coaches"
      ? visibilityRaw
      : "team_coaches";

  const orientation =
    raw.fieldOrientation === "vertical" ? "vertical" : "horizontal";

  const fieldView: TacticsFieldView =
    raw.fieldView === "offensive" || raw.fieldView === "defensive"
      ? raw.fieldView
      : "full";

  const version =
    typeof raw.version === "number" && Number.isFinite(raw.version)
      ? Math.max(1, Math.floor(raw.version))
      : 1;

  const sharePermission =
    raw.sharePermission === "edit" || raw.sharePermission === "view"
      ? raw.sharePermission
      : undefined;

  const stepCount =
    typeof raw.stepCount === "number" && Number.isFinite(raw.stepCount)
      ? Math.max(0, Math.floor(raw.stepCount))
      : 0;
  const activeStepId = trimOrUndef(raw.activeStepId as string);
  const playbackSettings = parsePlaybackSettings(raw.playbackSettings);
  const presetSourceRaw =
    raw.presetSource && typeof raw.presetSource === "object"
      ? (raw.presetSource as Record<string, unknown>)
      : null;
  const presetSource: TacticsPresetSource | undefined =
    presetSourceRaw &&
    typeof presetSourceRaw.presetId === "string" &&
    typeof presetSourceRaw.presetVersion === "number" &&
    typeof presetSourceRaw.presetTitle === "string" &&
    (presetSourceRaw.sourceType === "built_in" ||
      presetSourceRaw.sourceType === "team")
      ? {
          presetId: presetSourceRaw.presetId,
          presetVersion: Math.max(1, Math.floor(presetSourceRaw.presetVersion)),
          presetTitle: presetSourceRaw.presetTitle,
          sourceType: presetSourceRaw.sourceType,
        }
      : undefined;

  return {
    id,
    teamId:
      typeof raw.teamId === "string" && raw.teamId.trim()
        ? raw.teamId.trim()
        : teamId,
    title,
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
    createdBy,
    updatedBy,
    ...(trimOrUndef(raw.createdByName as string)
      ? { createdByName: (raw.createdByName as string).trim() }
      : {}),
    ...(trimOrUndef(raw.updatedByName as string)
      ? { updatedByName: (raw.updatedByName as string).trim() }
      : {}),
    sport: "soccer",
    fieldOrientation: orientation,
    fieldView,
    visibility,
    objects,
    previewObjects,
    ...(activeStepId ? { activeStepId } : {}),
    stepCount,
    playbackSettings,
    version,
    ...(trimOrUndef(raw.shareToken as string)
      ? { shareToken: (raw.shareToken as string).trim() }
      : {}),
    ...(sharePermission ? { sharePermission } : {}),
    ...(raw.shareEnabledAt instanceof Timestamp
      ? { shareEnabledAt: raw.shareEnabledAt }
      : {}),
    ...(trimOrUndef(raw.shareEnabledBy as string)
      ? { shareEnabledBy: (raw.shareEnabledBy as string).trim() }
      : {}),
    ...(trimOrUndef(raw.duplicatedFromBoardId as string)
      ? { duplicatedFromBoardId: (raw.duplicatedFromBoardId as string).trim() }
      : {}),
    ...(trimOrUndef(raw.duplicatedFromTitle as string)
      ? { duplicatedFromTitle: (raw.duplicatedFromTitle as string).trim() }
      : {}),
    ...(presetSource ? { presetSource } : {}),
  };
}

/** Coaches may list all team boards; private boards only for creator. */
export function canViewTacticsBoard(
  board: TacticsBoard,
  team: Team,
  uid: string,
): boolean {
  if (!uid) return false;
  if (!canCoachTeam(team, uid)) {
    // Shared-link view handled via public share doc, not team library.
    return false;
  }
  if (board.visibility === "private") {
    return board.createdBy === uid || team.ownerId === uid;
  }
  return true;
}

export function canEditTacticsBoard(
  board: TacticsBoard,
  team: Team,
  uid: string,
): boolean {
  if (!canCoachTeam(team, uid)) return false;
  if (board.visibility === "private") {
    return board.createdBy === uid || team.ownerId === uid;
  }
  return true;
}

export async function listTacticsBoards(
  teamId: string,
  uid: string,
): Promise<TacticsBoard[]> {
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only coaches can view tactics boards.");
  }
  const snap = await getDocs(
    query(tacticsCol(teamId), orderBy("updatedAt", "desc")),
  );
  const out: TacticsBoard[] = [];
  snap.forEach((d) => {
    const parsed = parseTacticsBoard(
      d.id,
      teamId,
      d.data() as Record<string, unknown>,
    );
    if (parsed && canViewTacticsBoard(parsed, team, uid)) {
      out.push(parsed);
    }
  });
  return out;
}

export async function getTacticsBoard(
  teamId: string,
  boardId: string,
): Promise<TacticsBoard | null> {
  const snap = await getDoc(tacticsDoc(teamId, boardId));
  if (!snap.exists()) return null;
  return parseTacticsBoard(
    snap.id,
    teamId,
    snap.data() as Record<string, unknown>,
  );
}

export type CreateTacticsBoardInput = {
  title?: string;
  fieldOrientation?: TacticsFieldOrientation;
  fieldView?: TacticsFieldView;
  displayName?: string | null;
};

export async function createTacticsBoard(
  teamId: string,
  uid: string,
  input: CreateTacticsBoardInput = {},
): Promise<TacticsBoard> {
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only coaches can create tactics boards.");
  }
  const id = newId();
  const stepId = `s_${newId()}`;
  const title = input.title?.trim() || "Untitled board";
  const name = trimOrUndef(input.displayName ?? undefined);
  const batch = writeBatch(firestore);
  batch.set(tacticsDoc(teamId, id), {
    teamId,
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
    ...(name ? { createdByName: name, updatedByName: name } : {}),
    sport: "soccer" as const,
    fieldOrientation: input.fieldOrientation ?? "horizontal",
    fieldView: input.fieldView ?? "full",
    visibility: "team_coaches" as const,
    objects: [] as TacticsBoardObject[],
    previewObjects: [] as TacticsBoardObject[],
    activeStepId: stepId,
    stepCount: 1,
    playbackSettings: { ...DEFAULT_PLAYBACK_SETTINGS },
    version: 1,
  });
  batch.set(doc(firestore, "teams", teamId, "tactics", id, "steps", stepId), {
    boardId: id,
    order: 0,
    title: "Step 1",
    objects: [],
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  try {
    await batch.commit();
  } catch (err) {
    throw formatFirestoreWriteError(err, "Could not create tactics board.");
  }
  const created = await getTacticsBoard(teamId, id);
  if (!created) throw new Error("Board was created but could not be loaded.");
  return created;
}

export type UpdateTacticsBoardPatch = {
  title?: string;
  fieldOrientation?: TacticsFieldOrientation;
  fieldView?: TacticsFieldView;
  visibility?: TacticsVisibility;
  /** @deprecated Prefer step updates. Still accepted for legacy/migration. */
  objects?: TacticsBoardObject[];
  previewObjects?: TacticsBoardObject[];
  activeStepId?: string;
  stepCount?: number;
  playbackSettings?: Partial<TacticsPlaybackSettings>;
  /** Expected version for optimistic concurrency. */
  expectedVersion: number;
  displayName?: string | null;
  shareToken?: string | null;
  sharePermission?: TacticsSharePermission | null;
  shareEnabledBy?: string | null;
  clearShare?: boolean;
};

/**
 * Persist board changes. Returns the updated board, or a conflict error when
 * `expectedVersion` does not match the stored version.
 */
export async function updateTacticsBoard(
  teamId: string,
  boardId: string,
  uid: string,
  patch: UpdateTacticsBoardPatch,
): Promise<
  | { ok: true; board: TacticsBoard }
  | { ok: false; conflict: TacticsBoardConflictError }
> {
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only coaches can edit tactics boards.");
  }
  const current = await getTacticsBoard(teamId, boardId);
  if (!current) throw new Error("Board not found.");
  if (!canEditTacticsBoard(current, team, uid)) {
    throw new Error("You do not have permission to edit this board.");
  }
  if (current.version !== patch.expectedVersion) {
    return {
      ok: false,
      conflict: { kind: "version_conflict", remote: current },
    };
  }

  const name = trimOrUndef(patch.displayName ?? undefined);
  const nextVersion = current.version + 1;
  const update: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    version: nextVersion,
  };
  if (name) update.updatedByName = name;
  if (typeof patch.title === "string") {
    update.title = patch.title.trim() || "Untitled board";
  }
  if (patch.fieldOrientation === "horizontal" || patch.fieldOrientation === "vertical") {
    update.fieldOrientation = patch.fieldOrientation;
  }
  if (
    patch.fieldView === "full" ||
    patch.fieldView === "offensive" ||
    patch.fieldView === "defensive"
  ) {
    update.fieldView = patch.fieldView;
  }
  if (
    patch.visibility === "team_coaches" ||
    patch.visibility === "private" ||
    patch.visibility === "shared_link"
  ) {
    update.visibility = patch.visibility;
  }
  if (Array.isArray(patch.objects)) {
    update.objects = patch.objects;
  }
  if (Array.isArray(patch.previewObjects)) {
    update.previewObjects = patch.previewObjects;
  }
  if (typeof patch.activeStepId === "string" && patch.activeStepId.trim()) {
    update.activeStepId = patch.activeStepId.trim();
  }
  if (typeof patch.stepCount === "number" && Number.isFinite(patch.stepCount)) {
    update.stepCount = Math.max(0, Math.floor(patch.stepCount));
  }
  if (patch.playbackSettings) {
    update.playbackSettings = {
      ...current.playbackSettings,
      ...patch.playbackSettings,
    };
  }
  if (patch.clearShare) {
    update.shareToken = deleteField();
    update.sharePermission = deleteField();
    update.shareEnabledAt = deleteField();
    update.shareEnabledBy = deleteField();
    if (patch.visibility === undefined) {
      update.visibility = "team_coaches";
    }
  } else {
    if (patch.shareToken !== undefined) {
      update.shareToken = patch.shareToken;
      if (patch.shareToken) {
        update.shareEnabledAt = serverTimestamp();
      }
    }
    if (patch.sharePermission !== undefined) {
      update.sharePermission = patch.sharePermission;
    }
    if (patch.shareEnabledBy !== undefined) {
      update.shareEnabledBy = patch.shareEnabledBy;
    }
  }

  try {
    await updateDoc(tacticsDoc(teamId, boardId), update);
  } catch (err) {
    throw formatFirestoreWriteError(err, "Could not save tactics board.");
  }
  const board = await getTacticsBoard(teamId, boardId);
  if (!board) throw new Error("Board saved but could not be reloaded.");
  return { ok: true, board };
}

export async function renameTacticsBoard(
  teamId: string,
  boardId: string,
  uid: string,
  title: string,
  displayName?: string | null,
): Promise<TacticsBoard> {
  const current = await getTacticsBoard(teamId, boardId);
  if (!current) throw new Error("Board not found.");
  const result = await updateTacticsBoard(teamId, boardId, uid, {
    title,
    expectedVersion: current.version,
    displayName,
  });
  if (!result.ok) {
    throw new Error("This board was updated by another coach. Refresh and try again.");
  }
  return result.board;
}

export async function deleteTacticsBoard(
  teamId: string,
  boardId: string,
  uid: string,
): Promise<void> {
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only coaches can delete tactics boards.");
  }
  const board = await getTacticsBoard(teamId, boardId);
  if (!board) return;
  if (!canEditTacticsBoard(board, team, uid) && team.ownerId !== uid) {
    throw new Error("You do not have permission to delete this board.");
  }
  if (board.shareToken) {
    try {
      await deleteDoc(doc(firestore, "tacticsBoardShares", board.shareToken));
    } catch {
      /* best-effort */
    }
  }
  const { deleteAllTacticsSteps } = await import("@/lib/tactics-steps");
  await deleteAllTacticsSteps(teamId, boardId);
  await deleteDoc(tacticsDoc(teamId, boardId));
}

export async function duplicateTacticsBoard(
  teamId: string,
  boardId: string,
  uid: string,
  opts?: { title?: string; displayName?: string | null },
): Promise<TacticsBoard> {
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only coaches can duplicate tactics boards.");
  }
  const source = await getTacticsBoard(teamId, boardId);
  if (!source || !canViewTacticsBoard(source, team, uid)) {
    throw new Error("Board not found.");
  }
  // Ensure source steps exist before copying.
  const { ensureTacticsBoardMigrated } = await import("@/lib/tactics-migration");
  await ensureTacticsBoardMigrated(teamId, boardId, uid);

  const id = newId();
  const placeholderStepId = `s_${newId()}`;
  const name = trimOrUndef(opts?.displayName ?? undefined);
  const title = opts?.title?.trim() || `${source.title} — copy`;

  // Create parent board first so step security rules can resolve it.
  await setDoc(tacticsDoc(teamId, id), {
    teamId,
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
    ...(name ? { createdByName: name, updatedByName: name } : {}),
    sport: "soccer" as const,
    fieldOrientation: source.fieldOrientation,
    fieldView: source.fieldView,
    visibility: "team_coaches" as const,
    objects: [] as TacticsBoardObject[],
    previewObjects: source.previewObjects.length
      ? source.previewObjects
      : source.objects.slice(0, 32),
    activeStepId: placeholderStepId,
    stepCount: 1,
    playbackSettings: { ...source.playbackSettings },
    version: 1,
    duplicatedFromBoardId: source.id,
    duplicatedFromTitle: source.title,
    ...(source.presetSource ? { presetSource: source.presetSource } : {}),
  });

  const { copyTacticsStepsToBoard } = await import("@/lib/tactics-steps");
  const copied = await copyTacticsStepsToBoard(teamId, boardId, id, uid);
  await updateDoc(tacticsDoc(teamId, id), {
    activeStepId: copied.activeStepId,
    stepCount: copied.stepCount,
    previewObjects: copied.previewObjects,
  });

  const created = await getTacticsBoard(teamId, id);
  if (!created) throw new Error("Duplicate created but could not be loaded.");
  return created;
}

/** Delete all tactics boards for a team (used by deleteTeam cleanup). */
export async function deleteAllTacticsBoards(teamId: string): Promise<number> {
  const snap = await getDocs(tacticsCol(teamId));
  const { deleteAllTacticsSteps } = await import("@/lib/tactics-steps");
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const token =
      typeof data.shareToken === "string" ? data.shareToken.trim() : "";
    if (token) {
      try {
        await deleteDoc(doc(firestore, "tacticsBoardShares", token));
      } catch {
        /* ignore */
      }
    }
    await deleteAllTacticsSteps(teamId, d.id);
    await deleteDoc(d.ref);
    n += 1;
  }
  return n;
}

export function relativeUpdatedLabel(
  updatedAt: Timestamp | null | undefined,
  nowMs = Date.now(),
): string {
  if (!updatedAt) return "Not saved yet";
  const ms = updatedAt.toMillis();
  const diff = Math.max(0, nowMs - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day} day${day === 1 ? "" : "s"} ago`;
  return updatedAt.toDate().toLocaleDateString();
}

export function visibilityLabel(v: TacticsVisibility): string {
  switch (v) {
    case "private":
      return "Only me";
    case "shared_link":
      return "Anyone with the link";
    default:
      return "Shared with team coaches";
  }
}

/** Default home/away colors for player tokens. */
export const TACTICS_HOME_COLOR = "#3b82f6";
export const TACTICS_AWAY_COLOR = "#ef4444";
export const TACTICS_DRAW_COLOR = "#fbbf24";
