import { NextResponse } from "next/server";
import { grantCredits, type CreditWalletRef } from "@/lib/billing/credits";
import { isAiCreditsPurchaseEnabled } from "@/lib/billing/flags";
import { requireGrantActor } from "@/lib/ai/auth";

type Body = {
  clubId?: string;
  userId?: string;
  amount?: number;
  note?: string;
};

/**
 * Test credit grants. Allowed when purchase is disabled (Phase A),
 * or always for club admins / self user wallet (dev convenience).
 */
export async function POST(request: Request) {
  try {
    if (isAiCreditsPurchaseEnabled()) {
      // Still allow admin test grants only if explicitly opted in.
      const allow =
        process.env.AI_CREDITS_ALLOW_TEST_GRANT?.trim().toLowerCase() ===
          "true" ||
        process.env.AI_CREDITS_ALLOW_TEST_GRANT?.trim() === "1";
      if (!allow) {
        return NextResponse.json(
          {
            error:
              "Test grants are disabled while purchase is enabled. Set AI_CREDITS_ALLOW_TEST_GRANT=true to override.",
          },
          { status: 403 },
        );
      }
    }

    const body = (await request.json()) as Body;
    const amount = Math.floor(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000) {
      return NextResponse.json(
        { error: "amount must be 1–50000." },
        { status: 400 },
      );
    }

    let wallet: CreditWalletRef | null = null;
    if (body.clubId?.trim()) {
      wallet = { kind: "club", clubId: body.clubId.trim() };
    } else if (body.userId?.trim()) {
      wallet = { kind: "user", userId: body.userId.trim() };
    } else {
      return NextResponse.json(
        { error: "clubId or userId required." },
        { status: 400 },
      );
    }

    const actorUid = await requireGrantActor(request, wallet);
    const balance = await grantCredits({
      wallet,
      amount,
      type: "grant_test",
      actorUid,
      note: body.note?.trim() || "Test grant",
    });

    return NextResponse.json({ ok: true, ...balance });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (
      msg === "CLUB_ACCESS_DENIED" ||
      msg === "WALLET_ACCESS_DENIED" ||
      msg === "CLUB_NOT_FOUND"
    ) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
