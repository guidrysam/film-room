"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addClubSponsor,
  listClubSponsors,
  MAX_CLUB_SPONSORS,
  removeClubSponsor,
  type ClubSponsorLogo,
} from "@/lib/club-sponsors";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-40";

export type ClubSponsorLibraryProps = {
  clubId: string;
  canEdit: boolean;
};

export default function ClubSponsorLibrary({
  clubId,
  canEdit,
}: ClubSponsorLibraryProps) {
  const [sponsors, setSponsors] = useState<ClubSponsorLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSponsors(await listClubSponsors(clubId));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load sponsor logos.",
      );
      setSponsors([]);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = useCallback(
    async (file: File | null) => {
      if (!file || !canEdit) return;
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        await addClubSponsor(clubId, {
          file,
          ...(name.trim() ? { name: name.trim() } : {}),
        });
        setName("");
        setMessage("Sponsor saved — available in Highlight Reel Studio.");
        await refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not add sponsor logo.",
        );
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [canEdit, clubId, name, refresh],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      if (!canEdit) return;
      setBusy(true);
      setError(null);
      try {
        await removeClubSponsor(clubId, id);
        await refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not remove sponsor.",
        );
      } finally {
        setBusy(false);
      }
    },
    [canEdit, clubId, refresh],
  );

  return (
    <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Sponsor library</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Save logos once, then pick them on any highlight reel. Up to{" "}
            {MAX_CLUB_SPONSORS} per club.
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="w-36 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => void handleAdd(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className={ghostBtn}
              disabled={busy || sponsors.length >= MAX_CLUB_SPONSORS}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? "Saving…" : "Add logo"}
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-zinc-500">Loading…</p>
      ) : sponsors.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          No sponsors yet
          {canEdit ? " — add a logo to reuse on reels." : "."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {sponsors.map((s) => (
            <li
              key={s.id}
              className="relative w-[4.5rem] rounded-md border border-white/10 bg-white/[0.03] p-1.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.logoUrl}
                alt={s.name || "Sponsor"}
                className="mx-auto h-12 w-12 rounded object-contain bg-white/90"
              />
              {s.name ? (
                <p className="mt-1 truncate text-center text-[9px] text-zinc-400">
                  {s.name}
                </p>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRemove(s.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[10px] text-zinc-400 ring-1 ring-white/10 hover:text-rose-200 disabled:opacity-40"
                  aria-label={`Remove ${s.name || "sponsor"}`}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {message ? (
        <p className="mt-2 text-[11px] text-emerald-300/90">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-[11px] text-rose-300">{error}</p>
      ) : null}
    </section>
  );
}
