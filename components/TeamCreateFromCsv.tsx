"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { createTeamAndImportRoster } from "@/lib/team-create";
import RosterCsvImportPanel, {
  useRosterCsvImportPreview,
} from "@/components/RosterCsvImportPanel";
import type { ParsedRosterCsvBundle } from "@/lib/roster-csv-parse";
import type {
  RosterImportPreviewRow,
  RosterImportPreviewSummary,
} from "@/lib/roster-import";
import { teamSetupUrl } from "@/lib/team-routes";

export type TeamCreateFromCsvProps = {
  uid: string;
};

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

export default function TeamCreateFromCsv({ uid }: TeamCreateFromCsvProps) {
  const router = useRouter();
  const { preview, summary, bundle, onPreviewChange: syncPreview } =
    useRosterCsvImportPreview();
  const [teamName, setTeamName] = useState("");
  const [teamNameTouched, setTeamNameTouched] = useState(false);
  const [sport, setSport] = useState("");
  const [season, setSeason] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPreviewChange = useCallback(
    (
      nextPreview: RosterImportPreviewRow[] | null,
      nextSummary: RosterImportPreviewSummary | null,
      nextBundle: ParsedRosterCsvBundle | null,
    ) => {
      syncPreview(nextPreview, nextSummary, nextBundle);
      if (!nextBundle) {
        setTeamNameTouched(false);
        if (!teamNameTouched) setTeamName("");
        return;
      }
      if (!teamNameTouched && nextBundle.teamNameDetection.suggested) {
        setTeamName(nextBundle.teamNameDetection.suggested);
      }
    },
    [syncPreview, teamNameTouched],
  );

  const importableCount =
    preview?.filter((row) => row.status === "create" || row.status === "update")
      .length ?? 0;

  const handleCreate = useCallback(async () => {
    if (!preview?.length) return;
    const name = teamName.trim();
    if (!name) {
      setError("Enter a team name before creating.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { teamId } = await createTeamAndImportRoster(
        uid,
        {
          name,
          ...(sport.trim() ? { sport: sport.trim() } : {}),
          ...(season.trim() ? { season: season.trim() } : {}),
        },
        preview,
      );
      router.push(teamSetupUrl(teamId));
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Could not create team.";
      setError(message);
      setCreating(false);
    }
  }, [uid, teamName, sport, season, preview, router]);

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-400">
        Upload a TeamLinkt roster export. We will create the team and import
        players and parent contacts in one step.
      </p>

      <RosterCsvImportPanel
        existingPlayers={[]}
        onPreviewChange={onPreviewChange}
        compact
      />

      {summary ? (
        <div className="mb-4 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-3">
          <p className="mb-2 text-xs font-semibold text-white">Import preview</p>
          <ul className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              { label: "Players", value: summary.playerCount },
              { label: "Parent contacts", value: summary.parentContactCount },
              { label: "Skipped", value: summary.skippedCount },
              { label: "Invalid", value: summary.invalidCount },
            ].map(({ label, value }) => (
              <li
                key={label}
                className="rounded-md border border-white/[0.06] bg-black/25 px-2 py-2"
              >
                <p className="text-lg font-semibold text-white">{value}</p>
                <p className="text-[9px] uppercase tracking-wide text-zinc-500">
                  {label}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bundle ? (
        <div className="space-y-3 rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]">
          {bundle.teamNameDetection.hasMultiple ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2.5">
              <p className="text-xs font-medium text-amber-100">
                Multiple team names found in CSV
              </p>
              <p className="mt-1 text-[11px] text-amber-200/90">
                {bundle.teamNameDetection.names.join(" · ")}
              </p>
              <label className="mt-2 block text-[11px] text-zinc-400">
                Choose team name
                <select
                  value={teamName}
                  onChange={(e) => {
                    setTeamNameTouched(true);
                    setTeamName(e.target.value);
                  }}
                  className={`${inputClass} mt-1`}
                >
                  {bundle.teamNameDetection.names.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <label className="block text-xs text-zinc-400">
            Team name
            <input
              type="text"
              value={teamName}
              onChange={(e) => {
                setTeamNameTouched(true);
                setTeamName(e.target.value);
              }}
              placeholder="Team name"
              className={`${inputClass} mt-1`}
            />
          </label>
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
            disabled={creating || importableCount === 0 || !teamName.trim()}
            className={`${primaryBtn} w-full`}
          >
            {creating ? "Creating team…" : "Create team and import roster"}
          </button>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
