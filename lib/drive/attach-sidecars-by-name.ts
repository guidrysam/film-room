import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import {
  isJsonDriveName,
  mediaStemsMatch,
  normalizeMediaStem,
  rankSourceForSidecar,
} from "@/lib/drive/sidecar-stem";
import {
  downloadDriveFileJson,
  findChildFolder,
  listDriveFolderFiles,
  listDriveFolderFilesRecursive,
  searchDriveFilesByNameContains,
} from "@/lib/drive/folders";
import {
  ensureGameDriveFolders,
  getTeamVaultAccessToken,
} from "@/lib/drive/team-vault";
import { getUserVaultAccessToken } from "@/lib/drive/user-vault";
import {
  parseGameCapSidecar,
  sidecarEventsToTimelineInputs,
} from "@/lib/gamecap-sidecar";

/** Also look under My Drive/My Film[/Inbox] (no Film Room parent). */
async function resolveAltMyFilmFolders(
  accessToken: string,
): Promise<string[]> {
  const ids: string[] = [];
  try {
    const myFilm = await findChildFolder({
      accessToken,
      parentId: "root",
      name: "My Film",
    });
    if (!myFilm) return ids;
    ids.push(myFilm);
    const inbox = await findChildFolder({
      accessToken,
      parentId: myFilm,
      name: "Inbox",
    });
    if (inbox) ids.push(inbox);
  } catch (e) {
    console.warn("[attach-sidecars] alt My Film lookup failed", e);
  }
  return ids;
}

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
  /** Why nothing was found (for UI). */
  scanNotes?: string[];
  /** Sample JSON names discovered while scanning. */
  jsonSample?: string[];
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

function isLikelySidecarFile(name: string, mimeType?: string): boolean {
  return isJsonDriveName(name, mimeType);
}

/** Short Drive search needles from a YouTube/source label. */
function searchNeedlesFromLabel(label: string): string[] {
  const stem = normalizeMediaStem(label);
  if (!stem) return [];
  const needles = new Set<string>();
  // Keep enough uniqueness without blowing Drive query length.
  const compact = stem.replace(/[\s._-]+/g, "");
  if (/gamecapmogo/i.test(stem)) {
    needles.add("GameCapMOGO");
    const dateBits = stem.match(/20\d{2}[-\s]?\d{2}[-\s]?\d{2}/);
    if (dateBits?.[0]) needles.add(dateBits[0].replace(/\s+/g, "-"));
  }
  // First ~28 chars of stem (spaces ok for contains).
  const short = stem.slice(0, 28).trim();
  if (short.length >= 6) needles.add(short);
  if (compact.length >= 10) needles.add(compact.slice(0, 18));
  return [...needles];
}

function addJsonFiles(
  into: Map<string, ListedJson>,
  accessToken: string,
  files: Array<{ id: string; name: string; mimeType?: string }>,
): void {
  for (const f of files) {
    if (!isLikelySidecarFile(f.name, f.mimeType)) continue;
    if (!into.has(f.id)) {
      into.set(f.id, { id: f.id, name: f.name, accessToken });
    }
  }
}

/**
 * Find Game Cap `.json` sidecars in personal My Film (recursive) + Drive name
 * search, plus optional team game vault; match to same-stem YouTube sources.
 */
export async function attachSidecarsFromDriveByName(opts: {
  gameId: string;
  uid: string;
  teamId?: string;
  createdByName?: string;
}): Promise<AttachSidecarsResult> {
  const jsonById = new Map<string, ListedJson>();
  const scanNotes: string[] = [];

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

  try {
    const user = await getUserVaultAccessToken(opts.uid);
    // Recursive walk of Film Room / My Film (covers Inbox + nested folders).
    const recursive = await listDriveFolderFilesRecursive({
      accessToken: user.accessToken,
      folderId: user.rootFolderId,
      maxDepth: 5,
      maxFiles: 600,
    });
    addJsonFiles(jsonById, user.accessToken, recursive);
    scanNotes.push(
      `Film Room/My Film: ${recursive.length} files, ${jsonById.size} json`,
    );

    // Also walk Inbox explicitly if different from root.
    if (user.inboxFolderId && user.inboxFolderId !== user.rootFolderId) {
      const inboxFiles = await listDriveFolderFilesRecursive({
        accessToken: user.accessToken,
        folderId: user.inboxFolderId,
        maxDepth: 4,
        maxFiles: 300,
      });
      addJsonFiles(jsonById, user.accessToken, inboxFiles);
    }

    // Alternate layout used by some uploads: My Drive / My Film / Inbox
    // (no "Film Room" parent). Requires drive.readonly after reconnect.
    for (const altId of await resolveAltMyFilmFolders(user.accessToken)) {
      const altFiles = await listDriveFolderFilesRecursive({
        accessToken: user.accessToken,
        folderId: altId,
        maxDepth: 4,
        maxFiles: 400,
      });
      addJsonFiles(jsonById, user.accessToken, altFiles);
    }
    scanNotes.push(`After alt My Film paths: ${jsonById.size} json`);

    // Drive-wide name search from each YouTube/source label.
    const needles = new Set<string>(["GameCapMOGO"]);
    for (const s of sources) {
      if (typeof s.label === "string") {
        for (const n of searchNeedlesFromLabel(s.label)) needles.add(n);
      }
    }
    for (const needle of needles) {
      try {
        const found = await searchDriveFilesByNameContains({
          accessToken: user.accessToken,
          needle,
          pageSize: 50,
        });
        addJsonFiles(jsonById, user.accessToken, found);
      } catch (e) {
        console.warn("[attach-sidecars] search failed", needle, e);
      }
    }
    scanNotes.push(`After name search: ${jsonById.size} json candidates`);
    if (jsonById.size === 0) {
      scanNotes.push(
        "If JSON is visible in Drive but still 0 here, reconnect Drive in My Film (needs read access).",
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg !== "USER_DRIVE_NOT_CONNECTED") throw err;
    scanNotes.push("Personal Drive not connected");
  }

  if (opts.teamId) {
    try {
      const team = await getTeamVaultAccessToken(opts.teamId);
      const folders = await ensureGameDriveFolders({
        teamId: opts.teamId,
        gameId: opts.gameId,
      });
      const teamFiles = await listDriveFolderFilesRecursive({
        accessToken: team.accessToken,
        folderId: folders.driveFolderId,
        maxDepth: 4,
        maxFiles: 400,
      });
      addJsonFiles(jsonById, team.accessToken, teamFiles);
      // raw folder may be outside if structure odd — include explicitly
      const rawFiles = await listDriveFolderFiles({
        accessToken: team.accessToken,
        folderId: folders.driveRawFolderId,
      });
      addJsonFiles(jsonById, team.accessToken, rawFiles);
      scanNotes.push(`Team vault: ${jsonById.size} json candidates total`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg !== "DRIVE_NOT_CONNECTED") throw err;
      scanNotes.push("Team Drive not connected");
    }
  }

  if (jsonById.size === 0) {
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
  const jsonSample = jsonFiles.slice(0, 8).map((f) => f.name);

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
    scanNotes,
    jsonSample,
  };
}
