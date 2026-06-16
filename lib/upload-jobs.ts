import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

/**
 * Per-user upload job tracking for Game Cap YouTube uploads.
 *
 * Layout: users/{uid}/uploadJobs/{jobId}
 */

export type UploadJobStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "complete"
  | "failed"
  | "cancelled";

export type UploadJob = {
  id: string;
  gameId: string;
  teamId?: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  label: string;
  status: UploadJobStatus;
  progressPct: number;
  youtubeVideoId?: string;
  sourceId?: string;
  error?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type CreateUploadJobInput = {
  gameId: string;
  teamId?: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  label: string;
  createdBy: string;
  createdByName?: string;
};

export type UpdateUploadJobPatch = Partial<
  Pick<
    UploadJob,
    | "status"
    | "progressPct"
    | "youtubeVideoId"
    | "sourceId"
    | "error"
  >
>;

function uploadJobsCol(uid: string) {
  return collection(firestore, "users", uid, "uploadJobs");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

const STATUSES: UploadJobStatus[] = [
  "queued",
  "uploading",
  "processing",
  "complete",
  "failed",
  "cancelled",
];

function parseUploadJob(id: string, raw: Record<string, unknown>): UploadJob {
  const status = STATUSES.includes(raw.status as UploadJobStatus)
    ? (raw.status as UploadJobStatus)
    : "queued";
  return {
    id,
    gameId: typeof raw.gameId === "string" ? raw.gameId : "",
    ...(trimOrUndef(raw.teamId) ? { teamId: (raw.teamId as string).trim() } : {}),
    fileName: typeof raw.fileName === "string" ? raw.fileName : "",
    fileSizeBytes:
      typeof raw.fileSizeBytes === "number" && Number.isFinite(raw.fileSizeBytes)
        ? raw.fileSizeBytes
        : 0,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "",
    label: typeof raw.label === "string" ? raw.label : "",
    status,
    progressPct:
      typeof raw.progressPct === "number" && Number.isFinite(raw.progressPct)
        ? Math.max(0, Math.min(100, raw.progressPct))
        : 0,
    ...(trimOrUndef(raw.youtubeVideoId)
      ? { youtubeVideoId: (raw.youtubeVideoId as string).trim() }
      : {}),
    ...(trimOrUndef(raw.sourceId) ? { sourceId: (raw.sourceId as string).trim() } : {}),
    ...(trimOrUndef(raw.error) ? { error: (raw.error as string).trim() } : {}),
    createdBy: typeof raw.createdBy === "string" ? raw.createdBy : "",
    ...(trimOrUndef(raw.createdByName)
      ? { createdByName: (raw.createdByName as string).trim() }
      : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
  };
}

export async function createUploadJob(
  uid: string,
  input: CreateUploadJobInput,
): Promise<string> {
  const ref = doc(uploadJobsCol(uid));
  const now = serverTimestamp();
  await setDoc(ref, {
    id: ref.id,
    gameId: input.gameId,
    fileName: input.fileName,
    fileSizeBytes: input.fileSizeBytes,
    mimeType: input.mimeType || "video/*",
    label: input.label.trim() || "Camera",
    status: "queued",
    progressPct: 0,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    ...(trimOrUndef(input.teamId) ? { teamId: input.teamId!.trim() } : {}),
    ...(trimOrUndef(input.createdByName)
      ? { createdByName: input.createdByName!.trim() }
      : {}),
  });
  return ref.id;
}

export async function updateUploadJob(
  uid: string,
  jobId: string,
  patch: UpdateUploadJobPatch,
): Promise<void> {
  await updateDoc(doc(uploadJobsCol(uid), jobId), {
    updatedAt: serverTimestamp(),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.progressPct !== undefined ? { progressPct: patch.progressPct } : {}),
    ...(patch.youtubeVideoId !== undefined
      ? { youtubeVideoId: patch.youtubeVideoId }
      : {}),
    ...(patch.sourceId !== undefined ? { sourceId: patch.sourceId } : {}),
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  });
}

/** Recent upload jobs for the signed-in user, newest first. */
export async function listMyUploadJobs(uid: string): Promise<UploadJob[]> {
  const q = query(uploadJobsCol(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const out: UploadJob[] = [];
  snap.forEach((d) =>
    out.push(parseUploadJob(d.id, d.data() as Record<string, unknown>)),
  );
  return out;
}
