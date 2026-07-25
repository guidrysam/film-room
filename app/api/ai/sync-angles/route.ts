import { NextResponse } from "next/server";
import { requireCoachForGame } from "@/lib/ai/auth";
import {
  createAiJob,
  getAiJob,
  markAiJobFailed,
  markAiJobReady,
} from "@/lib/ai/jobs";
import {
  fetchYoutubeMetaServer,
  listGameSourcesAdmin,
  loadGameBillingContext,
} from "@/lib/ai/game-context";
import { runSyncAnglesAnalysis } from "@/lib/ai/sync-angles";
import type { AiTagDraft } from "@/lib/ai/tag-schema";
import {
  debitCredits,
  getCreditBalance,
  refundCredits,
  type CreditWalletRef,
} from "@/lib/billing/credits";
import { syncCreditsForAngleCount } from "@/lib/billing/pricing";

type Body = {
  gameId?: string;
  primarySourceId?: string;
  sourceIds?: string[];
  /** Optional: use landmarks from a prior tag job. */
  tagJobId?: string;
  landmarks?: AiTagDraft[];
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

    const ctx = await loadGameBillingContext(gameId);
    if (!ctx) {
      return NextResponse.json(
        { error: "Game wallet not found." },
        { status: 404 },
      );
    }
    wallet = ctx.wallet;

    const sources = await listGameSourcesAdmin(gameId);
    const youtubeSources = sources.filter((s) => {
      const kind = s.kind;
      const videoId = s.videoId;
      return (
        (kind === "youtube" || kind === "youtube_live") &&
        typeof videoId === "string" &&
        /^[a-zA-Z0-9_-]{11}$/.test(videoId)
      );
    });

    const primaryId =
      body.primarySourceId?.trim() ||
      youtubeSources[0]?.id ||
      "";
    const primary = youtubeSources.find((s) => s.id === primaryId);
    if (!primary || typeof primary.videoId !== "string") {
      return NextResponse.json(
        { error: "Primary YouTube source required." },
        { status: 400 },
      );
    }

    const requestedIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.map((id) => id.trim()).filter(Boolean)
      : youtubeSources.filter((s) => s.id !== primary.id).map((s) => s.id);

    const secondary = youtubeSources.filter(
      (s) => s.id !== primary.id && requestedIds.includes(s.id),
    );
    if (secondary.length === 0) {
      return NextResponse.json(
        { error: "Select at least one secondary angle to sync." },
        { status: 400 },
      );
    }

    let landmarks: AiTagDraft[] = Array.isArray(body.landmarks)
      ? body.landmarks
      : [];
    if (landmarks.length === 0 && body.tagJobId?.trim()) {
      const tagJob = await getAiJob(gameId, body.tagJobId.trim());
      if (tagJob?.drafts?.length) landmarks = tagJob.drafts;
    }
    if (landmarks.length === 0) {
      return NextResponse.json(
        {
          error:
            "Provide landmarks or tagJobId from a prior AI Tag job (kickoff/half/goals).",
        },
        { status: 400 },
      );
    }

    creditsCharged = syncCreditsForAngleCount(secondary.length);
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
      kind: "sync",
      actorUid,
      wallet: ctx.wallet,
      creditsCharged,
      teamId: ctx.teamId,
      clubId: ctx.clubId,
      primarySourceId: primary.id,
      sourceIds: secondary.map((s) => s.id),
    });

    const debit = await debitCredits({
      wallet: ctx.wallet,
      amount: creditsCharged,
      type: "debit_sync",
      actorUid,
      jobId,
      note: `AI sync ${gameId} ×${secondary.length}`,
    });
    debitLedgerId = debit.ledgerId;

    const primaryMeta = await fetchYoutubeMetaServer(String(primary.videoId));
    const primaryPrivacy =
      primaryMeta?.privacyStatus ||
      (typeof primary.youtubePrivacyStatus === "string"
        ? primary.youtubePrivacyStatus
        : undefined);

    const angles = [];
    for (const s of secondary) {
      const meta = await fetchYoutubeMetaServer(String(s.videoId));
      angles.push({
        sourceId: s.id,
        videoId: String(s.videoId),
        label: typeof s.label === "string" ? s.label : s.id,
        privacyStatus:
          meta?.privacyStatus ||
          (typeof s.youtubePrivacyStatus === "string"
            ? s.youtubePrivacyStatus
            : undefined),
        currentOffsetSec:
          typeof s.offsetFromGameTime === "number"
            ? s.offsetFromGameTime
            : 0,
      });
    }

    const result = await runSyncAnglesAnalysis({
      landmarks,
      primarySourceId: primary.id,
      primaryVideoId: String(primary.videoId),
      primaryPrivacyStatus: primaryPrivacy,
      angles,
      sport: ctx.sport,
    });

    await markAiJobReady({
      gameId,
      jobId,
      debitLedgerId,
      syncDrafts: result.drafts,
      notes: result.notes,
    });

    return NextResponse.json({
      ok: true,
      jobId,
      creditsCharged,
      balance: debit.balance,
      drafts: result.drafts,
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
        note: `Refund failed sync job: ${msg}`,
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
    console.error("[api/ai/sync-angles]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
