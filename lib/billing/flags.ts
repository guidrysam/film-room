/** When false (default), purchase UI/checkout is off; use test grants. */
export function isAiCreditsPurchaseEnabled(): boolean {
  const raw = process.env.AI_CREDITS_PURCHASE_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Client-visible flag (build-time). Defaults to off. */
export function isAiCreditsPurchaseEnabledPublic(): boolean {
  const raw =
    process.env.NEXT_PUBLIC_AI_CREDITS_PURCHASE_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
