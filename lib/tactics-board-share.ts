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
  getTacticsBoard,
  updateTacticsBoard,
  type TacticsBoard,
  type TacticsBoardObject,
  type TacticsFieldOrientation,
  type TacticsSharePermission,
} from "@/lib/tactics-boards";
import { canCoachTeam, getTeam } from "@/lib/teams";

export const TACTICS_BOARD_SHARE_SCHEMA = "tactics_board_share_v1" as const;

export type TacticsBoardSharePayload = {
  schema: typeof TACTICS_BOARD_SHARE_SCHEMA;
  title: string;
  sport: "soccer";
  fieldOrientation: TacticsFieldOrientation;
  objects: TacticsBoardObject[];
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

export function buildTacticsSharePayload(
  board: TacticsBoard,
): TacticsBoardSharePayload {
  return {
    schema: TACTICS_BOARD_SHARE_SCHEMA,
    title: board.title,
    sport: "soccer",
    fieldOrientation: board.fieldOrientation,
    objects: board.objects,
    ...(board.createdByName ? { createdByName: board.createdByName } : {}),
    ...(board.updatedByName ? { updatedByName: board.updatedByName } : {}),
  };
}

export function tacticsBoardEditorUrl(teamId: string, boardId: string): string {
  return `/team/${teamId}/tactics/${boardId}`;
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
  const board = await getTacticsBoard(teamId, boardId);
  if (!board) throw new Error("Board not found.");

  const token = board.shareToken?.trim() || generateShareToken();
  const payload = buildTacticsSharePayload(board);

  try {
    await setDoc(
      shareRef(token),
      {
        shareToken: token,
        teamId,
        boardId,
        permission,
        createdBy: uid,
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

/** Refresh the denormalized share snapshot after a board save. */
export async function syncTacticsBoardShareSnapshot(
  board: TacticsBoard,
): Promise<void> {
  const token = board.shareToken?.trim();
  if (!token || board.visibility !== "shared_link") return;
  try {
    await setDoc(
      shareRef(token),
      {
        payload: buildTacticsSharePayload(board),
        permission: board.sharePermission ?? "view",
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
    const payload = raw.payload as TacticsBoardSharePayload | undefined;
    if (!payload || payload.schema !== TACTICS_BOARD_SHARE_SCHEMA) {
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
        payload,
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
