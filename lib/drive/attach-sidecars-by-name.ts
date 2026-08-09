import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import {
  downloadDriveFileJson,
  listDriveFolderFiles,
} from "@/lib/drive/folders";
import {
  isJsonDriveName,
  mediaStemsMatch,
  rankSourceForSidecar,
} from "@/lib/drive/sidecar-stem";
import {
  ensureGameDriveFolders,
  getTeamVaultAccessToken,
} from "@/lib/drive/team-vault";
import { getUserVaultAccessToken } from "@/lib/drive/user-vault";
import {
  parseGameCapSidecar,
  sidecarEventsToTimelineInputs,
} from "@/lib/gamecap-sidecar";

export type AttachSidecarMatch = {
  jsonName: string;
  jsonFileId: string;
  sourceId: string;
  sourceLabel: string;
  marksImported: number;
  marksSkipped: number;
};

export type AttachSidecarsResult = {
  scannedJson: number;
  matched: AttachSidecarMatch[];
  unmatchedJson: string[];
};

type GameSourceRow = {
  id: string;
  kind?: string;
  label?: string;
  angleSlot?: string;
  offsetFromGameTime?: number;
  videoId?: string;
};

type ListedJson = {
  id: string;
  name: string;
  accessToken: string;
};

function eventDocId(opts: {
  recordingId?: string;
  eventId?: string;
  type: string;
  t: number;
}): string {
  const raw =
    opts.eventId?.trim() ||
    `${opts.recordingId ?? "rec"}_${opts.type}_${opts.t}`;
  return `gc_${raw}`.replace(/[/.#$[\]]/g, "_").slice(0, 200);
}

function pickMatchingSource(
  sources: GameSourceRow[],
  stems: string[],
): GameSourceRow | null {
  const scored = sources
    .map((s) => {
      const label = typeof s.label === "string" ? s.label : "";
      const hit = stems.some((stem) => mediaStemsMatch(stem, label));
      if (!hit) return null;
      return { source: s, score: rankSourceForSidecar(s) };
    })
    .filter((x): x is { source: GameSourceRow; score: number } => x != null);
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.source ?? null;
}

async function collectJsonFromFolders(
  accessToken: string,
  folderIds: string[],
): Promise<ListedJson[]> {
  const unique = Array.from(new Set(folderIds.filter(Boolean)));
  const listed = (
    await Promise.all(
      unique.map((folderId) => listDriveFolderFiles({ accessToken, folderId })),
    )
  ).flat();
  const byId = new Map<string, ListedJson>();
  for (const f of listed) {
    if (!isJsonDriveName(f.name)) continue;
    byId.set(f.id, { id: f.id, name: f.name, accessToken });
  }
  return [...byId.values()];
}

/**
 * Find Game Cap `.json` sidecars in personal My Film (preferred) and optional
 * team game vault, match each to a same-stem YouTube/upload source, import marks.
 */
export async function attachSidecarsFromDriveByName(opts: {
  gameId: string;
  uid: string;
  teamId?: string;
  createdByName?: string;
}): Promise<AttachSidecarsResult> {
  const jsonById = new Map<string, ListedJson>();

  try {
    const user = await getUserVaultAccessToken(opts.uid);
    for (const f of await collectJsonFromFolders(user.accessToken, [
      user.inboxFolderId,
      user.rootFolderId,
    ])) {
      jsonById.set(f.id, f);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg !== "USER_DRIVE_NOT_CONNECTED") throw err;
  }

  if (opts.teamId) {
    try {
      const team = await getTeamVaultAccessToken(opts.teamId);
      const folders = await ensureGameDriveFolders({
        teamId: opts.teamId,
        gameId: opts.gameId,
      });
      for (const f of await collectJsonFromFolders(team.accessToken, [
        folders.driveRawFolderId,
        folders.driveFolderId,
      ])) {
        if (!jsonById.has(f.id)) jsonById.set(f.id, f);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg !== "DRIVE_NOT_CONNECTED") throw err;
    }
  }

  if (jsonById.size === 0) {
    // Nothing to scan — distinguish no Drive at all vs empty folders.
    try {
      await getUserVaultAccessToken(opts.uid);
    } catch {
      if (!opts.teamId) throw new Error("USER_DRIVE_NOT_CONNECTED");
      try {
        await getTeamVaultAccessToken(opts.teamId);
      } catch {
        throw new Error("USER_DRIVE_NOT_CONNECTED");
      }
    }
  }

  const jsonFiles = [...jsonById.values()];

  const sourcesSnap = await adminFirestore
    .collection("games")
    .doc(opts.gameId)
    .collection("sources")
    .get();
  const sources: GameSourceRow[] = sourcesSnap.docs.map((d) => {
    const data = d.data() ?? {};
    return {
      id: d.id,
      ...(typeof data.kind === "string" ? { kind: data.kind } : {}),
      ...(typeof data.label === "string" ? { label: data.label } : {}),
      ...(typeof data.angleSlot === "string"
        ? { angleSlot: data.angleSlot }
        : {}),
      ...(typeof data.offsetFromGameTime === "number"
        ? { offsetFromGameTime: data.offsetFromGameTime }
        : {}),
      ...(typeof data.videoId === "string" ? { videoId: data.videoId } : {}),
    };
  });

  const existingSnap = await adminFirestore
    .collection("games")
    .doc(opts.gameId)
    .collection("events")
    .get();
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));
  const existingGameCapKeys = new Set<string>();
  for (const d of existingSnap.docs) {
    const payload = d.data()?.payload as Record<string, unknown> | undefined;
    if (payload?.importedFrom !== "gamecap_sidecar") continue;
    const eid =
      typeof payload.gameCapEventId === "string"
        ? payload.gameCapEventId.trim()
        : "";
    const rid =
      typeof payload.recordingId === "string" ? payload.recordingId.trim() : "";
    const elapsed =
      typeof payload.recordingElapsedSeconds === "number"
        ? payload.recordingElapsedSeconds
        : null;
    const type =
      typeof payload.gameCapType === "string" ? payload.gameCapType.trim() : "";
    if (eid) existingGameCapKeys.add(`id:${eid}`);
    if (rid && type && elapsed != null) {
      existingGameCapKeys.add(`rt:${rid}:${type}:${elapsed}`);
    }
  }

  const matched: AttachSidecarMatch[] = [];
  const unmatchedJson: string[] = [];
  const gameRef = adminFirestore.collection("games").doc(opts.gameId);

  for (const jsonFile of jsonFiles) {
    let raw: unknown;
    try {
      raw = await downloadDriveFileJson({
        accessToken: jsonFile.accessToken,
        fileId: jsonFile.id,
      });
    } catch (e) {
      console.warn("[attach-sidecars] download failed", jsonFile.name, e);
      unmatchedJson.push(jsonFile.name);
      continue;
    }

    let sidecar;
    try {
      sidecar = parseGameCapSidecar(raw);
    } catch {
      unmatchedJson.push(jsonFile.name);
      continue;
    }

    const stems = [
      jsonFile.name,
      typeof sidecar.movieFilename === "string" ? sidecar.movieFilename : "",
    ].filter(Boolean);

    const source = pickMatchingSource(sources, stems);
    if (!source) {
      unmatchedJson.push(jsonFile.name);
      continue;
    }

    const inputs = sidecarEventsToTimelineInputs(sidecar, {
      mainOffsetFromGameTime: source.offsetFromGameTime ?? 0,
      sourceId: source.id,
      createdBy: opts.uid,
      createdByName: opts.createdByName,
    });

    let marksImported = 0;
    let marksSkipped = 0;
    const batch = adminFirestore.batch();
    const newEventIds: string[] = [];

    for (const ev of inputs) {
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      const gameCapEventId =
        typeof payload.gameCapEventId === "string"
          ? payload.gameCapEventId.trim()
          : "";
      const recordingId =
        typeof payload.recordingId === "string"
          ? payload.recordingId.trim()
          : "";
      const gameCapType =
        typeof payload.gameCapType === "string"
          ? payload.gameCapType.trim()
          : "";
      const elapsed =
        typeof payload.recordingElapsedSeconds === "number"
          ? payload.recordingElapsedSeconds
          : ev.t;

      const dedupeKeys = [
        gameCapEventId ? `id:${gameCapEventId}` : "",
        recordingId && gameCapType
          ? `rt:${recordingId}:${gameCapType}:${elapsed}`
          : "",
      ].filter(Boolean);

      if (dedupeKeys.some((k) => existingGameCapKeys.has(k))) {
        marksSkipped += 1;
        continue;
      }

      const docId = eventDocId({
        recordingId,
        eventId: gameCapEventId,
        type: gameCapType || "mark",
        t: ev.t,
      });
      if (existingIds.has(docId)) {
        marksSkipped += 1;
        continue;
      }

      const eventRef = gameRef.collection("events").doc(docId);
      newEventIds.push(docId);
      existingIds.add(docId);
      for (const k of dedupeKeys) existingGameCapKeys.add(k);

      batch.set(
        eventRef,
        {
          id: docId,
          type: ev.type,
          t: ev.t,
          ...(ev.label ? { label: ev.label } : {}),
          ...(ev.sourceId ? { sourceId: ev.sourceId } : {}),
          ...(ev.payload
            ? {
                payload: {
                  ...ev.payload,
                  driveSidecarFileId: jsonFile.id,
                  driveSidecarName: jsonFile.name,
                },
              }
            : {}),
          ...(ev.createdBy ? { createdBy: ev.createdBy } : {}),
          ...(ev.createdByName ? { createdByName: ev.createdByName } : {}),
          memberUids: [opts.uid],
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      marksImported += 1;
    }

    if (newEventIds.length > 0) {
      batch.set(
        gameRef,
        {
          eventIds: FieldValue.arrayUnion(...newEventIds),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await batch.commit();
    }

    matched.push({
      jsonName: jsonFile.name,
      jsonFileId: jsonFile.id,
      sourceId: source.id,
      sourceLabel: source.label ?? source.id,
      marksImported,
      marksSkipped,
    });
  }

  return {
    scannedJson: jsonFiles.length,
    matched,
    unmatchedJson,
  };
}
