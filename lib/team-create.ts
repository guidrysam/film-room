import {
  importRosterPreview,
  storeTeamCreateImportSummary,
  type RosterImportPreviewRow,
  type TeamCreateImportSummary,
} from "@/lib/roster-import";
import { formatFirestoreWriteError } from "@/lib/firestore-errors";
import { createTeam, type CreateTeamInput } from "@/lib/teams";

export async function createTeamAndImportRoster(
  uid: string,
  teamInput: CreateTeamInput,
  preview: RosterImportPreviewRow[],
): Promise<{ teamId: string; summary: TeamCreateImportSummary }> {
  let teamId: string;
  try {
    teamId = await createTeam(uid, teamInput);
  } catch (error) {
    throw formatFirestoreWriteError(
      error,
      "Team creation failed. Check Firestore rules deployment.",
    );
  }

  let importResult;
  try {
    importResult = await importRosterPreview(teamId, preview);
  } catch (error) {
    console.error("createTeamAndImportRoster roster import failed", {
      teamId,
      error,
    });
    throw formatFirestoreWriteError(
      error,
      "Team was created but roster import failed. Check Firestore rules for players and parent invite targets.",
    );
  }

  const summary: TeamCreateImportSummary = {
    teamCreated: true,
    teamName: teamInput.name.trim() || "Team",
    ...importResult,
  };
  storeTeamCreateImportSummary(summary);
  return { teamId, summary };
}
