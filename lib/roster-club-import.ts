import { formatFirestoreWriteError } from "@/lib/firestore-errors";
import {
  indexParentInviteTargets,
  listParentInviteTargets,
  parentInviteTargetKey,
  parentTargetImportFieldsEqual,
  type ParentInviteTarget,
} from "@/lib/parent-invite-targets";
import {
  importRosterPreview,
  summarizeRosterImportPreview,
  type RosterImportPreviewRow,
  type RosterImportPreviewSummary,
  type RosterImportResult,
} from "@/lib/roster-import";
import { type RosterParentContact } from "@/lib/roster-csv";
import {
  createTeam,
  findTeamByName,
  indexPlayersByRosterKey,
  listTeamPlayers,
  playerImportFieldsEqual,
  playerRosterKey,
  teamNameKey,
  listMyTeams,
  type Player,
  type Team,
} from "@/lib/teams";

/**
 * Club-wide roster import.
 *
 * A single TeamLinkt export may contain players from multiple teams. These
 * helpers group the parsed preview rows by their `Team Name`, match each group
 * against the importer's existing teams (to avoid duplicates), and import each
 * group into the correct team.
 */

export const UNASSIGNED_TEAM_NAME = "Unassigned";

export type ClubImportTeamGroup = {
  /** Team name as it will be imported (falls back when the CSV omits one). */
  teamName: string;
  /** Original team name from the CSV (empty string when none was present). */
  sourceTeamName: string;
  rows: RosterImportPreviewRow[];
  summary: RosterImportPreviewSummary;
};

/** Group preview rows by their CSV team name, preserving first-seen order. */
export function groupPreviewRowsByTeam(
  preview: RosterImportPreviewRow[],
  fallbackTeamName: string = UNASSIGNED_TEAM_NAME,
): ClubImportTeamGroup[] {
  const order: string[] = [];
  const byKey = new Map<
    string,
    { sourceTeamName: string; rows: RosterImportPreviewRow[] }
  >();
  const fallback = fallbackTeamName.trim() || UNASSIGNED_TEAM_NAME;

  for (const row of preview) {
    const source = row.teamName?.trim() ?? "";
    const name = source || fallback;
    const key = teamNameKey(name);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { sourceTeamName: source, rows: [] };
      byKey.set(key, entry);
      order.push(key);
    }
    entry.rows.push(row);
  }

  return order.map((key) => {
    const entry = byKey.get(key)!;
    const teamName = entry.sourceTeamName || fallback;
    return {
      teamName,
      sourceTeamName: entry.sourceTeamName,
      rows: entry.rows,
      summary: summarizeRosterImportPreview(entry.rows),
    };
  });
}

export type ClubImportTeamPlanItem = ClubImportTeamGroup & {
  /** True when the team name matches one of the importer's existing teams. */
  matchesExistingTeam: boolean;
  existingTeamId?: string;
};

/** Annotate each group with whether it maps to an existing team. */
export function buildClubImportPlan(
  groups: ClubImportTeamGroup[],
  existingTeams: Team[],
): ClubImportTeamPlanItem[] {
  return groups.map((group) => {
    const existing = findTeamByName(existingTeams, group.teamName);
    return {
      ...group,
      matchesExistingTeam: Boolean(existing),
      ...(existing ? { existingTeamId: existing.id } : {}),
    };
  });
}

export type SyncChange = "new" | "updated" | "unchanged";

export type TeamSyncCounts = {
  players: { new: number; updated: number; unchanged: number };
  parents: { new: number; updated: number; unchanged: number };
  skipped: number;
};

export type TeamSyncClassification = TeamSyncCounts & {
  /**
   * Names of existing roster players not present in this import. Informational
   * only — these players are never removed, disabled, or archived.
   */
  missingPlayers: string[];
};

function rowContacts(row: RosterImportPreviewRow): RosterParentContact[] {
  if (row.parentContacts?.length) return row.parentContacts;
  if (row.parentEmail && row.parentName) {
    return [
      {
        name: row.parentName,
        email: row.parentEmail,
        ...(row.phone ? { phone: row.phone } : {}),
      },
    ];
  }
  return [];
}

/**
 * Classify a team's import rows against its existing roster as new / updated /
 * unchanged for both players and parents, and surface existing players that are
 * absent from the import (without taking any action on them).
 *
 * Uses the same field-equality checks as the writers so a re-import of an
 * unchanged CSV classifies (and writes) nothing.
 */
export function classifyTeamSync(
  rows: RosterImportPreviewRow[],
  existingPlayers: Player[],
  existingParents: ParentInviteTarget[],
): TeamSyncClassification {
  const playersByKey = indexPlayersByRosterKey(existingPlayers);
  const parentsByKey = indexParentInviteTargets(existingParents);
  const seenPlayerIds = new Set<string>();
  const counts: TeamSyncCounts = {
    players: { new: 0, updated: 0, unchanged: 0 },
    parents: { new: 0, updated: 0, unchanged: 0 },
    skipped: 0,
  };

  for (const row of rows) {
    if (row.status !== "create" && row.status !== "update") {
      counts.skipped++;
      continue;
    }

    const key = playerRosterKey(row.playerName, row.jerseyNumber);
    const existingPlayer = playersByKey.get(key);
    if (existingPlayer) seenPlayerIds.add(existingPlayer.id);

    const playerChange: SyncChange = !existingPlayer
      ? "new"
      : playerImportFieldsEqual(existingPlayer, {
            name: row.playerName,
            ...(row.jerseyNumber ? { jerseyNumber: row.jerseyNumber } : {}),
            ...(row.position ? { position: row.position } : {}),
          })
        ? "unchanged"
        : "updated";
    counts.players[playerChange]++;

    for (const contact of rowContacts(row)) {
      const existingTarget = existingPlayer
        ? parentsByKey.get(
            parentInviteTargetKey(contact.email, existingPlayer.id),
          )
        : undefined;
      const contactChange: SyncChange = !existingTarget
        ? "new"
        : parentTargetImportFieldsEqual(existingTarget, {
              parentName: contact.name,
              email: contact.email,
              ...(contact.phone ? { phone: contact.phone } : {}),
              playerName: row.playerName,
            })
          ? "unchanged"
          : "updated";
      counts.parents[contactChange]++;
    }
  }

  const missingPlayers = existingPlayers
    .filter((player) => !seenPlayerIds.has(player.id))
    .map((player) => player.name);

  return { ...counts, missingPlayers };
}

export type ClubTeamSyncPlanItem = ClubImportTeamPlanItem & {
  sync: TeamSyncClassification;
};

/**
 * Load each team's existing roster (for teams that already exist) and classify
 * the import as new / updated / unchanged per team. New teams classify entirely
 * as new players/parents with no missing players.
 */
export async function loadClubImportSyncPlan(
  groups: ClubImportTeamGroup[],
  existingTeams: Team[],
): Promise<ClubTeamSyncPlanItem[]> {
  const plan = buildClubImportPlan(groups, existingTeams);
  return Promise.all(
    plan.map(async (item) => {
      if (!item.existingTeamId) {
        return { ...item, sync: classifyTeamSync(item.rows, [], []) };
      }
      const [players, parents] = await Promise.all([
        listTeamPlayers(item.existingTeamId),
        listParentInviteTargets(item.existingTeamId),
      ]);
      return { ...item, sync: classifyTeamSync(item.rows, players, parents) };
    }),
  );
}

/** Load one existing team's roster + parent contacts (for client-side preview). */
export async function loadTeamRosterData(
  teamId: string,
): Promise<{ players: Player[]; parents: ParentInviteTarget[] }> {
  const [players, parents] = await Promise.all([
    listTeamPlayers(teamId),
    listParentInviteTargets(teamId),
  ]);
  return { players, parents };
}

export type ClubImportTeamInput = {
  teamName: string;
  rows: RosterImportPreviewRow[];
  sport?: string;
  season?: string;
};

export type ClubImportTeamResult = RosterImportResult & {
  teamId: string;
  teamName: string;
  teamCreated: boolean;
};

export type ClubImportResult = {
  teams: ClubImportTeamResult[];
  teamsCreated: number;
  teamsUpdated: number;
  playersCreated: number;
  playersUpdated: number;
  playersUnchanged: number;
  parentsCreated: number;
  parentsUpdated: number;
  parentsUnchanged: number;
  skipped: number;
};

function stubTeam(teamId: string, name: string, uid: string): Team {
  return {
    id: teamId,
    name,
    ownerId: uid,
    members: { [uid]: "admin" },
    memberUids: [uid],
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Import one or more teams from a single club-wide roster. Each input is matched
 * against the importer's existing teams by name: a match updates that team, and
 * a miss creates a new one. Roster rows are then imported into the matched team.
 */
export async function importClubRoster(
  uid: string,
  teams: ClubImportTeamInput[],
): Promise<ClubImportResult> {
  let existingTeams: Team[];
  try {
    existingTeams = await listMyTeams(uid);
  } catch (error) {
    throw formatFirestoreWriteError(
      error,
      "Could not load your existing teams to match the import.",
    );
  }

  const result: ClubImportResult = {
    teams: [],
    teamsCreated: 0,
    teamsUpdated: 0,
    playersCreated: 0,
    playersUpdated: 0,
    playersUnchanged: 0,
    parentsCreated: 0,
    parentsUpdated: 0,
    parentsUnchanged: 0,
    skipped: 0,
  };

  for (const team of teams) {
    const teamName = team.teamName.trim();
    if (!teamName) continue;

    const existing = findTeamByName(existingTeams, teamName);
    let teamId: string;
    let teamCreated: boolean;

    if (existing) {
      teamId = existing.id;
      teamCreated = false;
    } else {
      try {
        teamId = await createTeam(uid, {
          name: teamName,
          ...(team.sport?.trim() ? { sport: team.sport.trim() } : {}),
          ...(team.season?.trim() ? { season: team.season.trim() } : {}),
        });
      } catch (error) {
        throw formatFirestoreWriteError(
          error,
          `Could not create team "${teamName}". Check Firestore rules deployment.`,
        );
      }
      teamCreated = true;
      // Record so later groups that normalize to the same name reuse this team.
      existingTeams = [...existingTeams, stubTeam(teamId, teamName, uid)];
    }

    let importResult: RosterImportResult;
    try {
      importResult = await importRosterPreview(teamId, team.rows);
    } catch (error) {
      throw formatFirestoreWriteError(
        error,
        `Team "${teamName}" was ${teamCreated ? "created" : "matched"} but its roster import failed. Check Firestore rules for players and parent invite targets.`,
      );
    }

    result.teams.push({ teamId, teamName, teamCreated, ...importResult });
    if (teamCreated) result.teamsCreated++;
    else result.teamsUpdated++;
    result.playersCreated += importResult.playersCreated;
    result.playersUpdated += importResult.playersUpdated;
    result.playersUnchanged += importResult.playersUnchanged;
    result.parentsCreated += importResult.parentsCreated;
    result.parentsUpdated += importResult.parentsUpdated;
    result.parentsUnchanged += importResult.parentsUnchanged;
    result.skipped += importResult.skipped;
  }

  return result;
}
