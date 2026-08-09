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
  listTeamRosterNames,
  loadGameBillingContext,
} from "@/lib/ai/game-context";
import { buildTagAnchorHints } from "@/lib/ai/tag-anchors";
import { runTagGameAnalysis } from "@/lib/ai/tag-game";
import { youtubeVideoIdForAnalysis } from "@/lib/ai/youtube-source";
import {
  debitCredits,
  getCreditBalance,
  refundCredits,
  type CreditWalletRef,
} from "@/lib/billing/credits";
import { tagCreditsForDurationSec } from "@/lib/billing/pricing";

type Body = {
  gameId?: string;
  sourceId?: string;
};

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
    const youtubeSources = sources.filter(
      (s) => youtubeVideoIdForAnalysis(s) != null,
    );
    if (youtubeSources.length === 0) {
      return NextResponse.json(
        {
          error:
            "No YouTube or AI-proxy source on this game to tag. Publish AI proxies for vault angles first.",
        },
        { status: 400 },
      );
    }

    const preferredId = body.sourceId?.trim();
    const primary =
      (preferredId
        ? youtubeSources.find((s) => s.id === preferredId)
        : undefined) ?? youtubeSources[0];
    const videoId = youtubeVideoIdForAnalysis(primary)!;

    const meta = await fetchYoutubeMetaServer(videoId);
    const durationSec =
      typeof primary.durationSec === "number" &&
      Number.isFinite(primary.durationSec)
        ? (primary.durationSec as number)
        : meta?.durationSec;
    creditsCharged = tagCreditsForDurationSec(durationSec ?? 5400);

    const bal = await getCreditBalance(ctx.wallet);
    if (bal.balance < creditsCharged) {
      return NextResponse.json(
        {
          error: "INSUFFICIENT_CREDITS",
          message: `Need ${creditsCharged} credits; balance is ${bal.balance}. Use Grant me 500 in AI Tag (test mode).`,
          estimate: creditsCharged,
          balance: bal.balance,
        },
        { status: 402 },
      );
    }

    jobId = await createAiJob({
      gameId,
      kind: "tag",
      actorUid,
      wallet: ctx.wallet,
      creditsCharged,
      teamId: ctx.teamId,
      clubId: ctx.clubId,
      primarySourceId: primary.id,
      sourceIds: [primary.id],
    });

    const debit = await debitCredits({
      wallet: ctx.wallet,
      amount: creditsCharged,
      type: "debit_tag",
      actorUid,
      jobId,
      note: `AI tag ${gameId}`,
    });
    debitLedgerId = debit.ledgerId;

    const rosterNames = ctx.teamId
      ? await listTeamRosterNames(ctx.teamId)
      : [];

    const existingEvents = await listGameEventsAdmin(gameId);
    const sourceOffset =
      typeof primary.offsetFromGameTime === "number" &&
      Number.isFinite(primary.offsetFromGameTime)
        ? (primary.offsetFromGameTime as number)
        : 0;
    const knownMarks = buildTagAnchorHints(existingEvents, {
      sourceOffsetFromGameTime: sourceOffset,
    });

    const result = await runTagGameAnalysis({
      videoId,
      title: meta?.title,
      description: meta?.description,
      durationSec,
      privacyStatus:
        meta?.privacyStatus ||
        (typeof primary.youtubePrivacyStatus === "string"
          ? primary.youtubePrivacyStatus
          : undefined),
      sport: ctx.sport,
      rosterNames,
      knownMarks,
    });

    await markAiJobReady({
      gameId,
      jobId,
      debitLedgerId,
      drafts: result.drafts,
      notes: result.notes,
      suggestedKickoffOffsetSec: result.suggestedKickoffOffsetSec,
      lowEvidence: result.drafts.some((d) => d.lowEvidence),
    });

    return NextResponse.json({
      ok: true,
      jobId,
      creditsCharged,
      balance: debit.balance,
      drafts: result.drafts,
      notes: result.notes,
      knownMarksUsed: knownMarks.length,
      suggestedKickoffOffsetSec: result.suggestedKickoffOffsetSec,
      modelId: "modelId" in result ? result.modelId : undefined,
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
        note: `Refund failed tag job: ${msg}`,
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
    if (msg === "INSUFFICIENT_CREDITS") {
      return NextResponse.json({ error: msg }, { status: 402 });
    }
    console.error("[api/ai/tag-game]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
