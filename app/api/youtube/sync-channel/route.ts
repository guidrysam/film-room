import { requireBearerUid } from "@/lib/ai/auth";
import { syncGameCapMogoChannelToInbox } from "@/lib/youtube/sync-channel";

export const runtime = "nodejs";

/**
 * Sync recent YouTube channel uploads that look like Game Cap MOGO clips
 * into the My Film work queue.
 *
 * POST /api/youtube/sync-channel
 */
export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const result = await syncGameCapMogoChannelToInbox(uid);
    return Response.json({ ok: true, ...result });
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
