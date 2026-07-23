import { NextResponse } from "next/server";
import {
  getCreditBalance,
  resolveWalletFromIds,
  type CreditWalletRef,
} from "@/lib/billing/credits";
import { isAiCreditsPurchaseEnabled } from "@/lib/billing/flags";
import { requireBearerUid } from "@/lib/ai/auth";
import { adminFirestore } from "@/lib/firebase-admin";
import { loadGameBillingContext } from "@/lib/ai/game-context";

export async function GET(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get("clubId")?.trim() || "";
    const gameId = searchParams.get("gameId")?.trim() || "";
    const userId = searchParams.get("userId")?.trim() || "";

    let wallet: CreditWalletRef | null = null;

    if (clubId) {
      const clubSnap = await adminFirestore.collection("clubs").doc(clubId).get();
      if (!clubSnap.exists) {
        return NextResponse.json({ error: "Club not found." }, { status: 404 });
      }
      const club = clubSnap.data() ?? {};
      const members =
        club.members && typeof club.members === "object"
          ? (club.members as Record<string, string>)
          : {};
      const ok =
        club.ownerId === uid ||
        members[uid] === "club_admin" ||
        members[uid] === "club_coach";
      if (!ok) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
      wallet = { kind: "club", clubId };
    } else if (gameId) {
      const ctx = await loadGameBillingContext(gameId);
      if (!ctx) {
        return NextResponse.json(
          { error: "Game or wallet not found." },
          { status: 404 },
        );
      }
      wallet = ctx.wallet;
    } else if (userId) {
      if (userId !== uid) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
      wallet = { kind: "user", userId };
    } else {
      wallet = resolveWalletFromIds({ ownerUid: uid });
    }

    if (!wallet) {
      return NextResponse.json(
        { error: "Could not resolve credit wallet." },
        { status: 400 },
      );
    }

    const balance = await getCreditBalance(wallet);
    return NextResponse.json({
      ok: true,
      ...balance,
      purchaseEnabled: isAiCreditsPurchaseEnabled(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
