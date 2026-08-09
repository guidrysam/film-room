import { requireBearerUid } from "@/lib/ai/auth";
import { dismissYouTubeWorkItem } from "@/lib/youtube/sync-channel";

export const runtime = "nodejs";

/**
 * Clear a MOGO YouTube work item from My Film (stays on YouTube; won't re-stack).
 *
 * POST /api/youtube/dismiss
 * Body: { sourceId?: string, videoId?: string }
 */
export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const body = (await request.json().catch(() => null)) as {
      sourceId?: unknown;
      videoId?: unknown;
    } | null;
    await dismissYouTubeWorkItem({
      uid,
      ...(typeof body?.sourceId === "string"
        ? { sourceId: body.sourceId }
        : {}),
      ...(typeof body?.videoId === "string" ? { videoId: body.videoId } : {}),
    });
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "AUTH_REQUIRED") {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    if (msg === "SOURCE_NOT_FOUND" || msg === "MISSING_VIDEO_ID") {
      return Response.json({ error: msg }, { status: 400 });
    }
    console.error("[youtube/dismiss]", err);
    return Response.json({ error: "Could not clear item." }, { status: 500 });
  }
}
