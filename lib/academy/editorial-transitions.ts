import type {
  AcademyCanonicalLifecycle,
  AcademyCanonicalRecord,
  AcademyEditorialAuditEntry,
  AcademyEditorialMetadata,
  AcademyWorkflowStatus,
} from "@/lib/academy/types";

const ALLOWED_WORKFLOW_TRANSITIONS: Record<
  AcademyWorkflowStatus,
  AcademyWorkflowStatus[]
> = {
  draft: ["needs_coach_review"],
  needs_coach_review: ["approved", "rejected"],
  rejected: ["draft", "needs_coach_review"],
  approved: ["published"],
  published: ["approved"],
};

export function workflowStatusFromLifecycle(
  lifecycle: AcademyCanonicalLifecycle,
): AcademyWorkflowStatus {
  switch (lifecycle) {
    case "needs_review":
      return "needs_coach_review";
    case "archived":
      return "approved";
    case "draft":
    case "approved":
    case "published":
    case "rejected":
      return lifecycle;
  }
}

export function lifecycleFromWorkflowStatus(
  status: AcademyWorkflowStatus,
): AcademyCanonicalLifecycle {
  return status === "needs_coach_review" ? "needs_review" : status;
}

export function canTransitionEditorialStatus(
  from: AcademyWorkflowStatus,
  to: AcademyWorkflowStatus,
): boolean {
  return ALLOWED_WORKFLOW_TRANSITIONS[from].includes(to);
}

export function assertAllowedEditorialTransition(
  from: AcademyWorkflowStatus,
  to: AcademyWorkflowStatus,
): void {
  if (!canTransitionEditorialStatus(from, to)) {
    throw new Error(`Invalid editorial transition: ${from} -> ${to}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function updatePayloadEditorial(
  payload: unknown,
  status: AcademyWorkflowStatus,
  input: {
    actor: string;
    at: string;
    reason?: string;
    note?: string;
  },
): unknown {
  if (!isRecord(payload) || !isRecord(payload.editorial)) return payload;
  const editorial = payload.editorial as AcademyEditorialMetadata;
  const notes = [...(editorial.editorialNotes ?? [])];
  if (input.note?.trim()) notes.push(input.note.trim());
  const next: AcademyEditorialMetadata = {
    ...editorial,
    status,
    updatedAt: input.at,
    createdAt: editorial.createdAt ?? input.at,
    editorialNotes: notes,
  };
  if (status === "approved" || status === "published") {
    next.reviewedBy = input.actor;
    next.reviewedAt = input.at;
    next.approvedBy = input.actor;
    next.approvedAt = input.at;
    next.rejectedBy = undefined;
    next.rejectedAt = undefined;
    next.rejectionReason = undefined;
  }
  if (status === "published") {
    next.publishedBy = input.actor;
    next.publishedAt = input.at;
  }
  if (status === "approved" && editorial.status === "published") {
    next.publishedBy = undefined;
    next.publishedAt = undefined;
  }
  if (status === "rejected") {
    next.rejectedBy = input.actor;
    next.rejectedAt = input.at;
    next.rejectionReason = input.reason?.trim();
    next.approvedBy = undefined;
    next.approvedAt = undefined;
    next.publishedBy = undefined;
    next.publishedAt = undefined;
  }
  if (status === "draft" || status === "needs_coach_review") {
    next.approvedBy = undefined;
    next.approvedAt = undefined;
    next.publishedBy = undefined;
    next.publishedAt = undefined;
    if (status === "draft") {
      next.rejectedBy = undefined;
      next.rejectedAt = undefined;
      next.rejectionReason = undefined;
    }
  }
  return {
    ...payload,
    editorial: next,
  };
}

export function transitionEditorialRecord(
  record: AcademyCanonicalRecord,
  to: AcademyWorkflowStatus,
  input: {
    actor: string;
    at: string;
    reason?: string;
    note?: string;
  },
): {
  record: AcademyCanonicalRecord;
  auditEntry: AcademyEditorialAuditEntry;
} {
  const from = workflowStatusFromLifecycle(record.lifecycle);
  assertAllowedEditorialTransition(from, to);
  if (to === "rejected" && !input.reason?.trim()) {
    throw new Error("Rejection requires a non-empty reason.");
  }

  const lifecycle = lifecycleFromWorkflowStatus(to);
  const next: AcademyCanonicalRecord = {
    ...record,
    lifecycle,
    payload: updatePayloadEditorial(record.payload, to, input),
    updatedAt: input.at,
    createdAt: record.createdAt ?? input.at,
    ...(to === "approved" || to === "published"
      ? {
          reviewedBy: input.actor,
          reviewedAt: input.at,
          approvedBy: input.actor,
          approvedAt: input.at,
          rejectedBy: undefined,
          rejectedAt: undefined,
          rejectionReason: undefined,
        }
      : {}),
    ...(to === "published"
      ? { publishedBy: input.actor, publishedAt: input.at }
      : {}),
    ...(to === "approved" && from === "published"
      ? { publishedBy: undefined, publishedAt: undefined }
      : {}),
    ...(to === "rejected"
      ? {
          rejectedBy: input.actor,
          rejectedAt: input.at,
          rejectionReason: input.reason?.trim(),
          approvedBy: undefined,
          approvedAt: undefined,
          publishedBy: undefined,
          publishedAt: undefined,
        }
      : {}),
    ...(to === "draft" || to === "needs_coach_review"
      ? {
          approvedBy: undefined,
          approvedAt: undefined,
          publishedBy: undefined,
          publishedAt: undefined,
          ...(to === "draft"
            ? {
                rejectedBy: undefined,
                rejectedAt: undefined,
                rejectionReason: undefined,
              }
            : {}),
        }
      : {}),
  };

  if (input.note?.trim()) {
    next.editorialNotes = [...record.editorialNotes, input.note.trim()];
  }

  return {
    record: next,
    auditEntry: {
      id: `${record.id}:${from}:${to}:${input.at}`,
      objectId: record.id,
      objectType: record.objectType,
      previousStatus: from,
      newStatus: to,
      actor: input.actor,
      timestamp: input.at,
      ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      objectVersion: record.version,
    },
  };
}

export const EDITORIAL_WORKFLOW_TRANSITIONS = ALLOWED_WORKFLOW_TRANSITIONS;
