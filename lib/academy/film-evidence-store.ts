import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { TEAM_ACADEMY_COLLECTIONS } from "@/lib/academy/team-data";
import type {
  AcademyFilmEvidenceAttachment,
  AcademyFilmReference,
} from "@/lib/academy/types";

export type SaveFilmEvidenceAttachmentInput = {
  teamId: string;
  createdBy: string;
  catalogId: string;
  catalogVersion: number;
  filmReference: AcademyFilmReference;
  evidenceTagIds: string[];
  goalIds?: string[];
  playerIds?: string[];
  personIds?: string[];
  note?: string;
  id?: string;
};

/**
 * Persists a coach-confirmed film → evidence-tag → goal attachment.
 * Callers must resolve and confirm tags before saving; this does not invent intent.
 */
export async function saveFilmEvidenceAttachment(
  input: SaveFilmEvidenceAttachmentInput,
): Promise<AcademyFilmEvidenceAttachment> {
  if (!input.evidenceTagIds.length) {
    throw new Error("At least one evidence tag is required.");
  }
  if (!input.filmReference.gameId.trim()) {
    throw new Error("filmReference.gameId is required.");
  }
  const ref = input.id
    ? doc(
        firestore,
        "teams",
        input.teamId,
        TEAM_ACADEMY_COLLECTIONS.filmEvidence,
        input.id,
      )
    : doc(
        collection(
          firestore,
          "teams",
          input.teamId,
          TEAM_ACADEMY_COLLECTIONS.filmEvidence,
        ),
      );
  const payload = {
    id: ref.id,
    teamId: input.teamId,
    catalogId: input.catalogId,
    catalogVersion: input.catalogVersion,
    filmReference: input.filmReference,
    evidenceTagIds: [...new Set(input.evidenceTagIds)],
    ...(input.goalIds?.length ? { goalIds: [...new Set(input.goalIds)] } : {}),
    ...(input.playerIds?.length
      ? { playerIds: [...new Set(input.playerIds)] }
      : {}),
    ...(input.personIds?.length
      ? { personIds: [...new Set(input.personIds)] }
      : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
  return {
    ...payload,
    createdAt: payload.createdAt as Timestamp,
    updatedAt: payload.updatedAt as Timestamp,
  };
}
