/**
 * Per-user camera preset persistence (Firestore).
 *
 * Camera presets (reusable YouTube RTMP stream key + ingest + channel refs)
 * were previously stored only in `localStorage`, which Safari/iOS evicts after
 * ~7 days of inactivity and which never follows the user across devices. We now
 * mirror them to `users/{uid}/cameraPresets/{presetId}` so the reusable stream
 * key survives storage eviction and syncs everywhere the user signs in.
 *
 * `localStorage` stays as a fast offline cache; Firestore is authoritative.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export type CameraPreset = {
  id: string;
  name: string;
  streamId: string;
  ingestionAddress: string;
  streamName: string;
  channelId?: string;
  channelHandle?: string;
  persistentLiveUrl?: string;
  lastWatchUrl?: string;
  lastVerifiedAt?: string;
  lastVerifiedStreamTitle?: string;
  lastVerifiedStreamStatus?: string;
  /** ISO string used for ordering. */
  createdAt: string;
};

function presetsCol(uid: string) {
  return collection(firestore, "users", uid, "cameraPresets");
}

function optStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/** Parse a Firestore preset doc; drops records missing required identity. */
export function parseCameraPreset(
  id: string,
  raw: Record<string, unknown>,
): CameraPreset | null {
  const name = optStr(raw.name);
  const streamId = optStr(raw.streamId);
  if (!name || !streamId) return null;
  return {
    id,
    name,
    streamId,
    ingestionAddress:
      typeof raw.ingestionAddress === "string" ? raw.ingestionAddress : "",
    streamName: typeof raw.streamName === "string" ? raw.streamName : "",
    ...(optStr(raw.channelId) ? { channelId: optStr(raw.channelId)! } : {}),
    ...(optStr(raw.channelHandle)
      ? { channelHandle: optStr(raw.channelHandle)! }
      : {}),
    ...(optStr(raw.persistentLiveUrl)
      ? { persistentLiveUrl: optStr(raw.persistentLiveUrl)! }
      : {}),
    ...(optStr(raw.lastWatchUrl)
      ? { lastWatchUrl: optStr(raw.lastWatchUrl)! }
      : {}),
    ...(optStr(raw.lastVerifiedAt)
      ? { lastVerifiedAt: optStr(raw.lastVerifiedAt)! }
      : {}),
    ...(optStr(raw.lastVerifiedStreamTitle)
      ? { lastVerifiedStreamTitle: optStr(raw.lastVerifiedStreamTitle)! }
      : {}),
    ...(optStr(raw.lastVerifiedStreamStatus)
      ? { lastVerifiedStreamStatus: optStr(raw.lastVerifiedStreamStatus)! }
      : {}),
    createdAt: optStr(raw.createdAt) ?? new Date(0).toISOString(),
  };
}

/** Load all of a user's camera presets from Firestore. */
export async function loadCameraPresets(uid: string): Promise<CameraPreset[]> {
  const snap = await getDocs(presetsCol(uid));
  const out: CameraPreset[] = [];
  snap.forEach((d) => {
    const parsed = parseCameraPreset(d.id, d.data() as Record<string, unknown>);
    if (parsed) out.push(parsed);
  });
  return out;
}

/** Create or update a single preset in Firestore (best-effort write-through). */
export async function saveCameraPresetToCloud(
  uid: string,
  preset: CameraPreset,
): Promise<void> {
  const payload: Record<string, unknown> = {
    name: preset.name,
    streamId: preset.streamId,
    ingestionAddress: preset.ingestionAddress,
    streamName: preset.streamName,
    createdAt: preset.createdAt,
    updatedAt: serverTimestamp(),
    ...(preset.channelId ? { channelId: preset.channelId } : {}),
    ...(preset.channelHandle ? { channelHandle: preset.channelHandle } : {}),
    ...(preset.persistentLiveUrl
      ? { persistentLiveUrl: preset.persistentLiveUrl }
      : {}),
    ...(preset.lastWatchUrl ? { lastWatchUrl: preset.lastWatchUrl } : {}),
    ...(preset.lastVerifiedAt ? { lastVerifiedAt: preset.lastVerifiedAt } : {}),
    ...(preset.lastVerifiedStreamTitle
      ? { lastVerifiedStreamTitle: preset.lastVerifiedStreamTitle }
      : {}),
    ...(preset.lastVerifiedStreamStatus
      ? { lastVerifiedStreamStatus: preset.lastVerifiedStreamStatus }
      : {}),
  };
  await setDoc(doc(presetsCol(uid), preset.id), payload, { merge: true });
}

/** Remove a preset from Firestore. */
export async function deleteCameraPresetFromCloud(
  uid: string,
  id: string,
): Promise<void> {
  await deleteDoc(doc(presetsCol(uid), id));
}

function presetRecency(p: CameraPreset): number {
  const t = p.lastVerifiedAt ?? p.createdAt;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Union cloud + local presets by id. On conflict the more recently
 * verified/created record wins, so a fresh local verify is not clobbered by a
 * stale cloud copy (and vice-versa).
 */
export function mergeCameraPresets(
  cloud: CameraPreset[],
  local: CameraPreset[],
): CameraPreset[] {
  const byId = new Map<string, CameraPreset>();
  for (const p of cloud) byId.set(p.id, p);
  for (const p of local) {
    const existing = byId.get(p.id);
    if (!existing || presetRecency(p) > presetRecency(existing)) {
      byId.set(p.id, p);
    }
  }
  return [...byId.values()];
}
