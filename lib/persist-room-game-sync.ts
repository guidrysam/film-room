import { updateGameSourceSync } from "@/lib/games";

/** Round to centiseconds so Firestore matches in-room display. */
export function roundSyncOffsetSeconds(offset: number): number {
  return Math.round(offset * 100) / 100;
}

/**
 * Write a Film Room manual-sync offset back to the linked Game source so
 * Review / highlights use the same alignment after leaving the room.
 */
export async function persistRoomAngleSyncToGame(
  gameId: string,
  sourceId: string,
  offsetFromGameTime: number,
): Promise<void> {
  const gid = gameId.trim();
  const sid = sourceId.trim();
  if (!gid || !sid || !Number.isFinite(offsetFromGameTime)) return;

  await updateGameSourceSync(gid, sid, {
    offsetFromGameTime: roundSyncOffsetSeconds(offsetFromGameTime),
    syncStatus: "manually_synced",
    syncConfidence: "high",
  });
}

/**
 * After pairing two angles in Film Room, persist the secondary offset and
 * ensure the reference angle is marked aligned when it was not already.
 */
export async function persistRoomManualSyncPairToGame(
  gameId: string,
  referenceSourceId: string,
  secondarySourceId: string,
  secondaryOffset: number,
  opts?: { markReferenceSynced?: boolean },
): Promise<void> {
  await persistRoomAngleSyncToGame(
    gameId,
    secondarySourceId,
    secondaryOffset,
  );
  if (opts?.markReferenceSynced) {
    await updateGameSourceSync(gameId.trim(), referenceSourceId.trim(), {
      syncStatus: "manually_synced",
      syncConfidence: "high",
    });
  }
}
