import "server-only";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import type { AiSyncDraft, AiTagDraft } from "@/lib/ai/tag-schema";
import type { CreditWalletRef } from "@/lib/billing/credits";

export type AiJobKind = "tag" | "sync";
export type AiJobStatus = "running" | "ready" | "failed" | "applied";

export type AiTagJobDoc = {
  kind: AiJobKind;
  status: AiJobStatus;
  gameId: string;
  teamId?: string;
  clubId?: string;
  primarySourceId?: string;
  sourceIds?: string[];
  creditsCharged: number;
  debitLedgerId?: string;
  wallet: CreditWalletRef;
  actorUid: string;
  drafts?: AiTagDraft[];
  syncDrafts?: AiSyncDraft[];
  notes?: string;
  suggestedKickoffOffsetSec?: number;
  error?: string;
  lowEvidence?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

function jobsCol(gameId: string) {
  return adminFirestore.collection("games").doc(gameId).collection("aiTagJobs");
}

export async function createAiJob(input: {
  gameId: string;
  kind: AiJobKind;
  actorUid: string;
  wallet: CreditWalletRef;
  creditsCharged: number;
  teamId?: string;
  clubId?: string;
  primarySourceId?: string;
  sourceIds?: string[];
}): Promise<string> {
  const ref = jobsCol(input.gameId).doc();
  await ref.set({
    kind: input.kind,
    status: "running",
    gameId: input.gameId,
    actorUid: input.actorUid,
    wallet: input.wallet,
    creditsCharged: input.creditsCharged,
    ...(input.teamId ? { teamId: input.teamId } : {}),
    ...(input.clubId ? { clubId: input.clubId } : {}),
    ...(input.primarySourceId
      ? { primarySourceId: input.primarySourceId }
      : {}),
    ...(input.sourceIds ? { sourceIds: input.sourceIds } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function markAiJobReady(input: {
  gameId: string;
  jobId: string;
  debitLedgerId: string;
  drafts?: AiTagDraft[];
  syncDrafts?: AiSyncDraft[];
  notes?: string;
  suggestedKickoffOffsetSec?: number;
  lowEvidence?: boolean;
}): Promise<void> {
  await jobsCol(input.gameId)
    .doc(input.jobId)
    .set(
      {
        status: "ready",
        debitLedgerId: input.debitLedgerId,
        ...(input.drafts ? { drafts: input.drafts } : {}),
        ...(input.syncDrafts ? { syncDrafts: input.syncDrafts } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        ...(typeof input.suggestedKickoffOffsetSec === "number"
          ? { suggestedKickoffOffsetSec: input.suggestedKickoffOffsetSec }
          : {}),
        ...(input.lowEvidence ? { lowEvidence: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function markAiJobFailed(input: {
  gameId: string;
  jobId: string;
  error: string;
}): Promise<void> {
  await jobsCol(input.gameId)
    .doc(input.jobId)
    .set(
      {
        status: "failed",
        error: input.error.slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function getAiJob(
  gameId: string,
  jobId: string,
): Promise<(AiTagJobDoc & { id: string }) | null> {
  const snap = await jobsCol(gameId).doc(jobId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as AiTagJobDoc) };
}

export async function listAiJobsForGame(
  gameId: string,
  limit = 10,
): Promise<Array<AiTagJobDoc & { id: string }>> {
  const snap = await jobsCol(gameId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as AiTagJobDoc),
  }));
}

export async function patchAiJobDraftStatuses(input: {
  gameId: string;
  jobId: string;
  draftStatuses: Record<string, "pending" | "approved" | "rejected">;
}): Promise<void> {
  await jobsCol(input.gameId)
    .doc(input.jobId)
    .set(
      {
        draftStatuses: input.draftStatuses,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}
