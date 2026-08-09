import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { isAngleSlot, labelForAngleSlot } from "@/lib/drive/angle-slots";
import {
  parseGameCapSidecar,
  sidecarEventsToTimelineInputs,
  type GameCapSidecar,
} from "@/lib/gamecap-sidecar";

export type FilmOrganizeKind = "game" | "practice" | "other";

export type CompleteInboxUploadInput = {
  uid: string;
  angleSlot: string;
  driveFileId: string;
  fileName?: string;
  title?: string;
  organizeKind?: FilmOrganizeKind;
  createdByName?: string;
  recordedStartTime?: string;
  durationSec?: number;
  sidecar?: unknown;
};

/**
 * Attach Drive file to the signed-in user's My Film inbox.
 * Marks from a Main-angle Game Cap sidecar are stored on the film source.
 */
export async function completeInboxUploadAdmin(
  input: CompleteInboxUploadInput,
): Promise<{ sourceId: string; marksImported: number }> {
  if (!isAngleSlot(input.angleSlot)) {
    throw new Error("INVALID_ANGLE_SLOT");
  }
  const driveFileId = input.driveFileId.trim();
  if (!driveFileId) throw new Error("MISSING_DRIVE_FILE_ID");

  const sourceRef = adminFirestore
    .collection("users")
    .doc(input.uid)
    .collection("filmSources")
    .doc();

  const label =
    (typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : "") ||
    (typeof input.fileName === "string" && input.fileName.trim()
      ? input.fileName.trim()
      : "") ||
    labelForAngleSlot(input.angleSlot);

  const recordedStart =
    typeof input.recordedStartTime === "string" && input.recordedStartTime.trim()
      ? input.recordedStartTime.trim()
      : typeof (input.sidecar as GameCapSidecar | undefined)?.recordingStartUTC ===
          "string"
        ? (input.sidecar as GameCapSidecar).recordingStartUTC!.trim()
        : undefined;

  const organizeKind: FilmOrganizeKind =
    input.organizeKind === "practice" ||
    input.organizeKind === "game" ||
    input.organizeKind === "other"
      ? input.organizeKind
      : "other";

  await sourceRef.set({
    id: sourceRef.id,
    ownerUid: input.uid,
    kind: "upload",
    label,
    organizeKind,
    status: "ready",
    driveFileId,
    angleSlot: input.angleSlot,
    storagePath: `drive:${driveFileId}`,
    url: `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`,
    uploadedBy: input.uid,
    createdBy: input.uid,
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
    updatedAt: FieldValue.serverTimestamp(),
  });

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
    for (const ev of events) {
      const eventRef = sourceRef.collection("events").doc();
      batch.set(eventRef, {
        id: eventRef.id,
        type: ev.type,
        t: ev.t,
        ...(ev.label ? { label: ev.label } : {}),
        ...(ev.sourceId ? { sourceId: ev.sourceId } : {}),
        ...(ev.payload ? { payload: ev.payload } : {}),
        ...(ev.createdBy ? { createdBy: ev.createdBy } : {}),
        ...(ev.createdByName ? { createdByName: ev.createdByName } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (events.length > 0) {
      batch.set(
        sourceRef,
        {
          marksImported: events.length,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await batch.commit();
      marksImported = events.length;
    }
  }

  return { sourceId: sourceRef.id, marksImported };
}
