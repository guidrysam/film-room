import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FirebaseError } from "firebase/app";
import {
  formatFirestoreWriteError,
  isPermissionDeniedError,
} from "./firestore-errors";

describe("firestore-errors", () => {
  it("detects permission-denied Firebase errors", () => {
    const error = new FirebaseError(
      "permission-denied",
      "Missing or insufficient permissions.",
    );
    assert.equal(isPermissionDeniedError(error), true);
  });

  it("formats permission errors with deployment guidance", () => {
    const error = new FirebaseError(
      "permission-denied",
      "Missing or insufficient permissions.",
    );
    const formatted = formatFirestoreWriteError(
      error,
      "Team creation failed. Check Firestore rules deployment.",
    );
    assert.equal(
      formatted.message,
      "Team creation failed. Check Firestore rules deployment.",
    );
    assert.equal((formatted as Error & { code?: string }).code, "permission-denied");
  });
});
