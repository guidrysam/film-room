import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { isAngleSlot, labelForAngleSlot } from "@/lib/drive/angle-slots";
import {
  parseGameCapSidecar,
  sidecarEventsToTimelineInputs,
  type GameCapSidecar,
} from "@/lib/gamecap-sidecar";

export type CompleteVaultUploadInput = {
  gameId: string;
  uid: string;
  angleSlot: string;
  driveFileId: string;
  fileName?: string;
  createdByName?: string;
  recordedStartTime?: string;
  durationSec?: number;
  sidecar?: unknown;
};

/**
 * Attach Drive vault file as a game source and optionally import Game Cap sidecar marks.
 * Admin write — used by Mac / API clients after resumable Drive upload.
 */
export async function completeVaultUploadAdmin(
  input: CompleteVaultUploadInput,
): Promise<{ sourceId: string; marksImported: number }> {
  if (!isAngleSlot(input.angleSlot)) {
    throw new Error("INVALID_ANGLE_SLOT");
  }
  const driveFileId = input.driveFileId.trim();
  if (!driveFileId) throw new Error("MISSING_DRIVE_FILE_ID");

  const gameRef = adminFirestore.collection("games").doc(input.gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) throw new Error("GAME_NOT_FOUND");
  const game = gameSnap.data() ?? {};

  // Ensure contributor access for this uploader when they are a team parent/coach.
  const contributors =
    game.contributors && typeof game.contributors === "object"
      ? { ...(game.contributors as Record<string, string>) }
      : {};
  if (
    game.ownerId !== input.uid &&
    contributors[input.uid] !== "owner" &&
    contributors[input.uid] !== "editor"
  ) {
    contributors[input.uid] = "editor";
    await gameRef.set(
      {
        contributors,
        memberUids: FieldValue.arrayUnion(input.uid),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  const sourceRef = gameRef.collection("sources").doc();
  const label =
    (typeof input.fileName === "string" && input.fileName.trim()
      ? input.fileName.trim()
      : "") || labelForAngleSlot(input.angleSlot);

  const recordedStart =
    typeof input.recordedStartTime === "string" && input.recordedStartTime.trim()
      ? input.recordedStartTime.trim()
      : typeof (input.sidecar as GameCapSidecar | undefined)?.recordingStartUTC ===
          "string"
        ? (input.sidecar as GameCapSidecar).recordingStartUTC!.trim()
        : undefined;

  await sourceRef.set({
    id: sourceRef.id,
    gameId: input.gameId,
    kind: "upload",
    label,
    driveFileId,
    angleSlot: input.angleSlot,
    storagePath: `drive:${driveFileId}`,
    url: `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`,
    offsetFromGameTime: 0,
    uploadOwner: "team",
    uploadedBy: input.uid,
    createdBy: input.uid,
    syncStatus: "unsynced",
    memberUids: [input.uid],
    ...(typeof input.createdByName === "string" && input.createdByName.trim()
      ? { createdByName: input.createdByName.trim() }
      : {}),
    ...(recordedStart ? { recordedStartTime: recordedStart } : {}),
    ...(typeof input.durationSec === "number" &&
    Number.isFinite(input.durationSec) &&
    input.durationSec > 0
      ? { durationSec: input.durationSec }
      : {}),
    createdAt: FieldValue.serverTimestamp(),
  });

  await gameRef.set(
    {
      sourceIds: FieldValue.arrayUnion(sourceRef.id),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  let marksImported = 0;
  if (input.sidecar != null && input.angleSlot === "main") {
    const sidecar = parseGameCapSidecar(input.sidecar);
    const events = sidecarEventsToTimelineInputs(sidecar, {
      mainOffsetFromGameTime: 0,
      sourceId: sourceRef.id,
      createdBy: input.uid,
      createdByName: input.createdByName,
    });
    const batch = adminFirestore.batch();
    const eventIds: string[] = [];
    for (const ev of events) {
      const eventRef = gameRef.collection("events").doc();
      eventIds.push(eventRef.id);
      batch.set(eventRef, {
        id: eventRef.id,
        type: ev.type,
        t: ev.t,
        ...(ev.label ? { label: ev.label } : {}),
        ...(ev.sourceId ? { sourceId: ev.sourceId } : {}),
        ...(ev.payload ? { payload: ev.payload } : {}),
        ...(ev.createdBy ? { createdBy: ev.createdBy } : {}),
        ...(ev.createdByName ? { createdByName: ev.createdByName } : {}),
        memberUids: [input.uid],
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (eventIds.length > 0) {
      batch.set(
        gameRef,
        {
          eventIds: FieldValue.arrayUnion(...eventIds),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await batch.commit();
      marksImported = eventIds.length;
    }
  }

  return { sourceId: sourceRef.id, marksImported };
}
