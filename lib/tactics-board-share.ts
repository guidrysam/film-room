/**
 * Public share links for tactics boards.
 * Snapshot lives at tacticsBoardShares/{shareToken}.
 */

import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";
import {
  DEFAULT_PLAYBACK_SETTINGS,
  parsePlaybackSettings,
  type PlaybackSettings,
} from "@/lib/tactics-animation";
import {
  getTacticsBoard,
  updateTacticsBoard,
  type TacticsBoard,
  type TacticsBoardObject,
  type TacticsFieldOrientation,
  type TacticsFieldView,
  type TacticsSharePermission,
} from "@/lib/tactics-boards";
import { ensureTacticsBoardMigrated } from "@/lib/tactics-migration";
import { listTacticsSteps } from "@/lib/tactics-steps";
import { canCoachTeam, getTeam } from "@/lib/teams";

export const TACTICS_BOARD_SHARE_SCHEMA_V1 = "tactics_board_share_v1" as const;
export const TACTICS_BOARD_SHARE_SCHEMA = "tactics_board_share_v2" as const;

export type TacticsShareStepSnapshot = {
  id: string;
  order: number;
  title: string;
  notes?: string;
  objects: TacticsBoardObject[];
};

export type TacticsBoardSharePayload = {
  schema: typeof TACTICS_BOARD_SHARE_SCHEMA | typeof TACTICS_BOARD_SHARE_SCHEMA_V1;
  title: string;
  sport: "soccer";
  fieldOrientation: TacticsFieldOrientation;
  fieldView: TacticsFieldView;
  /** Legacy v1 single-frame objects. */
  objects: TacticsBoardObject[];
  steps: TacticsShareStepSnapshot[];
  playbackSettings: PlaybackSettings;
  createdByName?: string;
  updatedByName?: string;
};

export type TacticsBoardShareDoc = {
  shareToken: string;
  teamId: string;
  boardId: string;
  permission: TacticsSharePermission;
  createdBy: string;
  enabled: boolean;
  payload: TacticsBoardSharePayload;
  updatedAt: Timestamp | null;
};

export type SharedTacticsLookupResult =
  | { ok: true; share: TacticsBoardShareDoc }
  | { ok: false; kind: "not_found" | "revoked" }
  | { ok: false; kind: "query_failed"; message: string };

function generateShareToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
}

function shareRef(token: string) {
  return doc(firestore, "tacticsBoardShares", token);
}

export function normalizeSharePayload(
  raw: TacticsBoardSharePayload,
): TacticsBoardSharePayload {
  const fieldView =
    raw.fieldView === "offensive" || raw.fieldView === "defensive"
      ? raw.fieldView
      : "full";
  const objects = Array.isArray(raw.objects) ? raw.objects : [];
  let steps = Array.isArray(raw.steps) ? raw.steps : [];
  if (steps.length === 0 && objects.length >= 0) {
    steps = [
      {
        id: "step-1",
        order: 0,
        title: "Step 1",
        objects,
      },
    ];
  }
  return {
    schema: TACTICS_BOARD_SHARE_SCHEMA,
    title: raw.title || "Untitled board",
    sport: "soccer",
    fieldOrientation:
      raw.fieldOrientation === "vertical" ? "vertical" : "horizontal",
    fieldView,
    objects: steps[0]?.objects ?? objects,
    steps: steps
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s, i) => ({
        id: s.id || `step-${i + 1}`,
        order: typeof s.order === "number" ? s.order : i,
        title: s.title || `Step ${i + 1}`,
        ...(s.notes ? { notes: s.notes } : {}),
        objects: Array.isArray(s.objects) ? s.objects : [],
      })),
    playbackSettings: parsePlaybackSettings(raw.playbackSettings),
    ...(raw.createdByName ? { createdByName: raw.createdByName } : {}),
    ...(raw.updatedByName ? { updatedByName: raw.updatedByName } : {}),
  };
}

export async function buildTacticsSharePayload(
  board: TacticsBoard,
  uid?: string,
): Promise<TacticsBoardSharePayload> {
  if (uid) {
    await ensureTacticsBoardMigrated(board.teamId, board.id, uid);
  }
  const steps = await listTacticsSteps(board.teamId, board.id);
  const snapshots: TacticsShareStepSnapshot[] =
    steps.length > 0
      ? steps.map((s) => ({
          id: s.id,
          order: s.order,
          title: s.title,
          ...(s.notes ? { notes: s.notes } : {}),
          objects: s.objects,
        }))
      : [
          {
            id: board.activeStepId || "step-1",
            order: 0,
            title: "Step 1",
            objects: board.objects,
          },
        ];
  return {
    schema: TACTICS_BOARD_SHARE_SCHEMA,
    title: board.title,
    sport: "soccer",
    fieldOrientation: board.fieldOrientation,
    fieldView: board.fieldView,
    objects: snapshots[0]?.objects ?? [],
    steps: snapshots,
    playbackSettings: board.playbackSettings ?? { ...DEFAULT_PLAYBACK_SETTINGS },
    ...(board.createdByName ? { createdByName: board.createdByName } : {}),
    ...(board.updatedByName ? { updatedByName: board.updatedByName } : {}),
  };
}

export function tacticsBoardEditorUrl(
  teamId: string,
  boardId: string,
  opts?: { play?: boolean },
): string {
  const base = `/team/${teamId}/tactics/${boardId}`;
  return opts?.play ? `${base}?play=1` : base;
}

export function tacticsSharedUrl(shareToken: string): string {
  return `/tactics/shared/${encodeURIComponent(shareToken)}`;
}

/**
 * Enable or refresh a public share link. Snapshot is denormalized so viewers
 * do not need team membership.
 */
export async function ensureTacticsBoardSharing(
  teamId: string,
  boardId: string,
  uid: string,
  permission: TacticsSharePermission = "view",
): Promise<{ shareToken: string; urlPath: string }> {
  const team = await getTeam(teamId);
  if (!team || !canCoachTeam(team, uid)) {
    throw new Error("Only coaches can share tactics boards.");
  }
  await ensureTacticsBoardMigrated(teamId, boardId, uid);
  const board = await getTacticsBoard(teamId, boardId);
  if (!board) throw new Error("Board not found.");

  const token = board.shareToken?.trim() || generateShareToken();
  const payload = await buildTacticsSharePayload(board, uid);

  const existing = await getDoc(shareRef(token));
  const createdBy =
    existing.exists() && typeof existing.data()?.createdBy === "string"
      ? String(existing.data()!.createdBy)
      : uid;

  try {
    await setDoc(
      shareRef(token),
      {
        shareToken: token,
        teamId,
        boardId,
        permission,
        createdBy,
        enabled: true,
        payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    throw formatFirestoreWriteError(err, "Could not create share link.");
  }

  const result = await updateTacticsBoard(teamId, boardId, uid, {
    expectedVersion: board.version,
    visibility: "shared_link",
    shareToken: token,
    sharePermission: permission,
    shareEnabledBy: uid,
  });
  if (!result.ok) {
    throw new Error(
      "This board was updated by another coach. Refresh and try sharing again.",
    );
  }

  return { shareToken: token, urlPath: tacticsSharedUrl(token) };
}

/** Refresh the denormalized share snapshot after a board/step save. */
export async function syncTacticsBoardShareSnapshot(
  board: TacticsBoard,
  uid?: string,
): Promise<void> {
  const token = board.shareToken?.trim();
  if (!token || board.visibility !== "shared_link") return;
  try {
    const existing = await getDoc(shareRef(token));
    if (!existing.exists()) return;
    const createdBy = String(existing.data()?.createdBy ?? board.createdBy);
    const payload = await buildTacticsSharePayload(board, uid);
    await setDoc(
      shareRef(token),
      {
        shareToken: token,
        teamId: board.teamId,
        boardId: board.id,
        payload,
        permission: board.sharePermission ?? "view",
        createdBy,
        enabled: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    /* best-effort */
  }
}

export async function revokeTacticsBoardShare(
  teamId: string,
  boardId: string,
  uid: string,
): Promise<void> {
  const board = await getTacticsBoard(teamId, boardId);
  if (!board) throw new Error("Board not found.");
  const token = board.shareToken?.trim();
  if (token) {
    try {
      await deleteDoc(shareRef(token));
    } catch {
      try {
        await setDoc(shareRef(token), { enabled: false }, { merge: true });
      } catch {
        /* ignore */
      }
    }
  }
  const result = await updateTacticsBoard(teamId, boardId, uid, {
    expectedVersion: board.version,
    visibility: "team_coaches",
    clearShare: true,
  });
  if (!result.ok) {
    throw new Error(
      "This board was updated by another coach. Refresh and try again.",
    );
  }
}

export async function getTacticsBoardByShareToken(
  shareToken: string,
): Promise<SharedTacticsLookupResult> {
  const trimmed = shareToken.trim();
  if (!trimmed) return { ok: false, kind: "not_found" };
  try {
    const snap = await getDoc(shareRef(trimmed));
    if (!snap.exists()) return { ok: false, kind: "not_found" };
    const raw = snap.data() as Record<string, unknown>;
    if (raw.enabled === false) return { ok: false, kind: "revoked" };
    const payloadRaw = raw.payload as TacticsBoardSharePayload | undefined;
    if (
      !payloadRaw ||
      (payloadRaw.schema !== TACTICS_BOARD_SHARE_SCHEMA &&
        payloadRaw.schema !== TACTICS_BOARD_SHARE_SCHEMA_V1)
    ) {
      return { ok: false, kind: "not_found" };
    }
    const permission =
      raw.permission === "edit" ? "edit" : ("view" as const);
    return {
      ok: true,
      share: {
        shareToken: trimmed,
        teamId: String(raw.teamId ?? ""),
        boardId: String(raw.boardId ?? ""),
        permission,
        createdBy: String(raw.createdBy ?? ""),
        enabled: true,
        payload: normalizeSharePayload(payloadRaw),
        updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      kind: "query_failed",
      message:
        err instanceof Error ? err.message : "Could not load shared board.",
    };
  }
}
