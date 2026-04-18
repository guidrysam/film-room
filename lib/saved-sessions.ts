import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export type SavedClip = { videoId: string };

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
};

function sessionsCol(ownerUserId: string) {
  return collection(firestore, "users", ownerUserId, "savedSessions");
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
    const v = d.data() as Omit<SavedSessionDoc, "createdAt" | "updatedAt"> & {
      createdAt?: Timestamp;
      updatedAt?: Timestamp;
    };
    out.push({
      id: d.id,
      data: {
        name: v.name,
        clips: v.clips ?? [],
        chapters: v.chapters ?? [],
        currentClipIndex: v.currentClipIndex ?? 0,
        ownerUserId: v.ownerUserId ?? ownerUserId,
        createdAt: v.createdAt ?? null,
        updatedAt: v.updatedAt ?? null,
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
  const v = d.data() as Record<string, unknown>;
  return {
    name: typeof v.name === "string" ? v.name : "Session",
    clips: Array.isArray(v.clips) ? (v.clips as SavedClip[]) : [],
    chapters: Array.isArray(v.chapters) ? (v.chapters as SavedChapter[]) : [],
    currentClipIndex:
      typeof v.currentClipIndex === "number" ? v.currentClipIndex : 0,
    ownerUserId:
      typeof v.ownerUserId === "string" ? v.ownerUserId : ownerUserId,
    createdAt: v.createdAt instanceof Timestamp ? v.createdAt : null,
    updatedAt: v.updatedAt instanceof Timestamp ? v.updatedAt : null,
  };
}
