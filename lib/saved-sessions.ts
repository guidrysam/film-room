import {
  collection,
  collectionGroup,
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

export type SavedClip = { videoId: string; label?: string };

export type SavedChapter = {
  time: number;
  label: string;
  videoId: string;
};

/**
 * Firestore document under `users/{ownerUserId}/savedSessions/{sessionId}`.
 * Template only — live room state stays in Realtime Database.
 */
export type SavedSessionDoc = {
  name: string;
  clips: SavedClip[];
  chapters: SavedChapter[];
  currentClipIndex: number;
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
  return {
    name: typeof v.name === "string" ? v.name : "Session",
    clips: Array.isArray(v.clips) ? (v.clips as SavedClip[]) : [],
    chapters: Array.isArray(v.chapters) ? (v.chapters as SavedChapter[]) : [],
    currentClipIndex:
      typeof v.currentClipIndex === "number" ? v.currentClipIndex : 0,
    ownerUserId:
      typeof v.ownerUserId === "string" ? v.ownerUserId : ownerUserId,
    createdAt: v.createdAt instanceof Timestamp ? v.createdAt : undefined,
    updatedAt: v.updatedAt instanceof Timestamp ? v.updatedAt : undefined,
    ...(shareId ? { shareId, isShared: true as const } : {}),
  };
}

export async function saveSessionTemplate(
  ownerUserId: string,
  data: {
    name: string;
    clips: SavedClip[];
    chapters: SavedChapter[];
    currentClipIndex: number;
  },
): Promise<string> {
  const ref = doc(sessionsCol(ownerUserId));
  const now = serverTimestamp();
  await setDoc(ref, {
    name: data.name,
    clips: data.clips,
    chapters: data.chapters,
    currentClipIndex: data.currentClipIndex,
    ownerUserId,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
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
        clips: v.clips,
        chapters: v.chapters,
        currentClipIndex: v.currentClipIndex,
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
    clips: v.clips,
    chapters: v.chapters,
    currentClipIndex: v.currentClipIndex,
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
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Session not found");
  }
  const raw = snap.data() as Record<string, unknown>;
  const parsed = parseSavedSessionFields(raw, ownerUserId);
  if (parsed.isShared && parsed.shareId) {
    return parsed.shareId;
  }
  const shareId = generateShareId();
  await updateDoc(ref, {
    shareId,
    isShared: true,
    updatedAt: serverTimestamp(),
  });
  return shareId;
}

/**
 * Fetch a shared template by public `shareId` (collection group query).
 */
export async function getSavedSessionByShareId(
  shareId: string,
): Promise<{ id: string; ownerUserId: string; data: SavedSessionDoc } | null> {
  const trimmed = shareId.trim();
  if (!trimmed) return null;
  const q = query(
    collectionGroup(firestore, "savedSessions"),
    where("shareId", "==", trimmed),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
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
  if (!v.isShared || !v.shareId) return null;
  return {
    id: d.id,
    ownerUserId,
    data: {
      name: v.name,
      clips: v.clips,
      chapters: v.chapters,
      currentClipIndex: v.currentClipIndex,
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
  return saveSessionTemplate(ownerUserId, {
    name: source.name,
    clips: source.clips.map((c) => ({
      videoId: c.videoId,
      ...(c.label?.trim() ? { label: c.label.trim() } : {}),
    })),
    chapters: source.chapters.map((ch) => ({
      time: ch.time,
      label: ch.label,
      videoId: ch.videoId,
    })),
    currentClipIndex: Math.min(
      Math.max(0, source.currentClipIndex),
      Math.max(0, source.clips.length - 1),
    ),
  });
}
