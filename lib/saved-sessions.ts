import {
  collection,
  collectionGroup,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { parseVideoAngles, type VideoAngle } from "@/lib/video-angle";

export type SavedClip = { videoId: string; label?: string };

export type SavedChapter = {
  time: number;
  label: string;
  videoId: string;
  /** Shared game-clock moment (markers align across camera angles). */
  gameTime?: number;
};

export type { VideoAngle };

/**
 * Firestore document under `users/{ownerUserId}/savedSessions/{sessionId}`.
 * Template only — live room state stays in Realtime Database.
 */
export type SavedSessionDoc = {
  name: string;
  /** Optional curriculum / program label for dashboard grouping. */
  folder?: string;
  clips: SavedClip[];
  chapters: SavedChapter[];
  currentClipIndex: number;
  /** Alternate camera feeds (single-clip sessions); omitted when not used. */
  angles?: VideoAngle[];
  currentAngleId?: string;
  ownerUserId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  /** Present when `isShared` is true — link-based template sharing. */
  shareId?: string;
  isShared?: boolean;
};

function sessionsCol(ownerUserId: string) {
  return collection(firestore, "users", ownerUserId, "savedSessions");
}

function generateShareId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

/** Best-effort message for Firestore / client errors (includes `code` when present). */
function firestoreErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown };
    const msg = typeof o.message === "string" ? o.message.trim() : "";
    const code = typeof o.code === "string" ? o.code : "";
    if (msg && code) return `${msg} (${code})`;
    if (msg) return msg;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

function firestoreErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string" && c.trim() !== "") return c;
  }
  return undefined;
}

/** Result of `getSavedSessionByShareId` — distinguishes missing template vs Firestore failures. */
export type SharedSessionLookupResult =
  | {
      ok: true;
      id: string;
      ownerUserId: string;
      data: SavedSessionDoc;
    }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "query_failed"; code?: string; message: string };

function parseSavedSessionFields(
  v: Record<string, unknown>,
  ownerUserId: string,
): Omit<SavedSessionDoc, "createdAt" | "updatedAt"> & {
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
} {
  const shareIdRaw = v.shareId;
  const isShared = v.isShared === true;
  const shareId =
    isShared &&
    typeof shareIdRaw === "string" &&
    shareIdRaw.trim() !== ""
      ? shareIdRaw.trim()
      : undefined;
  const folderRaw = v.folder;
  const folder =
    typeof folderRaw === "string" && folderRaw.trim() !== ""
      ? folderRaw.trim()
      : undefined;
  const clips: SavedClip[] = Array.isArray(v.clips) ? (v.clips as SavedClip[]) : [];
  const currentClipIndex =
    typeof v.currentClipIndex === "number" && Number.isFinite(v.currentClipIndex)
      ? Math.floor(v.currentClipIndex)
      : 0;
  const safeIdx = Math.min(
    Math.max(0, currentClipIndex),
    Math.max(0, clips.length - 1),
  );
  const fallbackVid = clips[safeIdx]?.videoId ?? clips[0]?.videoId ?? "";
  const chapters = parseSavedChapters(v.chapters);
  const angles =
    typeof fallbackVid === "string" && /^[a-zA-Z0-9_-]{11}$/.test(fallbackVid)
      ? parseVideoAngles(v.angles, fallbackVid)
      : parseVideoAngles(undefined, "xxxxxxxxxxx");
  const currentAngleIdRaw = v.currentAngleId;
  const currentAngleId =
    typeof currentAngleIdRaw === "string" &&
    currentAngleIdRaw.trim() !== "" &&
    angles.some((a) => a.id === currentAngleIdRaw.trim())
      ? currentAngleIdRaw.trim()
      : angles[0]?.id;
  return {
    name: typeof v.name === "string" ? v.name : "Session",
    ...(folder ? { folder } : {}),
    clips,
    chapters,
    currentClipIndex,
    ...(angles.length > 1
      ? { angles, currentAngleId: currentAngleId ?? angles[0]!.id }
      : {}),
    ownerUserId:
      typeof v.ownerUserId === "string" ? v.ownerUserId : ownerUserId,
    createdAt: v.createdAt instanceof Timestamp ? v.createdAt : undefined,
    updatedAt: v.updatedAt instanceof Timestamp ? v.updatedAt : undefined,
    ...(shareId ? { shareId, isShared: true as const } : {}),
  };
}

function parseSavedChapters(raw: unknown): SavedChapter[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedChapter[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.time !== "number" || typeof o.videoId !== "string") {
      continue;
    }
    const label =
      typeof o.label === "string" && o.label.trim() !== ""
        ? o.label.trim()
        : "Chapter";
    const gameTime =
      typeof o.gameTime === "number" && Number.isFinite(o.gameTime)
        ? o.gameTime
        : undefined;
    out.push({
      time: o.time,
      label,
      videoId: o.videoId,
      ...(gameTime !== undefined ? { gameTime } : {}),
    });
  }
  return out;
}

export async function saveSessionTemplate(
  ownerUserId: string,
  data: {
    name: string;
    clips: SavedClip[];
    chapters: SavedChapter[];
    currentClipIndex: number;
    /** Trimmed; omit or empty to store no folder field. */
    folder?: string;
    angles?: VideoAngle[];
    currentAngleId?: string;
  },
): Promise<string> {
  const ref = doc(sessionsCol(ownerUserId));
  const now = serverTimestamp();
  const folderTrim =
    typeof data.folder === "string" ? data.folder.trim() : "";
  const multiAngle =
    Array.isArray(data.angles) && data.angles.length > 1 ? data.angles : null;
  await setDoc(ref, {
    name: data.name,
    clips: data.clips,
    chapters: data.chapters,
    currentClipIndex: data.currentClipIndex,
    ownerUserId,
    createdAt: now,
    updatedAt: now,
    ...(folderTrim !== "" ? { folder: folderTrim } : {}),
    ...(multiAngle
      ? {
          angles: multiAngle,
          currentAngleId:
            data.currentAngleId &&
            multiAngle.some((a) => a.id === data.currentAngleId)
              ? data.currentAngleId
              : multiAngle[0]!.id,
        }
      : {}),
  });
  return ref.id;
}

/**
 * Update display name and optional folder (empty string clears `folder` on the doc).
 */
export async function updateSavedSessionMetadata(
  ownerUserId: string,
  sessionId: string,
  patch: { name: string; folder: string },
): Promise<void> {
  const ref = doc(sessionsCol(ownerUserId), sessionId);
  const name =
    typeof patch.name === "string" && patch.name.trim() !== ""
      ? patch.name.trim()
      : "Session";
  const folderTrim =
    typeof patch.folder === "string" ? patch.folder.trim() : "";
  await updateDoc(ref, {
    name,
    updatedAt: serverTimestamp(),
    ...(folderTrim !== "" ? { folder: folderTrim } : { folder: deleteField() }),
  });
}

export async function listSavedSessions(
  ownerUserId: string,
): Promise<Array<{ id: string; data: SavedSessionDoc }>> {
  const snap = await getDocs(sessionsCol(ownerUserId));
  const out: Array<{ id: string; data: SavedSessionDoc }> = [];
  snap.forEach((d) => {
    const v = parseSavedSessionFields(
      d.data() as Record<string, unknown>,
      ownerUserId,
    );
    out.push({
      id: d.id,
      data: {
        name: v.name,
        ...(v.folder ? { folder: v.folder } : {}),
        clips: v.clips,
        chapters: v.chapters,
        currentClipIndex: v.currentClipIndex,
        ...(Array.isArray(v.angles) && v.angles.length > 1
          ? {
              angles: v.angles,
              currentAngleId: v.currentAngleId ?? v.angles[0]!.id,
            }
          : {}),
        ownerUserId: v.ownerUserId,
        createdAt: v.createdAt ?? null,
        updatedAt: v.updatedAt ?? null,
        ...(v.shareId && v.isShared ? { shareId: v.shareId, isShared: true } : {}),
      },
    });
  });
  out.sort((a, b) => {
    const tb = b.data.updatedAt?.toMillis?.() ?? 0;
    const ta = a.data.updatedAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
  return out;
}

export async function getSavedSession(
  ownerUserId: string,
  sessionId: string,
): Promise<SavedSessionDoc | null> {
  const d = await getDoc(doc(sessionsCol(ownerUserId), sessionId));
  if (!d.exists()) return null;
  const v = parseSavedSessionFields(
    d.data() as Record<string, unknown>,
    ownerUserId,
  );
  return {
    name: v.name,
    ...(v.folder ? { folder: v.folder } : {}),
    clips: v.clips,
    chapters: v.chapters,
    currentClipIndex: v.currentClipIndex,
    ...(Array.isArray(v.angles) && v.angles.length > 1
      ? {
          angles: v.angles,
          currentAngleId: v.currentAngleId ?? v.angles[0]!.id,
        }
      : {}),
    ownerUserId: v.ownerUserId,
    createdAt: v.createdAt ?? null,
    updatedAt: v.updatedAt ?? null,
    ...(v.shareId && v.isShared ? { shareId: v.shareId, isShared: true } : {}),
  };
}

/**
 * Ensures the session has a share link: creates `shareId` + `isShared` or returns existing.
 */
export async function ensureSessionSharing(
  ownerUserId: string,
  sessionId: string,
): Promise<string> {
  const ref = doc(sessionsCol(ownerUserId), sessionId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    console.error("[saved-sessions] ensureSessionSharing getDoc failed:", err);
    throw new Error(
      firestoreErrorMessage(
        err,
        "Could not read this session from Firestore (check rules and network).",
      ),
    );
  }
  if (!snap.exists()) {
    throw new Error("Session not found.");
  }
  const raw = snap.data() as Record<string, unknown>;
  const parsed = parseSavedSessionFields(raw, ownerUserId);
  if (parsed.isShared && parsed.shareId) {
    const existing = parsed.shareId.trim();
    if (!existing) {
      throw new Error("Saved session has invalid share id; try again.");
    }
    return existing;
  }
  const shareId = generateShareId().trim();
  if (!shareId) {
    throw new Error("Could not generate a share id.");
  }
  try {
    await updateDoc(ref, {
      shareId,
      isShared: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[saved-sessions] ensureSessionSharing updateDoc failed:", err);
    throw new Error(
      firestoreErrorMessage(
        err,
        "Could not save sharing fields (check Firestore rules for session updates).",
      ),
    );
  }
  return shareId;
}

/**
 * Fetch a shared template by public `shareId` (collection group query).
 * Returns `not_found` when the query succeeds but no matching shared doc exists;
 * returns `query_failed` when Firestore throws (permissions, index, network, etc.).
 */
export async function getSavedSessionByShareId(
  shareId: string,
): Promise<SharedSessionLookupResult> {
  const trimmed = shareId.trim();
  if (!trimmed) {
    console.log(
      "[saved-sessions] getSavedSessionByShareId: empty shareId after trim",
    );
    return { ok: false, kind: "not_found" };
  }

  console.log(
    "[saved-sessions] getSavedSessionByShareId: request shareId=",
    trimmed,
  );

  const q = query(
    collectionGroup(firestore, "savedSessions"),
    where("shareId", "==", trimmed),
    where("isShared", "==", true),
    limit(1),
  );

  console.log(
    "[saved-sessions] getSavedSessionByShareId: collectionGroup query started (savedSessions: shareId + isShared==true)",
  );

  let snap;
  try {
    snap = await getDocs(q);
  } catch (err) {
    const code = firestoreErrorCode(err);
    const message = firestoreErrorMessage(
      err,
      "Firestore collection group query failed.",
    );
    console.error(
      "[saved-sessions] getSavedSessionByShareId: Firestore error",
      { code, message, err },
    );
    return { ok: false, kind: "query_failed", code, message };
  }

  console.log(
    "[saved-sessions] getSavedSessionByShareId: query success empty=",
    snap.empty,
  );

  if (snap.empty) {
    console.log(
      "[saved-sessions] getSavedSessionByShareId: zero results for shareId=",
      trimmed,
    );
    return { ok: false, kind: "not_found" };
  }

  const d = snap.docs[0];
  const pathParts = d.ref.path.split("/");
  const ownerIdx = pathParts.indexOf("users");
  const ownerUserId =
    ownerIdx >= 0 && pathParts[ownerIdx + 1]
      ? pathParts[ownerIdx + 1]!
      : "";
  const v = parseSavedSessionFields(
    d.data() as Record<string, unknown>,
    ownerUserId,
  );
  if (!v.isShared || !v.shareId) {
    console.warn(
      "[saved-sessions] getSavedSessionByShareId: matched doc is not a shared template (missing isShared/shareId); treating as not_found path=",
      d.ref.path,
    );
    return { ok: false, kind: "not_found" };
  }

  console.log(
    "[saved-sessions] getSavedSessionByShareId: resolved template id=",
    d.id,
    "ownerUserId=",
    ownerUserId,
  );

  return {
    ok: true,
    id: d.id,
    ownerUserId,
    data: {
      name: v.name,
      ...(v.folder ? { folder: v.folder } : {}),
      clips: v.clips,
      chapters: v.chapters,
      currentClipIndex: v.currentClipIndex,
      ...(Array.isArray(v.angles) && v.angles.length > 1
        ? {
            angles: v.angles,
            currentAngleId: v.currentAngleId ?? v.angles[0]!.id,
          }
        : {}),
      ownerUserId: v.ownerUserId,
      createdAt: v.createdAt ?? null,
      updatedAt: v.updatedAt ?? null,
      shareId: v.shareId,
      isShared: true,
    },
  };
}

/**
 * Copy template content into the signed-in user's library (no share fields).
 */
export async function duplicateSessionToMyLibrary(
  ownerUserId: string,
  source: SavedSessionDoc,
): Promise<string> {
  const folderDup =
    typeof source.folder === "string" && source.folder.trim() !== ""
      ? source.folder.trim()
      : undefined;
  return saveSessionTemplate(ownerUserId, {
    name: source.name,
    ...(folderDup ? { folder: folderDup } : {}),
    clips: source.clips.map((c) => ({
      videoId: c.videoId,
      ...(c.label?.trim() ? { label: c.label.trim() } : {}),
    })),
    chapters: source.chapters.map((ch) => ({
      time: ch.time,
      label: ch.label,
      videoId: ch.videoId,
      ...(typeof ch.gameTime === "number" ? { gameTime: ch.gameTime } : {}),
    })),
    currentClipIndex: Math.min(
      Math.max(0, source.currentClipIndex),
      Math.max(0, source.clips.length - 1),
    ),
    ...(source.angles && source.angles.length > 1
      ? {
          angles: source.angles.map((a) => ({ ...a })),
          currentAngleId:
            source.currentAngleId &&
            source.angles.some((x) => x.id === source.currentAngleId)
              ? source.currentAngleId
              : source.angles[0]!.id,
        }
      : {}),
  });
}
