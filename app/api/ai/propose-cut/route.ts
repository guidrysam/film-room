import { NextResponse } from "next/server";
import { requireCoachForGame } from "@/lib/ai/auth";
import {
  createAiJob,
  markAiJobFailed,
  markAiJobReady,
} from "@/lib/ai/jobs";
import {
  fetchYoutubeMetaServer,
  listGameEventsAdmin,
  listGameSourcesAdmin,
  loadGameBillingContext,
} from "@/lib/ai/game-context";
import { runProposeCutAnalysis } from "@/lib/ai/propose-cut";
import { youtubeVideoIdForAnalysis } from "@/lib/ai/youtube-source";
import {
  debitCredits,
  getCreditBalance,
  refundCredits,
  type CreditWalletRef,
} from "@/lib/billing/credits";
import { proposeCutCreditsForMarkCount } from "@/lib/billing/pricing";
import { formatHighlightMarkLabel } from "@/lib/highlight-from-marks";
import type { GameTimelineEvent } from "@/lib/games";

type Body = {
  gameId?: string;
  eventIds?: string[];
};

function asTimelineEvent(raw: {
  id: string;
  type?: string;
  t?: number;
  label?: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
}): GameTimelineEvent | null {
  const type = raw.type;
  if (
    type !== "coach_mark" &&
    type !== "stat" &&
    type !== "tag" &&
    type !== "sync_point" &&
    type !== "note" &&
    type !== "layout" &&
    type !== "camera_switch"
  ) {
    return null;
  }
  const t = typeof raw.t === "number" && Number.isFinite(raw.t) ? raw.t : null;
  if (t == null) return null;
  return {
    id: raw.id,
    type,
    t,
    ...(typeof raw.label === "string" ? { label: raw.label } : {}),
    ...(typeof raw.sourceId === "string" ? { sourceId: raw.sourceId } : {}),
    ...(raw.payload ? { payload: raw.payload } : {}),
  };
}

export async function POST(request: Request) {
  let jobId: string | null = null;
  let gameId = "";
  let debitLedgerId: string | undefined;
  let creditsCharged = 0;
  let wallet: CreditWalletRef | undefined;
  let actorUid = "";

  try {
    const body = (await request.json()) as Body;
    gameId = body.gameId?.trim() ?? "";
    if (!gameId) {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }

    const actor = await requireCoachForGame(request, gameId);
    actorUid = actor.uid;

    const ctx = await loadGameBillingContext(gameId, actorUid);
    if (!ctx) {
      return NextResponse.json(
        { error: "Game wallet not found." },
        { status: 404 },
      );
    }
    wallet = ctx.wallet;

    const sources = await listGameSourcesAdmin(gameId);
    const analyzable = sources
      .map((s) => {
        const videoId = youtubeVideoIdForAnalysis(s);
        if (!videoId) return null;
        return {
          sourceId: s.id,
          videoId,
          label:
            typeof s.label === "string" && s.label.trim()
              ? s.label.trim()
              : s.id,
          angleSlot:
            typeof s.angleSlot === "string" ? s.angleSlot : undefined,
          offsetFromGameTime:
            typeof s.offsetFromGameTime === "number"
              ? s.offsetFromGameTime
              : 0,
          privacyStatus:
            typeof s.youtubePrivacyStatus === "string"
              ? s.youtubePrivacyStatus
              : undefined,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a != null);

    if (analyzable.length === 0) {
      return NextResponse.json(
        {
          error:
            "No YouTube or AI-proxy sources. Publish AI proxies for vault angles first.",
        },
        { status: 400 },
      );
    }

    // Prefer Main / first as Gemini primary clip.
    analyzable.sort((a, b) => {
      const rank = (slot?: string) =>
        slot === "main" ? 0 : slot === "goal_a" || slot === "goal_b" ? 1 : 2;
      return rank(a.angleSlot) - rank(b.angleSlot);
    });

    for (const a of analyzable) {
      const meta = await fetchYoutubeMetaServer(a.videoId);
      if (meta?.privacyStatus) a.privacyStatus = meta.privacyStatus;
    }

    const rawEvents = await listGameEventsAdmin(gameId);
    const events = rawEvents
      .map(asTimelineEvent)
      .filter((e): e is GameTimelineEvent => e != null);

    const requested = Array.isArray(body.eventIds)
      ? new Set(body.eventIds.map((id) => id.trim()).filter(Boolean))
      : null;

    const highlightTypes = new Set(["coach_mark", "stat", "tag"]);
    let marks = events.filter((e) => highlightTypes.has(e.type));
    if (requested && requested.size > 0) {
      marks = marks.filter((e) => requested.has(e.id));
    }
    marks = marks.sort((a, b) => a.t - b.t);

    if (marks.length === 0) {
      return NextResponse.json(
        { error: "No highlightable marks (coach_mark / stat / tag)." },
        { status: 400 },
      );
    }

    creditsCharged = proposeCutCreditsForMarkCount(marks.length);
    const bal = await getCreditBalance(ctx.wallet);
    if (bal.balance < creditsCharged) {
      return NextResponse.json(
        {
          error: "INSUFFICIENT_CREDITS",
          message: `Need ${creditsCharged} credits; balance is ${bal.balance}. Ask an admin for a test grant.`,
          estimate: creditsCharged,
          balance: bal.balance,
        },
        { status: 402 },
      );
    }

    jobId = await createAiJob({
      gameId,
      kind: "propose_cut",
      actorUid,
      wallet: ctx.wallet,
      creditsCharged,
      teamId: ctx.teamId,
      clubId: ctx.clubId,
      sourceIds: analyzable.map((a) => a.sourceId),
    });

    const debit = await debitCredits({
      wallet: ctx.wallet,
      amount: creditsCharged,
      type: "debit_propose_cut",
      actorUid,
      jobId,
      note: `AI propose-cut ${gameId} ×${marks.length}`,
    });
    debitLedgerId = debit.ledgerId;

    const result = await runProposeCutAnalysis({
      marks: marks.map((m) => ({
        timelineEventId: m.id,
        gameTimeSec: m.t,
        label: formatHighlightMarkLabel(m),
        eventType: m.type,
      })),
      angles: analyzable,
      sport: ctx.sport,
    });

    await markAiJobReady({
      gameId,
      jobId,
      debitLedgerId,
      cutProposals: result.proposals,
      notes: result.notes,
      lowEvidence: result.proposals.some((p) => p.confidence < 0.35),
    });

    return NextResponse.json({
      ok: true,
      jobId,
      creditsCharged,
      balance: debit.balance,
      proposals: result.proposals,
      notes: result.notes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (jobId && gameId) {
      await markAiJobFailed({ gameId, jobId, error: msg }).catch(() => {});
    }
    if (
      debitLedgerId &&
      wallet &&
      creditsCharged > 0 &&
      actorUid &&
      jobId
    ) {
      await refundCredits({
        wallet,
        amount: creditsCharged,
        actorUid,
        jobId,
        debitLedgerId,
        note: `Refund failed propose-cut job: ${msg}`,
      }).catch(() => {});
    }
    if (msg === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (msg === "TEAM_ACCESS_DENIED" || msg === "GAME_NOT_FOUND") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === "MISSING_AI_API_KEY") {
      return NextResponse.json(
        {
          error:
            "AI not configured. Set GOOGLE_GENERATIVE_AI_API_KEY (or AI_GATEWAY_API_KEY).",
        },
        { status: 500 },
      );
    }
    console.error("[api/ai/propose-cut]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
