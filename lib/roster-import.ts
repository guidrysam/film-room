import {
  indexParentInviteTargets,
  listParentInviteTargets,
  upsertParentInviteTarget,
} from "@/lib/parent-invite-targets";
import {
  isStaffPosition,
  normalizeEmail,
  resolvePlayerName,
  type ParsedRosterRow,
  type RosterParentContact,
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
  position?: string;
  teamName?: string;
  parentName?: string;
  parentEmail?: string;
  phone?: string;
  parentContacts?: RosterParentContact[];
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

export type RosterImportPreviewSummary = {
  playerCount: number;
  parentContactCount: number;
  skippedCount: number;
  invalidCount: number;
};

export const TEAM_CREATE_IMPORT_SUMMARY_KEY = "teamCreateImportSummary";

export type TeamCreateImportSummary = RosterImportResult & {
  teamName: string;
  teamCreated: true;
};

function countParentContacts(row: RosterImportPreviewRow): number {
  if (row.parentContacts?.length) return row.parentContacts.length;
  if (row.parentEmail && row.parentName) return 1;
  return 0;
}

export function summarizeRosterImportPreview(
  preview: RosterImportPreviewRow[],
): RosterImportPreviewSummary {
  const importable = preview.filter(
    (row) => row.status === "create" || row.status === "update",
  );
  let parentContactCount = 0;
  for (const row of importable) {
    parentContactCount += countParentContacts(row);
  }
  return {
    playerCount: importable.length,
    parentContactCount,
    skippedCount: preview.filter((row) => row.status === "skip").length,
    invalidCount: preview.filter((row) => row.status === "invalid").length,
  };
}

export function readTeamCreateImportSummary():
  | TeamCreateImportSummary
  | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(TEAM_CREATE_IMPORT_SUMMARY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TeamCreateImportSummary;
  } catch {
    return null;
  }
}

export function storeTeamCreateImportSummary(
  summary: TeamCreateImportSummary,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TEAM_CREATE_IMPORT_SUMMARY_KEY, JSON.stringify(summary));
}

export function clearTeamCreateImportSummary(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TEAM_CREATE_IMPORT_SUMMARY_KEY);
}

function resolveParentContacts(row: ParsedRosterRow): RosterParentContact[] {
  if (row.parentContacts?.length) return row.parentContacts;

  const email = normalizeEmail(row.parentEmail);
  if (email && row.parentName?.trim()) {
    return [
      {
        name: row.parentName.trim(),
        email,
        ...(row.phone?.trim() ? { phone: row.phone.trim() } : {}),
      },
    ];
  }

  return [];
}

export function buildRosterImportPreview(
  rows: ParsedRosterRow[],
  existingPlayers: Player[],
): RosterImportPreviewRow[] {
  const byKey = indexPlayersByRosterKey(existingPlayers);
  const preview: RosterImportPreviewRow[] = [];

  for (const row of rows) {
    if (row.isPlayer === false) {
      preview.push({
        rowIndex: row.rowIndex,
        playerName: resolvePlayerName(row) ?? "",
        ...(row.teamName ? { teamName: row.teamName } : {}),
        ...(row.position ? { position: row.position } : {}),
        status: "skip",
        message: isStaffPosition(row.position)
          ? "Staff contact — not imported as player"
          : "Not marked as player",
      });
      continue;
    }

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
    const parentContacts = resolveParentContacts(row);
    const primary = parentContacts[0];

    preview.push({
      rowIndex: row.rowIndex,
      playerName,
      ...(jerseyNumber ? { jerseyNumber } : {}),
      ...(row.position?.trim() ? { position: row.position.trim() } : {}),
      ...(row.teamName?.trim() ? { teamName: row.teamName.trim() } : {}),
      ...(primary ? { parentName: primary.name, parentEmail: primary.email } : {}),
      ...(primary?.phone ? { phone: primary.phone } : {}),
      ...(parentContacts.length > 0 ? { parentContacts } : {}),
      status: existing ? "update" : "create",
      ...(existing
        ? { existingPlayerId: existing.id, message: "Matches existing player" }
        : {}),
      ...(parentContacts.length > 1
        ? {
            message: [
              existing ? "Matches existing player" : undefined,
              `${parentContacts.length} parent contacts`,
            ]
              .filter(Boolean)
              .join(" · "),
          }
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
        ...(row.position ? { position: row.position } : {}),
      },
      playersByKey,
    );
    playersByKey = new Map(playersByKey);
    playersByKey.set(playerRosterKey(player.name, player.jerseyNumber), player);
    if (created) playersCreated++;
    else playersUpdated++;

    const contacts =
      row.parentContacts ??
      (row.parentEmail && row.parentName
        ? [
            {
              name: row.parentName,
              email: row.parentEmail,
              ...(row.phone ? { phone: row.phone } : {}),
            },
          ]
        : []);

    for (const contact of contacts) {
      await upsertParentInviteTarget(
        teamId,
        {
          parentName: contact.name,
          email: contact.email,
          ...(contact.phone ? { phone: contact.phone } : {}),
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
