import { NextResponse } from "next/server";
import { requireCoachForGame } from "@/lib/ai/auth";
import { listGameSourcesAdmin } from "@/lib/ai/game-context";
import { alignAnglesByAudio } from "@/lib/audio-sync/align-angles";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  gameId?: string;
  referenceSourceId?: string;
  targetSourceId?: string;
  windowStartSec?: number;
  windowDurationSec?: number;
};

function youtubeVideoId(source: Record<string, unknown>): string | null {
  const kind = source.kind;
  const videoId = source.videoId;
  if (
    (kind === "youtube" || kind === "youtube_live") &&
    typeof videoId === "string" &&
    /^[a-zA-Z0-9_-]{11}$/.test(videoId)
  ) {
    return videoId;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const gameId = body.gameId?.trim() ?? "";
    if (!gameId) {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }

    await requireCoachForGame(request, gameId);

    const referenceSourceId = body.referenceSourceId?.trim() ?? "";
    const targetSourceId = body.targetSourceId?.trim() ?? "";
    if (!referenceSourceId || !targetSourceId) {
      return NextResponse.json(
        { error: "referenceSourceId and targetSourceId required." },
        { status: 400 },
      );
    }
    if (referenceSourceId === targetSourceId) {
      return NextResponse.json(
        { error: "Pick two different angles." },
        { status: 400 },
      );
    }

    const sources = await listGameSourcesAdmin(gameId);
    const reference = sources.find((s) => s.id === referenceSourceId);
    const target = sources.find((s) => s.id === targetSourceId);
    if (!reference || !target) {
      return NextResponse.json(
        { error: "Source not found on this game." },
        { status: 404 },
      );
    }

    const refVideoId = youtubeVideoId(reference);
    const targetVideoId = youtubeVideoId(target);
    if (!refVideoId || !targetVideoId) {
      return NextResponse.json(
        { error: "Both angles must be YouTube sources." },
        { status: 400 },
      );
    }

    const result = await alignAnglesByAudio({
      reference: {
        sourceId: reference.id,
        videoId: refVideoId,
        label:
          typeof reference.label === "string" ? reference.label : reference.id,
        offsetFromGameTime:
          typeof reference.offsetFromGameTime === "number"
            ? reference.offsetFromGameTime
            : 0,
      },
      target: {
        sourceId: target.id,
        videoId: targetVideoId,
        label: typeof target.label === "string" ? target.label : target.id,
        offsetFromGameTime:
          typeof target.offsetFromGameTime === "number"
            ? target.offsetFromGameTime
            : 0,
      },
      windowStartSec:
        typeof body.windowStartSec === "number"
          ? body.windowStartSec
          : undefined,
      windowDurationSec:
        typeof body.windowDurationSec === "number"
          ? body.windowDurationSec
          : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (msg === "TEAM_ACCESS_DENIED" || msg === "GAME_NOT_FOUND") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    console.error("[api/sync/audio-align]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
