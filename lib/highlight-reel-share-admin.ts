import "server-only";

import { adminFirestore } from "@/lib/firebase-admin";
import {
  parseHighlightReelSharePayload,
  type SharedHighlightReelLookupResult,
} from "@/lib/highlight-reel-share-payload";

function isShareExpired(raw: Record<string, unknown>): boolean {
  const expiresAt = raw.expiresAt as
    | { toMillis?: () => number }
    | null
    | undefined;
  if (!expiresAt || typeof expiresAt.toMillis !== "function") return false;
  return expiresAt.toMillis() <= Date.now();
}

/**
 * Anonymous-safe shared reel lookup via Admin SDK (avoids client Firestore hangs).
 */
export async function getHighlightReelShareAdmin(
  shareId: string,
): Promise<SharedHighlightReelLookupResult> {
  const trimmed = shareId.trim();
  if (!trimmed) return { ok: false, kind: "not_found" };

  try {
    const snap = await adminFirestore
      .collection("highlightReelShares")
      .doc(trimmed)
      .get();
    if (!snap.exists) return { ok: false, kind: "not_found" };

    const raw = (snap.data() ?? {}) as Record<string, unknown>;
    if (isShareExpired(raw)) return { ok: false, kind: "expired" };

    const payload = parseHighlightReelSharePayload(raw.payload);
    const gameId = typeof raw.gameId === "string" ? raw.gameId.trim() : "";
    const cutId = typeof raw.cutId === "string" ? raw.cutId.trim() : "";
    if (!payload || !gameId || !cutId) return { ok: false, kind: "not_found" };

    return {
      ok: true,
      gameId,
      cutId,
      payload,
      ...(typeof raw.createdByName === "string" && raw.createdByName.trim()
        ? { createdByName: raw.createdByName.trim() }
        : {}),
    };
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim()
        ? err.message.trim()
        : "Could not load this highlight reel.";
    return { ok: false, kind: "query_failed", message };
  }
}
