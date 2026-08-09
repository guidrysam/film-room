import "server-only";

import {
  FieldValue,
  type DocumentReference,
} from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { isAngleSlot, labelForAngleSlot } from "@/lib/drive/angle-slots";
import {
  parseGameCapSidecar,
  sidecarEventsToTimelineInputs,
  type GameCapSidecar,
} from "@/lib/gamecap-sidecar";
import type { FilmOrganizeKind } from "@/lib/drive/complete-inbox-upload";

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export type CompleteYouTubeUploadInput = {
  uid: string;
  youtubeVideoId: string;
  angleSlot: string;
  gameId?: string;
  fileName?: string;
  title?: string;
  organizeKind?: FilmOrganizeKind;
  createdByName?: string;
  recordedStartTime?: string;
  durationSec?: number;
  sidecar?: unknown;
  privacyStatus?: "private" | "unlisted" | "public";
};

function parseVideoId(raw: string): string {
  const id = raw.trim();
  if (!YT_ID_RE.test(id)) throw new Error("INVALID_YOUTUBE_VIDEO_ID");
  return id;
}

/**
 * Attach a YouTube VOD (Game Cap native upload) to My Film inbox or a game,
 * importing Main-angle sidecar marks when present.
 */
export async function completeYouTubeUploadAdmin(
  input: CompleteYouTubeUploadInput,
): Promise<{ sourceId: string; marksImported: number; scope: "inbox" | "game" }> {
  if (!isAngleSlot(input.angleSlot)) throw new Error("INVALID_ANGLE_SLOT");
  const videoId = parseVideoId(input.youtubeVideoId);
  const privacy = input.privacyStatus ?? "unlisted";
  const gameId =
    typeof input.gameId === "string" ? input.gameId.trim() : "";

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

  if (gameId) {
    return attachToGame({
      gameId,
      uid: input.uid,
      videoId,
      angleSlot: input.angleSlot,
      label,
      privacy,
      recordedStart,
      createdByName: input.createdByName,
      durationSec: input.durationSec,
      sidecar: input.sidecar,
    });
  }

  return attachToInbox({
    uid: input.uid,
    videoId,
    angleSlot: input.angleSlot,
    label,
    privacy,
    recordedStart,
    organizeKind: input.organizeKind,
    createdByName: input.createdByName,
    durationSec: input.durationSec,
    sidecar: input.sidecar,
  });
}

async function attachToInbox(opts: {
  uid: string;
  videoId: string;
  angleSlot: string;
  label: string;
  privacy: "private" | "unlisted" | "public";
  recordedStart?: string;
  organizeKind?: FilmOrganizeKind;
  createdByName?: string;
  durationSec?: number;
  sidecar?: unknown;
}): Promise<{ sourceId: string; marksImported: number; scope: "inbox" }> {
  const organizeKind: FilmOrganizeKind =
    opts.organizeKind === "practice" ||
    opts.organizeKind === "game" ||
    opts.organizeKind === "other"
      ? opts.organizeKind
      : "other";

  const sourceRef = adminFirestore
    .collection("users")
    .doc(opts.uid)
    .collection("filmSources")
    .doc();

  await sourceRef.set({
    id: sourceRef.id,
    ownerUid: opts.uid,
    kind: "youtube",
    label: opts.label,
    organizeKind,
    status: "ready",
    videoId: opts.videoId,
    youtubeVideoId: opts.videoId,
    youtubePrivacyStatus: opts.privacy,
    angleSlot: opts.angleSlot,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(opts.videoId)}`,
    uploadedBy: opts.uid,
    createdBy: opts.uid,
    ...(typeof opts.createdByName === "string" && opts.createdByName.trim()
      ? { createdByName: opts.createdByName.trim() }
      : {}),
    ...(opts.recordedStart ? { recordedStartTime: opts.recordedStart } : {}),
    ...(typeof opts.durationSec === "number" &&
    Number.isFinite(opts.durationSec) &&
    opts.durationSec > 0
      ? { durationSec: opts.durationSec }
      : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const marksImported = await importSidecarEvents({
    eventsParent: sourceRef,
    gameRef: null,
    sourceId: sourceRef.id,
    uid: opts.uid,
    angleSlot: opts.angleSlot,
    sidecar: opts.sidecar,
    createdByName: opts.createdByName,
  });

  return { sourceId: sourceRef.id, marksImported, scope: "inbox" };
}

async function attachToGame(opts: {
  gameId: string;
  uid: string;
  videoId: string;
  angleSlot: string;
  label: string;
  privacy: "private" | "unlisted" | "public";
  recordedStart?: string;
  createdByName?: string;
  durationSec?: number;
  sidecar?: unknown;
}): Promise<{ sourceId: string; marksImported: number; scope: "game" }> {
  const gameRef = adminFirestore.collection("games").doc(opts.gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) throw new Error("GAME_NOT_FOUND");
  const game = gameSnap.data() ?? {};

  const contributors =
    game.contributors && typeof game.contributors === "object"
      ? { ...(game.contributors as Record<string, string>) }
      : {};
  if (
    game.ownerId !== opts.uid &&
    contributors[opts.uid] !== "owner" &&
    contributors[opts.uid] !== "editor"
  ) {
    contributors[opts.uid] = "editor";
    await gameRef.set(
      {
        contributors,
        memberUids: FieldValue.arrayUnion(opts.uid),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  const sourceRef = gameRef.collection("sources").doc();
  await sourceRef.set({
    id: sourceRef.id,
    gameId: opts.gameId,
    kind: "youtube",
    label: opts.label,
    videoId: opts.videoId,
    angleSlot: opts.angleSlot,
    offsetFromGameTime: 0,
    uploadOwner: "parent",
    uploadedBy: opts.uid,
    createdBy: opts.uid,
    youtubePrivacyStatus: opts.privacy,
    syncStatus: "unsynced",
    memberUids: [opts.uid],
    ...(typeof opts.createdByName === "string" && opts.createdByName.trim()
      ? { createdByName: opts.createdByName.trim() }
      : {}),
    ...(opts.recordedStart ? { recordedStartTime: opts.recordedStart } : {}),
    ...(typeof opts.durationSec === "number" &&
    Number.isFinite(opts.durationSec) &&
    opts.durationSec > 0
      ? { durationSec: opts.durationSec }
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

  const marksImported = await importSidecarEvents({
    eventsParent: sourceRef,
    gameRef,
    sourceId: sourceRef.id,
    uid: opts.uid,
    angleSlot: opts.angleSlot,
    sidecar: opts.sidecar,
    createdByName: opts.createdByName,
  });

  return { sourceId: sourceRef.id, marksImported, scope: "game" };
}

async function importSidecarEvents(opts: {
  eventsParent: DocumentReference;
  gameRef: DocumentReference | null;
  sourceId: string;
  uid: string;
  angleSlot: string;
  sidecar?: unknown;
  createdByName?: string;
}): Promise<number> {
  if (opts.sidecar == null || opts.angleSlot !== "main") return 0;
  const sidecar = parseGameCapSidecar(opts.sidecar);
  const events = sidecarEventsToTimelineInputs(sidecar, {
    mainOffsetFromGameTime: 0,
    sourceId: opts.sourceId,
    createdBy: opts.uid,
    createdByName: opts.createdByName,
  });
  if (events.length === 0) return 0;

  const batch = adminFirestore.batch();
  const eventIds: string[] = [];

  if (opts.gameRef) {
    for (const ev of events) {
      const eventRef = opts.gameRef.collection("events").doc();
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
        memberUids: [opts.uid],
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    batch.set(
      opts.gameRef,
      {
        eventIds: FieldValue.arrayUnion(...eventIds),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    for (const ev of events) {
      const eventRef = opts.eventsParent.collection("events").doc();
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
    batch.set(
      opts.eventsParent,
      {
        marksImported: events.length,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
  return events.length;
}
