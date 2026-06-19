import { FirebaseError } from "firebase/app";
import { isPermissionDeniedError } from "@/lib/firestore-errors";

export type FirestoreOperation = "read" | "write" | "list" | "create" | "update" | "delete";

export function logFirestorePermissionError(
  operation: FirestoreOperation,
  path: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!isPermissionDeniedError(err)) return;
  const code =
    err instanceof FirebaseError
      ? err.code
      : err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    "[firestore:permission-denied]",
    JSON.stringify({ operation, path, code, message, ...context }, null, 0),
  );
}

export function firestoreErrorMessage(err: unknown, fallback: string): string {
  if (isPermissionDeniedError(err)) {
    return "Missing or insufficient permissions.";
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
