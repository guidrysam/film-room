import type { Team } from "@/lib/teams";

export type TeamBatchGroup = {
  /** Stable key for React lists. */
  key: string;
  label: string;
  importBatchId: string | null;
  teams: Team[];
  archived?: boolean;
};

export type GroupTeamsOptions = {
  /** Batch ids marked archived — excluded unless showArchived is true. */
  archivedBatchIds?: Set<string>;
  showArchived?: boolean;
};

/**
 * Group teams for dashboard display — newest batches first, unbatched last.
 */
export function groupTeamsByImportBatch(
  teams: Team[],
  opts?: GroupTeamsOptions,
): TeamBatchGroup[] {
  const archivedBatchIds = opts?.archivedBatchIds ?? new Set<string>();
  const showArchived = opts?.showArchived === true;

  const filtered = teams.filter((team) => {
    if (!team.importBatchId) return true;
    const isArchived = archivedBatchIds.has(team.importBatchId);
    return showArchived ? isArchived : !isArchived;
  });

  const byBatch = new Map<string, Team[]>();
  const unbatched: Team[] = [];

  for (const team of filtered) {
    if (team.importBatchId) {
      const list = byBatch.get(team.importBatchId) ?? [];
      list.push(team);
      byBatch.set(team.importBatchId, list);
    } else {
      unbatched.push(team);
    }
  }

  const groups: TeamBatchGroup[] = [];

  const batchEntries = [...byBatch.entries()].map(([batchId, batchTeams]) => {
    const label =
      batchTeams.find((t) => t.importBatchLabel)?.importBatchLabel ??
      batchTeams[0]?.season ??
      "Event";
    const newest = Math.max(
      ...batchTeams.map((t) => t.updatedAt?.toMillis?.() ?? 0),
    );
    return { batchId, label, batchTeams, newest };
  });
  batchEntries.sort((a, b) => b.newest - a.newest);

  for (const entry of batchEntries) {
    entry.batchTeams.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({
      key: entry.batchId,
      label: entry.label,
      importBatchId: entry.batchId,
      teams: entry.batchTeams,
      archived: archivedBatchIds.has(entry.batchId),
    });
  }

  if (unbatched.length > 0) {
    unbatched.sort(
      (a, b) =>
        (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
    );
    groups.push({
      key: "__other__",
      label: "Other teams",
      importBatchId: null,
      teams: unbatched,
    });
  }

  return groups;
}
