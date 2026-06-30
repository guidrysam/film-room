import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";

/**
 * An import batch groups teams created together for one event or season
 * (e.g. "Labor Day Cup 2026", "Fall 2026"). Teams are always event-specific;
 * re-importing the same CSV into the same batch updates roster rows in place.
 */

export type ImportBatch = {
  id: string;
  /** User-facing label: tournament name or season. */
  label: string;
  sport?: string;
  createdBy: string;
  createdAt: Timestamp | null;
  /** Hidden from the default dashboard when true. */
  archived?: boolean;
};

function batchesCol() {
  return collection(firestore, "importBatches");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function parseBatch(id: string, raw: Record<string, unknown>): ImportBatch {
  return {
    id,
    label: typeof raw.label === "string" ? raw.label.trim() || "Import" : "Import",
    ...(trimOrUndef(raw.sport) ? { sport: (raw.sport as string).trim() } : {}),
    createdBy: typeof raw.createdBy === "string" ? raw.createdBy : "",
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    ...(raw.archived === true ? { archived: true } : {}),
  };
}

/** Build the stored team display name from program + event label. */
export function formatEventTeamName(
  programName: string,
  eventLabel: string,
): string {
  const program = programName.trim();
  const event = eventLabel.trim();
  if (!program) return event || "Team";
  if (!event) return program;
  const lower = program.toLowerCase();
  if (lower.includes(event.toLowerCase())) return program;
  return `${program} · ${event}`;
}

export type CreateImportBatchInput = {
  label: string;
  sport?: string;
};

export async function createImportBatch(
  uid: string,
  input: CreateImportBatchInput,
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required to create an import batch.");
  const label = input.label.trim();
  if (!label) throw new Error("Give this event or season a name.");

  const ref = doc(batchesCol());
  try {
    await setDoc(ref, {
      label,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      ...(trimOrUndef(input.sport) ? { sport: input.sport!.trim() } : {}),
    });
  } catch (error) {
    throw formatFirestoreWriteError(
      error,
      "Could not create the import batch.",
    );
  }
  return ref.id;
}

export async function listMyImportBatches(uid: string): Promise<ImportBatch[]> {
  const q = query(batchesCol(), where("createdBy", "==", uid));
  const snap = await getDocs(q);
  const out: ImportBatch[] = [];
  snap.forEach((d) =>
    out.push(parseBatch(d.id, d.data() as Record<string, unknown>)),
  );
  out.sort(
    (a, b) =>
      (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  );
  return out;
}

export async function setImportBatchArchived(
  batchId: string,
  archived: boolean,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  try {
    await updateDoc(doc(batchesCol(), batchId), { archived });
  } catch (error) {
    throw formatFirestoreWriteError(
      error,
      archived
        ? "Could not archive this event."
        : "Could not restore this event.",
    );
  }
}
