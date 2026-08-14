"use client";

import { useCallback, useEffect, useState } from "react";
import { listMyClubs, type Club } from "@/lib/clubs";
import { shareFilmWithClubCoaches } from "@/lib/club-coach-inbox";
import type { FilmSource } from "@/lib/film-sources";
import { clubsFindUrl } from "@/lib/club-routes";
import Link from "next/link";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const selectClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white";

type Props = {
  uid: string;
  source: FilmSource;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onShared: () => void | Promise<void>;
};

/**
 * Parent: one-tap share into the club coach inbox.
 * Coaches/admins see it on the club hub and may organize by team later.
 */
export default function ShareFilmWithCoach({
  uid,
  source,
  busy,
  onBusy,
  onError,
  onShared,
}: Props) {
  const [open, setOpen] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);

  const loadClubs = useCallback(async () => {
    setLoadingMeta(true);
    onError(null);
    try {
      const rows = await listMyClubs(uid);
      setClubs(rows);
      if (rows.length === 1) setClubId(rows[0]!.id);
      else if (source.clubId && rows.some((c) => c.id === source.clubId)) {
        setClubId(source.clubId);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not load clubs.");
    } finally {
      setLoadingMeta(false);
    }
  }, [uid, source.clubId, onError]);

  useEffect(() => {
    if (!open) return;
    void loadClubs();
  }, [open, loadClubs]);

  const share = async () => {
    if (!clubId) {
      onError("Pick a club.");
      return;
    }
    onBusy(true);
    onError(null);
    try {
      await shareFilmWithClubCoaches({ clubId, source });
      setOpen(false);
      await onShared();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not share with coaches.");
    } finally {
      onBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className={primaryBtn}
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        Share with coach
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="mb-2 text-[11px] font-medium text-zinc-300">
        Share with club coaches
      </p>
      <p className="mb-2 text-[11px] text-zinc-500">
        Coaches and admins will see this in the club inbox. They can organize by
        team later — or leave it as-is.
      </p>
      {loadingMeta ? (
        <p className="text-[11px] text-zinc-500">Loading clubs…</p>
      ) : clubs.length === 0 ? (
        <p className="text-[11px] text-zinc-500">
          Join a club first.{" "}
          <Link href={clubsFindUrl()} className="text-blue-300 hover:underline">
            Find a club
          </Link>
        </p>
      ) : (
        <label className="block text-[11px] text-zinc-500">
          Club
          <select
            className={selectClass}
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
          >
            <option value="">Select…</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryBtn}
          disabled={busy || !clubId}
          onClick={() => void share()}
        >
          {busy ? "Sharing…" : "Send to coaches"}
        </button>
        <button
          type="button"
          className={ghostBtn}
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
