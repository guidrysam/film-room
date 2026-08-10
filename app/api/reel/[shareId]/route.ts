import { getHighlightReelShareAdmin } from "@/lib/highlight-reel-share-admin";

export const runtime = "nodejs";

/**
 * Public shared highlight reel payload (no auth). Uses Admin SDK so watchers
 * are not blocked by client Firestore connectivity.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  try {
    const { shareId: rawId } = await context.params;
    const shareId = rawId?.trim() ?? "";
    if (!shareId) {
      return Response.json({ ok: false, kind: "not_found" }, { status: 404 });
    }

    const result = await getHighlightReelShareAdmin(shareId);
    if (!result.ok) {
      const status =
        result.kind === "expired"
          ? 410
          : result.kind === "query_failed"
            ? 500
            : 404;
      return Response.json(result, { status });
    }

    return Response.json(result, {
      headers: {
        // Short private cache — payload can change when coach re-shares.
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load this highlight reel.";
    return Response.json(
      { ok: false, kind: "query_failed", message },
      { status: 500 },
    );
  }
}
