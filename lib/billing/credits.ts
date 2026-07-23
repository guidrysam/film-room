import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";

export type CreditWalletRef =
  | { kind: "club"; clubId: string }
  | { kind: "user"; userId: string };

export type CreditLedgerEntryType =
  | "grant_test"
  | "grant_stripe"
  | "debit_tag"
  | "debit_sync"
  | "refund";

export type CreditBalance = {
  balance: number;
  updatedAt: string | null;
  wallet: CreditWalletRef;
};

function creditsDocPath(wallet: CreditWalletRef): string {
  if (wallet.kind === "club") {
    return `clubs/${wallet.clubId}/billing/credits`;
  }
  return `users/${wallet.userId}/billing/credits`;
}

function ledgerColPath(wallet: CreditWalletRef): string {
  if (wallet.kind === "club") {
    return `clubs/${wallet.clubId}/creditLedger`;
  }
  return `users/${wallet.userId}/creditLedger`;
}

export function resolveWalletFromIds(input: {
  clubId?: string | null;
  ownerUid?: string | null;
}): CreditWalletRef | null {
  const clubId = input.clubId?.trim();
  if (clubId) return { kind: "club", clubId };
  const userId = input.ownerUid?.trim();
  if (userId) return { kind: "user", userId };
  return null;
}

export async function getCreditBalance(
  wallet: CreditWalletRef,
): Promise<CreditBalance> {
  const snap = await adminFirestore.doc(creditsDocPath(wallet)).get();
  const data = snap.data() ?? {};
  const balance =
    typeof data.balance === "number" && Number.isFinite(data.balance)
      ? Math.max(0, Math.floor(data.balance))
      : 0;
  const updatedAt =
    data.updatedAt &&
    typeof (data.updatedAt as { toDate?: () => Date }).toDate === "function"
      ? (data.updatedAt as { toDate: () => Date }).toDate().toISOString()
      : null;
  return { balance, updatedAt, wallet };
}

export async function grantCredits(input: {
  wallet: CreditWalletRef;
  amount: number;
  type: Extract<CreditLedgerEntryType, "grant_test" | "grant_stripe">;
  actorUid: string;
  note?: string;
  idempotencyKey?: string;
}): Promise<CreditBalance> {
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_GRANT_AMOUNT");
  }

  const creditsRef = adminFirestore.doc(creditsDocPath(input.wallet));
  const ledgerRef = input.idempotencyKey
    ? adminFirestore
        .collection(ledgerColPath(input.wallet))
        .doc(input.idempotencyKey)
    : adminFirestore.collection(ledgerColPath(input.wallet)).doc();

  return adminFirestore.runTransaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.get(ledgerRef);
      if (existing.exists) {
        const bal = await tx.get(creditsRef);
        const balance =
          typeof bal.data()?.balance === "number"
            ? Math.floor(bal.data()!.balance as number)
            : 0;
        return { balance, updatedAt: null, wallet: input.wallet };
      }
    }
    const balSnap = await tx.get(creditsRef);
    const prev =
      typeof balSnap.data()?.balance === "number"
        ? Math.floor(balSnap.data()!.balance as number)
        : 0;
    const next = prev + amount;
    tx.set(
      creditsRef,
      { balance: next, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    tx.set(ledgerRef, {
      type: input.type,
      amount,
      balanceAfter: next,
      actorUid: input.actorUid,
      note: input.note?.trim() || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { balance: next, updatedAt: null, wallet: input.wallet };
  });
}

export async function debitCredits(input: {
  wallet: CreditWalletRef;
  amount: number;
  type: Extract<CreditLedgerEntryType, "debit_tag" | "debit_sync">;
  actorUid: string;
  jobId: string;
  note?: string;
}): Promise<{ balance: number; ledgerId: string }> {
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_DEBIT_AMOUNT");
  }

  const creditsRef = adminFirestore.doc(creditsDocPath(input.wallet));
  const ledgerRef = adminFirestore.collection(ledgerColPath(input.wallet)).doc();

  return adminFirestore.runTransaction(async (tx) => {
    const balSnap = await tx.get(creditsRef);
    const prev =
      typeof balSnap.data()?.balance === "number"
        ? Math.floor(balSnap.data()!.balance as number)
        : 0;
    if (prev < amount) {
      throw new Error("INSUFFICIENT_CREDITS");
    }
    const next = prev - amount;
    tx.set(
      creditsRef,
      { balance: next, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    tx.set(ledgerRef, {
      type: input.type,
      amount: -amount,
      balanceAfter: next,
      actorUid: input.actorUid,
      jobId: input.jobId,
      note: input.note?.trim() || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { balance: next, ledgerId: ledgerRef.id };
  });
}

export async function refundCredits(input: {
  wallet: CreditWalletRef;
  amount: number;
  actorUid: string;
  jobId: string;
  debitLedgerId?: string;
  note?: string;
}): Promise<CreditBalance> {
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_REFUND_AMOUNT");
  }

  const creditsRef = adminFirestore.doc(creditsDocPath(input.wallet));
  const ledgerRef = adminFirestore.collection(ledgerColPath(input.wallet)).doc();

  return adminFirestore.runTransaction(async (tx) => {
    const balSnap = await tx.get(creditsRef);
    const prev =
      typeof balSnap.data()?.balance === "number"
        ? Math.floor(balSnap.data()!.balance as number)
        : 0;
    const next = prev + amount;
    tx.set(
      creditsRef,
      { balance: next, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    tx.set(ledgerRef, {
      type: "refund",
      amount,
      balanceAfter: next,
      actorUid: input.actorUid,
      jobId: input.jobId,
      debitLedgerId: input.debitLedgerId ?? null,
      note: input.note?.trim() || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { balance: next, updatedAt: null, wallet: input.wallet };
  });
}
