/**
 * Grant test AI credits to a club or user wallet (Admin SDK).
 *
 * Usage:
 *   npx tsx scripts/ai/grant-test-credits.ts --club <clubId> --amount 500
 *   npx tsx scripts/ai/grant-test-credits.ts --user <uid> --amount 200
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON (or default app credentials).
 */

import { grantCredits } from "../../lib/billing/credits";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const clubId = arg("club")?.trim();
  const userId = arg("user")?.trim();
  const amount = Math.floor(Number(arg("amount") ?? "500"));
  const note = arg("note")?.trim() || "CLI test grant";

  if ((!clubId && !userId) || (clubId && userId)) {
    console.error(
      "Specify exactly one of --club <clubId> or --user <uid>, plus --amount.",
    );
    process.exit(1);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("--amount must be a positive integer.");
    process.exit(1);
  }

  const wallet = clubId
    ? ({ kind: "club" as const, clubId })
    : ({ kind: "user" as const, userId: userId! });

  const result = await grantCredits({
    wallet,
    amount,
    type: "grant_test",
    actorUid: "script:grant-test-credits",
    note,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        wallet,
        granted: amount,
        balance: result.balance,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
