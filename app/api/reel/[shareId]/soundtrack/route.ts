import { adminFirestore } from "@/lib/firebase-admin";
import { getUserVaultAccessToken } from "@/lib/drive/user-vault";
import { streamDriveFile } from "@/lib/drive/soundtrack";
import { normalizeHighlightSoundtrack } from "@/lib/highlight-soundtrack";
import { isPastExpiry } from "@/lib/user-privacy-settings";

export const runtime = "nodejs";

/**
 * Public soundtrack stream for a shared watch link (uses sharer's Drive token).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  try {
    const { shareId: rawId } = await context.params;
    const shareId = rawId?.trim() ?? "";
    if (!shareId) {
      return Response.json({ error: "Missing share id." }, { status: 400 });
    }

    const snap = await adminFirestore
      .collection("highlightReelShares")
      .doc(shareId)
      .get();
    if (!snap.exists) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    const raw = snap.data() ?? {};
    const expiresAt = raw.expiresAt;
    if (
      expiresAt &&
      typeof expiresAt === "object" &&
      typeof (expiresAt as { toMillis?: unknown }).toMillis === "function" &&
      isPastExpiry(expiresAt as { toMillis: () => number })
    ) {
      return Response.json({ error: "This link has expired." }, { status: 410 });
    }

    const payload =
      raw.payload && typeof raw.payload === "object"
        ? (raw.payload as Record<string, unknown>)
        : null;
    const soundtrack = normalizeHighlightSoundtrack(payload?.soundtrack);
    if (!soundtrack) {
      return Response.json(
        { error: "This reel has no soundtrack." },
        { status: 404 },
      );
    }

    const createdBy =
      typeof raw.createdBy === "string" ? raw.createdBy.trim() : "";
    if (!createdBy) {
      return Response.json(
        { error: "Soundtrack owner missing." },
        { status: 500 },
      );
    }

    const { accessToken } = await getUserVaultAccessToken(createdBy);
    return streamDriveFile({
      accessToken,
      driveFileId: soundtrack.driveFileId,
      mimeType: soundtrack.mimeType,
      fileName: soundtrack.name,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not stream soundtrack.";
    const status =
      /not connected|reconnect|DRIVE/i.test(message) ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
