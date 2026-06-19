import { FirebaseError } from "firebase/app";

export function isPermissionDeniedError(error: unknown): boolean {
  if (error instanceof FirebaseError) {
    return error.code === "permission-denied";
  }
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code?: string }).code === "permission-denied";
  }
  return /permission|insufficient/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

/** User-facing message for Firestore write failures. Logs full error for debugging. */
export function formatFirestoreWriteError(
  error: unknown,
  permissionMessage: string,
  context?: { path?: string; operation?: string },
): Error {
  console.error("Firestore write failed", {
    ...context,
    error,
  });

  if (isPermissionDeniedError(error)) {
    const message = new Error(permissionMessage) as Error & {
      code?: string;
      cause?: unknown;
    };
    if (error instanceof FirebaseError) {
      message.code = error.code;
      message.cause = error;
    }
    return message;
  }

  if (error instanceof Error) return error;
  return new Error(String(error));
}
