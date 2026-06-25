/**
 * Game-schedule import orchestration (additive / idempotent).
 *
 * Mirrors the roster import philosophy: a schedule upload may CREATE new games
 * and UPDATE changed ones, but never deletes existing games or their history
 * (sources, coach marks, cuts). Re-uploading the same schedule produces zero
 * new games and only updates rows whose details actually changed.
 *
 * Idempotency key (most stable first):
 *   1. Match # (matchNumber)
 *   2. scheduledStartAt (ISO kickoff)
 *   3. title + date
 */

import {
  createTeamGame,
  findTeamByName,
  listTeamGames,
  teamNameKey,
  type Team,
} from "@/lib/teams";
import {
  updateGameScheduleFields,
  type CreateGameInput,
  type Game,
  type GameScheduleFields,
} from "@/lib/games";
import {
  scheduleTeamNames,
  type ParsedScheduleRow,
} from "@/lib/schedule-csv";

export type ScheduleSyncStatus = "new" | "updated" | "unchanged";

export type ScheduleImportRow = {
  row: ParsedScheduleRow;
  status: ScheduleSyncStatus;
  /** Existing game id when matched (updated/unchanged). */
  matchedGameId?: string;
  /** Changed fields to write (updated only). */
  patch?: GameScheduleFields;
};

export type ScheduleTeamGroup = {
  teamName: string;
  rows: ParsedScheduleRow[];
};

export type ScheduleTeamPlan = {
  teamName: string;
  /** Matching Film Room team, when one exists. */
  matchedTeam?: Team;
  /** True when no Film Room team name matched. */
  unmatched: boolean;
  rows: ScheduleImportRow[];
  counts: { new: number; updated: number; unchanged: number };
};

export type ScheduleImportResult = {
  teamsTouched: number;
  gamesCreated: number;
  gamesUpdated: number;
  gamesUnchanged: number;
  unmatchedTeams: string[];
  errors: { team: string; row: number; message: string }[];
};

/** Group parsed rows by team name (encounter order preserved). */
export function groupScheduleRowsByTeam(
  rows: ParsedScheduleRow[],
): ScheduleTeamGroup[] {
  const order = scheduleTeamNames(rows);
  const byKey = new Map<string, ScheduleTeamGroup>();
  for (const name of order) {
    byKey.set(teamNameKey(name), { teamName: name, rows: [] });
  }
  for (const row of rows) {
    const group = byKey.get(teamNameKey(row.teamName));
    if (group) group.rows.push(row);
  }
  return order.map((name) => byKey.get(teamNameKey(name))!);
}

function val(v: string | undefined): string {
  return (v ?? "").trim();
}

/** Stable dedupe key for a parsed schedule row. */
export function scheduleRowKey(row: ParsedScheduleRow): string {
  if (val(row.matchNumber)) return `m:${val(row.matchNumber).toLowerCase()}`;
  if (val(row.scheduledStartAt)) return `s:${val(row.scheduledStartAt)}`;
  return `t:${val(row.title).toLowerCase()}|${val(row.date)}`;
}

/** Stable dedupe key for an existing game (same precedence as rows). */
export function existingGameKey(game: Game): string {
  if (val(game.matchNumber)) return `m:${val(game.matchNumber).toLowerCase()}`;
  if (val(game.scheduledStartAt)) return `s:${val(game.scheduledStartAt)}`;
  return `t:${val(game.title).toLowerCase()}|${val(game.date)}`;
}

/**
 * Non-destructive diff: returns only fields the CSV provides that differ from
 * the existing game. Fields absent from the CSV are never cleared.
 */
export function diffGameFields(
  row: ParsedScheduleRow,
  game: Game,
): GameScheduleFields {
  const patch: GameScheduleFields = {};
  const candidates: [keyof GameScheduleFields, string | undefined, string | undefined][] = [
    ["title", row.title, game.title],
    ["date", row.date, game.date],
    ["scheduledStartAt", row.scheduledStartAt, game.scheduledStartAt],
    ["opponent", row.opponent, game.opponent],
    ["homeTeam", row.homeTeam, game.homeTeam],
    ["awayTeam", row.awayTeam, game.awayTeam],
    ["location", row.location, game.location],
    ["matchNumber", row.matchNumber, game.matchNumber],
    ["division", row.division, game.division],
  ];
  for (const [field, next, current] of candidates) {
    const n = val(next);
    if (n && n !== val(current)) {
      patch[field] = n;
    }
  }
  return patch;
}

/** Classify rows against existing games for one team. */
export function classifyScheduleRows(
  rows: ParsedScheduleRow[],
  existingGames: Game[],
): ScheduleImportRow[] {
  const byKey = new Map<string, Game>();
  for (const game of existingGames) {
    byKey.set(existingGameKey(game), game);
  }
  return rows.map((row) => {
    const match = byKey.get(scheduleRowKey(row));
    if (!match) return { row, status: "new" as const };
    const patch = diffGameFields(row, match);
    if (Object.keys(patch).length === 0) {
      return { row, status: "unchanged" as const, matchedGameId: match.id };
    }
    return { row, status: "updated" as const, matchedGameId: match.id, patch };
  });
}

function countStatuses(rows: ScheduleImportRow[]) {
  return rows.reduce(
    (acc, r) => {
      if (r.status === "new") acc.new++;
      else if (r.status === "updated") acc.updated++;
      else acc.unchanged++;
      return acc;
    },
    { new: 0, updated: 0, unchanged: 0 },
  );
}

/**
 * Build a per-team import plan: match each schedule team to a Film Room team and
 * classify its rows. Loads existing games for matched teams to drive the diff.
 */
export async function loadScheduleImportPlan(
  uid: string,
  rows: ParsedScheduleRow[],
  teams: Team[],
): Promise<ScheduleTeamPlan[]> {
  const groups = groupScheduleRowsByTeam(rows);
  const plans: ScheduleTeamPlan[] = [];
  for (const group of groups) {
    const matchedTeam = findTeamByName(teams, group.teamName);
    if (!matchedTeam) {
      const importRows: ScheduleImportRow[] = group.rows.map((row) => ({
        row,
        status: "new" as const,
      }));
      plans.push({
        teamName: group.teamName,
        unmatched: true,
        rows: importRows,
        counts: countStatuses(importRows),
      });
      continue;
    }
    const existing = await listTeamGames(uid, matchedTeam.id);
    const importRows = classifyScheduleRows(group.rows, existing);
    plans.push({
      teamName: group.teamName,
      matchedTeam,
      unmatched: false,
      rows: importRows,
      counts: countStatuses(importRows),
    });
  }
  return plans;
}

function gameInputFromRow(row: ParsedScheduleRow): CreateGameInput {
  return {
    title: row.title,
    sport: "soccer",
    ...(row.date ? { date: row.date } : {}),
    ...(row.homeTeam ? { homeTeam: row.homeTeam } : {}),
    ...(row.awayTeam ? { awayTeam: row.awayTeam } : {}),
    ...(row.opponent ? { opponent: row.opponent } : {}),
    ...(row.scheduledStartAt ? { scheduledStartAt: row.scheduledStartAt } : {}),
    ...(row.location ? { location: row.location } : {}),
    ...(row.matchNumber ? { matchNumber: row.matchNumber } : {}),
    ...(row.division ? { division: row.division } : {}),
  };
}

/**
 * Execute an import plan. Unmatched teams are skipped (reported back so the
 * caller can prompt the user to create/rename teams first).
 */
export async function importSchedulePlan(
  uid: string,
  plans: ScheduleTeamPlan[],
): Promise<ScheduleImportResult> {
  const result: ScheduleImportResult = {
    teamsTouched: 0,
    gamesCreated: 0,
    gamesUpdated: 0,
    gamesUnchanged: 0,
    unmatchedTeams: [],
    errors: [],
  };

  for (const plan of plans) {
    if (plan.unmatched || !plan.matchedTeam) {
      result.unmatchedTeams.push(plan.teamName);
      continue;
    }
    const teamId = plan.matchedTeam.id;
    let touched = false;
    for (const item of plan.rows) {
      try {
        if (item.status === "new") {
          await createTeamGame(uid, teamId, gameInputFromRow(item.row));
          result.gamesCreated++;
          touched = true;
        } else if (item.status === "updated" && item.matchedGameId && item.patch) {
          await updateGameScheduleFields(item.matchedGameId, item.patch);
          result.gamesUpdated++;
          touched = true;
        } else {
          result.gamesUnchanged++;
        }
      } catch (err) {
        result.errors.push({
          team: plan.teamName,
          row: item.row.rowIndex,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (touched) result.teamsTouched++;
  }

  return result;
}
