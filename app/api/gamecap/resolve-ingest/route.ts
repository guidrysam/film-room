import { NextResponse } from "next/server";

import { requireBearerUid } from "@/lib/ai/auth";
import { adminFirestore } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function optStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/**
 * Resolve current RTMP ingest for a Film Room camera preset at LIVE time.
 * Game Cap should call this on each Go Live so a rotated key in Stream Room
 * is picked up without re-pasting into the encoder.
 *
 * POST /api/gamecap/resolve-ingest
 * Body: { presetId: string }
 */
export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const body = (await request.json().catch(() => null)) as {
      presetId?: unknown;
    } | null;
    const presetId =
      typeof body?.presetId === "string" ? body.presetId.trim() : "";
    if (!presetId) {
      return NextResponse.json(
        { ok: false, error: "Missing presetId." },
        { status: 400 },
      );
    }

    const doc = await adminFirestore
      .collection("users")
      .doc(uid)
      .collection("cameraPresets")
      .doc(presetId)
      .get();

    if (!doc.exists) {
      return NextResponse.json(
        { ok: false, error: "Camera preset not found. Save one in Stream Room." },
        { status: 404 },
      );
    }

    const raw = doc.data() as Record<string, unknown>;
    const name = optStr(raw.name);
    const streamId = optStr(raw.streamId);
    const ingestionAddress =
      typeof raw.ingestionAddress === "string" ? raw.ingestionAddress.trim() : "";
    const streamName =
      typeof raw.streamName === "string" ? raw.streamName.trim() : "";
    if (!name || !streamId) {
      return NextResponse.json(
        { ok: false, error: "Camera preset is incomplete." },
        { status: 422 },
      );
    }
    if (!ingestionAddress || !streamName) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Preset has no RTMP ingest. Recreate the camera stream in Stream Room.",
        },
        { status: 422 },
      );
    }

    const watchHint =
      optStr(raw.lastWatchUrl) ?? optStr(raw.persistentLiveUrl) ?? null;

    return NextResponse.json({
      ok: true,
      presetId: doc.id,
      name,
      streamId,
      ingestionAddress,
      streamName,
      watchHint,
      note:
        "Encoder ingest resolved from Film Room. Create today's watch link in Stream Room if you need a fresh share URL.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "AUTH_REQUIRED") {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }
    console.error("[gamecap/resolve-ingest]", err);
    return NextResponse.json(
      { ok: false, error: "Could not resolve ingest." },
      { status: 500 },
    );
  }
}
