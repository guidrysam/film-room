"use client";

import { useCallback, useState } from "react";
import { listPersons, resolvePersonId, type Person } from "@/lib/persons";
import { importRosterPreview, type RosterImportResult } from "@/lib/roster-import";
import RosterCsvImportPanel, {
  useRosterCsvImportPreview,
} from "@/components/RosterCsvImportPanel";
import RosterImportResultSummary from "@/components/RosterImportResultSummary";
import { canCoachTeam, type Team } from "@/lib/teams";

export type TeamRosterImportProps = {
  team: Team;
  currentUid: string;
};

const primaryBtn =
  "rounded-md border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Import a TeamLinkt-style roster CSV into team players and parent invite targets.
 */
export default function TeamRosterImport({
  team,
  currentUid,
}: TeamRosterImportProps) {
  const canImport = canCoachTeam(team, currentUid);
  const { preview, onPreviewChange } = useRosterCsvImportPreview();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<RosterImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importableCount =
    preview?.filter((row) => row.status === "create" || row.status === "update")
      .length ?? 0;

  const handleImport = useCallback(async () => {
    if (!preview?.length) return;
    setImporting(true);
    setError(null);
    try {
      let personCache: Person[] = [];
      try {
        personCache = await listPersons(team.ownerId);
      } catch {
        /* person linking is best-effort */
      }
      const summary = await importRosterPreview(team.id, preview, {
        resolvePersonId: async (playerName) => {
          const resolved = await resolvePersonId(
            team.ownerId,
            playerName,
            personCache,
          );
          personCache = resolved.cache;
          return resolved.personId;
        },
      });
      setResult(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [preview, team.id, team.ownerId]);

  if (!canImport) {
    return (
      <p className="text-[10px] leading-snug text-zinc-500">
        Roster import is available to team admins and coaches.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        TeamLinkt / roster CSV import
      </p>
      <p className="mb-3 text-xs leading-relaxed text-zinc-400">
        Export your roster from TeamLinkt, then upload the CSV here. Players are
        linked by name to your cross-event player records.
      </p>

      {result ? <RosterImportResultSummary result={result} /> : null}

      <RosterCsvImportPanel
        teamId={team.id}
        compareTeamName={team.name}
        onPreviewChange={onPreviewChange}
      />
      {preview && preview.length > 0 ? (
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={importing || importableCount === 0}
          className={`${primaryBtn} mt-1`}
        >
          {importing
            ? "Importing…"
            : `Import ${importableCount} player${importableCount === 1 ? "" : "s"}`}
        </button>
      ) : null}

      {error ? (
        <p className="mt-2 text-[10px] leading-snug text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
