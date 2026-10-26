import { requireBearerUid } from "@/lib/ai/auth";
import {
  HIGHLIGHT_MAX_DURATION_SEC,
  syncGameCapMogoChannelToInbox,
} from "@/lib/youtube/sync-channel";

export const runtime = "nodejs";

/**
 * Sync recent YouTube channel uploads that look like Game Cap MOGO or Tripod
 * clips into the My Film work queue.
 *
 * POST /api/youtube/sync-channel
 * Optional JSON body: { maxDurationSec?: number } — e.g. 600 for highlights only.
 */
export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    let maxDurationSec: number | undefined;
    try {
      const body = (await request.json()) as { maxDurationSec?: unknown };
      if (
        typeof body?.maxDurationSec === "number" &&
        Number.isFinite(body.maxDurationSec) &&
        body.maxDurationSec > 0
      ) {
        maxDurationSec = body.maxDurationSec;
      }
    } catch {
      /* empty body is fine */
    }
    const result = await syncGameCapMogoChannelToInbox(uid, {
      ...(maxDurationSec != null ? { maxDurationSec } : {}),
    });
    return Response.json({
      ok: true,
      ...result,
      ...(maxDurationSec != null
        ? { maxDurationSec }
        : { maxDurationSec: null }),
      highlightMaxDurationSec: HIGHLIGHT_MAX_DURATION_SEC,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "AUTH_REQUIRED") {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    if (msg === "YOUTUBE_UPLOAD_NOT_CONNECTED") {
      return Response.json(
        {
          error:
            "Connect YouTube upload in Film Room → My Film first.",
        },
        { status: 403 },
      );
    }
    console.error("[youtube/sync-channel]", err);
    return Response.json(
      { error: "Could not sync YouTube channel." },
      { status: 500 },
    );
  }
}
