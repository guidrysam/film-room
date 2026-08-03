import { NextResponse } from "next/server";

import { requireBearerUid } from "@/lib/ai/auth";
import { adminFirestore } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function optStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

type PresetRow = {
  id: string;
  name: string;
  streamId: string;
  ingestionAddress: string;
  streamName: string;
  channelId: string | null;
  channelHandle: string | null;
  persistentLiveUrl: string | null;
  lastWatchUrl: string | null;
  createdAt: string;
};

function parsePreset(
  id: string,
  raw: Record<string, unknown>,
): PresetRow | null {
  const name = optStr(raw.name);
  const streamId = optStr(raw.streamId);
  if (!name || !streamId) return null;
  return {
    id,
    name,
    streamId,
    ingestionAddress:
      typeof raw.ingestionAddress === "string" ? raw.ingestionAddress : "",
    streamName: typeof raw.streamName === "string" ? raw.streamName : "",
    channelId: optStr(raw.channelId) ?? null,
    channelHandle: optStr(raw.channelHandle) ?? null,
    persistentLiveUrl: optStr(raw.persistentLiveUrl) ?? null,
    lastWatchUrl: optStr(raw.lastWatchUrl) ?? null,
    createdAt: optStr(raw.createdAt) ?? new Date(0).toISOString(),
  };
}

/**
 * Game Cap Director / Mac — list YouTube camera presets for the signed-in user.
 * Auth: Firebase ID token (same as /api/mac/* device link).
 *
 * GET /api/gamecap/presets
 */
export async function GET(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const snap = await adminFirestore
      .collection("users")
      .doc(uid)
      .collection("cameraPresets")
      .get();

    const presets = snap.docs
      .map((d) => parsePreset(d.id, d.data() as Record<string, unknown>))
      .filter((p): p is PresetRow => p != null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ ok: true, presets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "AUTH_REQUIRED") {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }
    console.error("[gamecap/presets]", err);
    return NextResponse.json({ ok: false, error: "Could not load presets." }, { status: 500 });
  }
}
