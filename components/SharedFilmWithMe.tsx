"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  listFilmSharesReceived,
  type FilmShareReceived,
} from "@/lib/film-share-invites";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

type Props = {
  onSynced?: () => void | Promise<void>;
  onMessage?: (note: string | null) => void;
  onError?: (message: string | null) => void;
};

export default function SharedFilmWithMe({
  onSynced,
  onMessage,
  onError,
}: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<FilmShareReceived[]>([]);
  const [busyOwner, setBusyOwner] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setRows(await listFilmSharesReceived(user.uid));
    } catch {
      setRows([]);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncOwner = async (ownerUid: string) => {
    if (!user) return;
    setBusyOwner(ownerUid);
    onError?.(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/film-shares/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ownerUid }),
      });
      const json = (await res.json().catch(() => null)) as {
        imported?: number;
        skipped?: number;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(json?.error || "Sync failed.");
      const imported = json?.imported ?? 0;
      onMessage?.(
        imported > 0
          ? `Imported ${imported} new clip${imported === 1 ? "" : "s"} into your Film Room.`
          : "You’re up to date — no new clips.",
      );
      await onSynced?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusyOwner(null);
    }
  };

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]">
      <h2 className="text-sm font-semibold text-white">Shared with me</h2>
      <p className="mt-1 text-[11px] text-zinc-500">
        Libraries you can sync into your Film Room. Sync pulls new clips while
        access is active.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li
            key={r.ownerUid}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-100">{r.ownerLabel}</p>
              <p className="text-[10px] text-zinc-500">Ongoing access</p>
            </div>
            <button
              type="button"
              className={ghostBtn}
              disabled={busyOwner === r.ownerUid}
              onClick={() => void syncOwner(r.ownerUid)}
            >
              {busyOwner === r.ownerUid ? "Syncing…" : "Sync new clips"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
