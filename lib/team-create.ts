import {
  importRosterPreview,
  storeTeamCreateImportSummary,
  type RosterImportPreviewRow,
  type TeamCreateImportSummary,
} from "@/lib/roster-import";
import { createTeam, type CreateTeamInput } from "@/lib/teams";

export async function createTeamAndImportRoster(
  uid: string,
  teamInput: CreateTeamInput,
  preview: RosterImportPreviewRow[],
): Promise<{ teamId: string; summary: TeamCreateImportSummary }> {
  const teamId = await createTeam(uid, teamInput);
  const importResult = await importRosterPreview(teamId, preview);
  const summary: TeamCreateImportSummary = {
    teamCreated: true,
    teamName: teamInput.name.trim() || "Team",
    ...importResult,
  };
  storeTeamCreateImportSummary(summary);
  return { teamId, summary };
}
