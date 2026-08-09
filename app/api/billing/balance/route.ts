import { NextResponse } from "next/server";
import {
  getCreditBalance,
  resolveActorWallet,
  type CreditWalletRef,
} from "@/lib/billing/credits";
import { isAiCreditsPurchaseEnabled } from "@/lib/billing/flags";
import { requireBearerUid } from "@/lib/ai/auth";
import { adminFirestore } from "@/lib/firebase-admin";

/**
 * Credit balance. Default = signed-in user's personal wallet.
 * `clubId` still allowed for legacy club-pool readbacks in the club hub.
 */
export async function GET(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get("clubId")?.trim() || "";
    const userId = searchParams.get("userId")?.trim() || "";

    let wallet: CreditWalletRef;

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
    } else if (userId) {
      if (userId !== uid) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
      wallet = resolveActorWallet(userId);
    } else {
      // Personal-first default (also covers gameId= queries — ignore club attachment).
      wallet = resolveActorWallet(uid);
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
