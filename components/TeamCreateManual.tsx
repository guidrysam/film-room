"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { createTeam, normalizeCreateTeamInput } from "@/lib/teams";
import { teamSetupUrl } from "@/lib/team-routes";

export type TeamCreateManualProps = {
  uid: string;
};

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

export default function TeamCreateManual({ uid }: TeamCreateManualProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [season, setSeason] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const normalized = normalizeCreateTeamInput({ name, sport, season });
    if ("error" in normalized) {
      setError(normalized.error);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const id = await createTeam(uid, normalized);
      router.push(teamSetupUrl(id));
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Could not create team.";
      setError(message);
      setCreating(false);
    }
  }, [uid, name, sport, season, router]);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]">
      <p className="mb-4 text-sm text-zinc-400">
        Enter your team details, then import your roster from Team Setup.
      </p>
      <div className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name (e.g. U14 Central Michigan)"
          className={inputClass}
        />
        <input
          type="text"
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          placeholder="Sport (optional)"
          className={inputClass}
        />
        <input
          type="text"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          placeholder="Season (optional)"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className={`${primaryBtn} w-full`}
        >
          {creating ? "Creating…" : "Create team"}
        </button>
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
