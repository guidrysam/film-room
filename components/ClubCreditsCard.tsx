"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { isAiCreditsPurchaseEnabledPublic } from "@/lib/billing/flags";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";
const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

export type ClubCreditsCardProps = {
  clubId: string;
  canManage: boolean;
};

export default function ClubCreditsCard({
  clubId,
  canManage,
}: ClubCreditsCardProps) {
  const purchaseEnabled = isAiCreditsPurchaseEnabledPublic();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState("500");

  const refresh = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(
      `/api/billing/balance?clubId=${encodeURIComponent(clubId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = (await res.json()) as { balance?: number; error?: string };
    if (res.ok && typeof data.balance === "number") {
      setBalance(data.balance);
      setError(null);
    } else {
      setError(data.error ?? "Could not load balance.");
    }
  }, [clubId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grantTest = useCallback(async () => {
    if (!canManage) return;
    const amount = Math.floor(Number(grantAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in required.");
      const token = await user.getIdToken();
      const res = await fetch("/api/billing/grant-test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clubId, amount }),
      });
      const data = (await res.json()) as {
        balance?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Grant failed.");
      if (typeof data.balance === "number") setBalance(data.balance);
      setMessage(`Granted ${amount} test credits.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grant failed.");
    } finally {
      setBusy(false);
    }
  }, [canManage, clubId, grantAmount]);

  const buyCredits = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in required.");
      const token = await user.getIdToken();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clubId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Checkout unavailable.");
      }
      setMessage("Checkout started.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setBusy(false);
    }
  }, [clubId]);

  return (
    <section className={panelClass}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">AI credits</h2>
        {!purchaseEnabled ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
            Test mode
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-[11px] leading-snug text-zinc-500">
        Used for AI Tag (watch primary) and AI Sync (skim other angles). Tag ≈ 1
        credit/min; sync ≈ 15 credits per angle.
      </p>
      <p className="mb-3 text-sm text-zinc-200">
        Balance:{" "}
        <span className="font-mono font-semibold">
          {balance == null ? "…" : balance}
        </span>
      </p>

      {purchaseEnabled ? (
        <button
          type="button"
          className={primaryBtn}
          disabled={busy || !canManage}
          onClick={() => void buyCredits()}
        >
          Buy credits
        </button>
      ) : canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-[10px] text-zinc-500">
            Grant test credits
            <input
              type="number"
              min={1}
              className="mt-1 w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-zinc-100"
              value={grantAmount}
              onChange={(e) => setGrantAmount(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={primaryBtn}
            disabled={busy}
            onClick={() => void grantTest()}
          >
            {busy ? "Granting…" : "Grant"}
          </button>
          <button
            type="button"
            className={ghostBtn}
            disabled={busy}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500">
          Ask a club admin to grant test credits while purchase is off.
        </p>
      )}

      {message ? (
        <p className="mt-2 text-[11px] text-emerald-300">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-[11px] text-rose-300">{error}</p>
      ) : null}
    </section>
  );
}
