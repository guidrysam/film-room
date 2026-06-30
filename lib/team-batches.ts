import type { Team } from "@/lib/teams";

export type TeamBatchGroup = {
  /** Stable key for React lists. */
  key: string;
  label: string;
  importBatchId: string | null;
  teams: Team[];
};

/**
 * Group teams for dashboard display — newest batches first, unbatched last.
 */
export function groupTeamsByImportBatch(teams: Team[]): TeamBatchGroup[] {
  const byBatch = new Map<string, Team[]>();
  const unbatched: Team[] = [];

  for (const team of teams) {
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
