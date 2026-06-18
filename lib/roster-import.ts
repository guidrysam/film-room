import {
  indexParentInviteTargets,
  listParentInviteTargets,
  upsertParentInviteTarget,
} from "@/lib/parent-invite-targets";
import {
  normalizeEmail,
  resolvePlayerName,
  type ParsedRosterRow,
} from "@/lib/roster-csv";
import {
  indexPlayersByRosterKey,
  listTeamPlayers,
  playerRosterKey,
  upsertTeamPlayer,
  type Player,
} from "@/lib/teams";

export type RosterImportRowStatus = "create" | "update" | "skip" | "invalid";

export type RosterImportPreviewRow = {
  rowIndex: number;
  playerName: string;
  jerseyNumber?: string;
  parentName?: string;
  parentEmail?: string;
  phone?: string;
  status: RosterImportRowStatus;
  message?: string;
  existingPlayerId?: string;
};

export type RosterImportResult = {
  playersCreated: number;
  playersUpdated: number;
  parentsSaved: number;
  skipped: number;
};

export function buildRosterImportPreview(
  rows: ParsedRosterRow[],
  existingPlayers: Player[],
): RosterImportPreviewRow[] {
  const byKey = indexPlayersByRosterKey(existingPlayers);
  const preview: RosterImportPreviewRow[] = [];

  for (const row of rows) {
    const playerName = resolvePlayerName(row);
    if (!playerName) {
      preview.push({
        rowIndex: row.rowIndex,
        playerName: "",
        status: "invalid",
        message: "Missing player name",
      });
      continue;
    }

    const jerseyNumber = row.jerseyNumber?.trim() || undefined;
    const key = playerRosterKey(playerName, jerseyNumber);
    const existing = byKey.get(key);

    preview.push({
      rowIndex: row.rowIndex,
      playerName,
      ...(jerseyNumber ? { jerseyNumber } : {}),
      ...(row.parentName?.trim() ? { parentName: row.parentName.trim() } : {}),
      ...(normalizeEmail(row.parentEmail)
        ? { parentEmail: normalizeEmail(row.parentEmail) }
        : {}),
      ...(row.phone?.trim() ? { phone: row.phone.trim() } : {}),
      status: existing ? "update" : "create",
      ...(existing
        ? { existingPlayerId: existing.id, message: "Matches existing player" }
        : {}),
    });
  }

  return preview;
}

export async function importRosterPreview(
  teamId: string,
  preview: RosterImportPreviewRow[],
): Promise<RosterImportResult> {
  const importable = preview.filter(
    (r) => r.status === "create" || r.status === "update",
  );

  const [existingPlayers, existingParents] = await Promise.all([
    listTeamPlayers(teamId),
    listParentInviteTargets(teamId),
  ]);
  let playersByKey = indexPlayersByRosterKey(existingPlayers);
  const parentsByKey = indexParentInviteTargets(existingParents);

  let playersCreated = 0;
  let playersUpdated = 0;
  let parentsSaved = 0;
  const skipped = preview.length - importable.length;

  for (const row of importable) {
    const { player, created } = await upsertTeamPlayer(
      teamId,
      {
        name: row.playerName,
        ...(row.jerseyNumber ? { jerseyNumber: row.jerseyNumber } : {}),
      },
      playersByKey,
    );
    playersByKey = new Map(playersByKey);
    playersByKey.set(playerRosterKey(player.name, player.jerseyNumber), player);
    if (created) playersCreated++;
    else playersUpdated++;

    if (row.parentEmail && row.parentName) {
      await upsertParentInviteTarget(
        teamId,
        {
          parentName: row.parentName,
          email: row.parentEmail,
          ...(row.phone ? { phone: row.phone } : {}),
          playerId: player.id,
          playerName: player.name,
        },
        parentsByKey,
      );
      parentsSaved++;
    }
  }

  return { playersCreated, playersUpdated, parentsSaved, skipped };
}
