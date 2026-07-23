import { NextResponse } from "next/server";
import { isAiCreditsPurchaseEnabled } from "@/lib/billing/flags";

/**
 * Phase B stub: Stripe Checkout when purchase is enabled.
 * Returns 501 until Stripe price IDs + webhook are configured.
 */
export async function POST() {
  if (!isAiCreditsPurchaseEnabled()) {
    return NextResponse.json(
      {
        error:
          "Credit purchase is not enabled yet. Use test grants (AI_CREDITS_PURCHASE_ENABLED=false).",
        purchaseEnabled: false,
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      error:
        "Stripe Checkout is not configured yet. Add STRIPE_SECRET_KEY and price IDs to enable purchase.",
      purchaseEnabled: true,
    },
    { status: 501 },
  );
}
