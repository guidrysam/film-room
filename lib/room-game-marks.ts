export type RoomGameMarkRole = "host" | "viewer" | "operator";

/** Stored at `rooms/{roomId}/marks/{markId}` */
export type RoomGameMark = {
  id: string;
  label: string;
  timestamp: number;
  angleId?: string;
  createdAt: number;
  createdByRole: RoomGameMarkRole;
  createdByName?: string;
};

/** Stored at `rooms/{roomId}/coachAlerts/latest` */
export type CoachAlertLatest = {
  id: string;
  markId: string;
  label: string;
  timestamp: number;
  angleId?: string;
  createdAt: number;
  createdByName?: string;
};

function isMarkRole(v: unknown): v is RoomGameMarkRole {
  return v === "host" || v === "viewer" || v === "operator";
}

export function parseRoomGameMark(
  id: string,
  raw: unknown,
): RoomGameMark | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  const ts = o.timestamp;
  const createdAt = o.createdAt;
  const role = o.createdByRole;
  if (!label) return null;
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
  if (!isMarkRole(role)) return null;
  const angleId =
    typeof o.angleId === "string" && o.angleId.trim() !== ""
      ? o.angleId.trim()
      : undefined;
  const createdByName =
    typeof o.createdByName === "string" && o.createdByName.trim() !== ""
      ? o.createdByName.trim()
      : undefined;
  return {
    id: typeof o.id === "string" && o.id.trim() !== "" ? o.id.trim() : id,
    label,
    timestamp: ts,
    ...(angleId ? { angleId } : {}),
    createdAt,
    createdByRole: role,
    ...(createdByName ? { createdByName } : {}),
  };
}

export function parseCoachAlertLatest(raw: unknown): CoachAlertLatest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const markId = typeof o.markId === "string" ? o.markId.trim() : "";
  const label = typeof o.label === "string" ? o.label.trim() : "";
  const ts = o.timestamp;
  const createdAt = o.createdAt;
  if (!id || !markId || !label) return null;
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
  const angleId =
    typeof o.angleId === "string" && o.angleId.trim() !== ""
      ? o.angleId.trim()
      : undefined;
  const createdByName =
    typeof o.createdByName === "string" && o.createdByName.trim() !== ""
      ? o.createdByName.trim()
      : undefined;
  return {
    id,
    markId,
    label,
    timestamp: ts,
    ...(angleId ? { angleId } : {}),
    createdAt,
    ...(createdByName ? { createdByName } : {}),
  };
}
