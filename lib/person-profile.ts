import { listGamesForTeam, listGameEvents, type Game } from "@/lib/games";
import {
  listGameStatsFromEvents,
  statTypeLabel,
  type GameStatRecord,
} from "@/lib/game-stats";
import { gameReviewUrl } from "@/lib/player-profile";
import { getPerson, type Person } from "@/lib/persons";
import { eventTagsPersonOrPlayers } from "@/lib/timeline-players";
import {
  canViewTeam,
  listMyTeams,
  listTeamPlayers,
  type Player,
  type Team,
} from "@/lib/teams";

export type PersonRosterAppearance = {
  teamId: string;
  teamName: string;
  eventLabel?: string;
  playerId: string;
  jerseyNumber?: string;
  position?: string;
};

export type PersonFilmMoment = {
  gameId: string;
  gameTitle: string;
  gameDate?: string;
  eventLabel?: string;
  teamName: string;
  eventId: string;
  kind: "stat" | "tag";
  label: string;
  statType?: string;
  t: number;
  sourceId?: string;
};

export type PersonEventStatSummary = {
  eventLabel: string;
  counts: Record<string, number>;
  total: number;
};

export type PersonCareerProfile = {
  person: Person;
  rosterAppearances: PersonRosterAppearance[];
  filmMoments: PersonFilmMoment[];
  eventSummaries: PersonEventStatSummary[];
  careerCounts: Record<string, number>;
  careerTotal: number;
};

export function statRecordMatchesPerson(
  stat: GameStatRecord,
  personId: string,
  rosterPlayerIds: string[],
): boolean {
  if (stat.personIds?.includes(personId)) return true;
  if (rosterPlayerIds.length === 0) return false;
  return stat.playerIds.some((id) => rosterPlayerIds.includes(id));
}

export function summarizePersonStats(
  stats: GameStatRecord[],
): { counts: Record<string, number>; total: number } {
  const counts: Record<string, number> = {};
  for (const stat of stats) {
    const key = stat.statType;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { counts, total };
}

export function groupPersonStatsByEvent(
  moments: PersonFilmMoment[],
): PersonEventStatSummary[] {
  const byEvent = new Map<string, PersonFilmMoment[]>();
  for (const moment of moments) {
    if (moment.kind !== "stat") continue;
    const label = moment.eventLabel?.trim() || "Other";
    const bucket = byEvent.get(label) ?? [];
    bucket.push(moment);
    byEvent.set(label, bucket);
  }

  return [...byEvent.entries()]
    .map(([eventLabel, eventMoments]) => {
      const stats: GameStatRecord[] = eventMoments.map((m) => ({
        eventId: m.eventId,
        t: m.t,
        statType: m.statType ?? m.label,
        playerIds: [],
      }));
      const { counts, total } = summarizePersonStats(stats);
      return { eventLabel, counts, total };
    })
    .sort((a, b) => a.eventLabel.localeCompare(b.eventLabel));
}

type TeamPersonContext = {
  team: Team;
  rosterPlayerIds: string[];
  appearances: PersonRosterAppearance[];
};

async function loadTeamPersonContext(
  team: Team,
  personId: string,
  uid: string,
): Promise<TeamPersonContext | null> {
  if (!canViewTeam(team, uid)) return null;
  const players = await listTeamPlayers(team.id);
  const matches = players.filter((p) => p.personId === personId);
  if (matches.length === 0) return null;

  const appearances = matches.map((player) => rosterAppearance(team, player));
  return {
    team,
    rosterPlayerIds: matches.map((p) => p.id),
    appearances,
  };
}

function rosterAppearance(team: Team, player: Player): PersonRosterAppearance {
  return {
    teamId: team.id,
    teamName: team.name,
    ...(team.importBatchLabel ? { eventLabel: team.importBatchLabel } : {}),
    playerId: player.id,
    ...(player.jerseyNumber ? { jerseyNumber: player.jerseyNumber } : {}),
    ...(player.position ? { position: player.position } : {}),
  };
}

async function loadTeamFilmMoments(
  ctx: TeamPersonContext,
  personId: string,
): Promise<PersonFilmMoment[]> {
  const games = await listGamesForTeam(ctx.team.id);
  const out: PersonFilmMoment[] = [];

  await Promise.all(
    games.map(async (game: Game) => {
      const events = await listGameEvents(game.id);
      const stats = listGameStatsFromEvents(events);

      for (const stat of stats) {
        if (
          !statRecordMatchesPerson(stat, personId, ctx.rosterPlayerIds)
        ) {
          continue;
        }
        out.push({
          gameId: game.id,
          gameTitle: game.title,
          ...(game.date ? { gameDate: game.date } : {}),
          ...(ctx.team.importBatchLabel
            ? { eventLabel: ctx.team.importBatchLabel }
            : {}),
          teamName: ctx.team.name,
          eventId: stat.eventId,
          kind: "stat",
          label: statTypeLabel(stat.statType),
          statType: stat.statType,
          t: stat.t,
          ...(stat.sourceId ? { sourceId: stat.sourceId } : {}),
        });
      }

      for (const ev of events) {
        if (ev.type === "stat") continue;
        if (
          !eventTagsPersonOrPlayers(ev, personId, ctx.rosterPlayerIds)
        ) {
          continue;
        }
        out.push({
          gameId: game.id,
          gameTitle: game.title,
          ...(game.date ? { gameDate: game.date } : {}),
          ...(ctx.team.importBatchLabel
            ? { eventLabel: ctx.team.importBatchLabel }
            : {}),
          teamName: ctx.team.name,
          eventId: ev.id,
          kind: "tag",
          label: ev.label?.trim() || ev.type,
          t: ev.t,
          ...(ev.sourceId ? { sourceId: ev.sourceId } : {}),
        });
      }
    }),
  );

  return out;
}

export async function loadPersonCareerProfile(
  uid: string,
  personId: string,
): Promise<PersonCareerProfile | null> {
  const person = await getPerson(uid, personId);
  if (!person) return null;

  const teams = await listMyTeams(uid);
  const contexts: TeamPersonContext[] = [];
  for (const team of teams) {
    const ctx = await loadTeamPersonContext(team, personId, uid);
    if (ctx) contexts.push(ctx);
  }

  const rosterAppearances = contexts.flatMap((ctx) => ctx.appearances);
  rosterAppearances.sort(
    (a, b) =>
      (b.eventLabel ?? "").localeCompare(a.eventLabel ?? "") ||
      a.teamName.localeCompare(b.teamName),
  );

  const filmMoments: PersonFilmMoment[] = [];
  for (const ctx of contexts) {
    filmMoments.push(...(await loadTeamFilmMoments(ctx, personId)));
  }
  filmMoments.sort(
    (a, b) =>
      (b.gameDate ?? "").localeCompare(a.gameDate ?? "") || b.t - a.t,
  );

  const statMoments = filmMoments.filter((m) => m.kind === "stat");
  const stats: GameStatRecord[] = statMoments.map((m) => ({
    eventId: m.eventId,
    t: m.t,
    statType: m.statType ?? m.label,
    playerIds: [],
  }));
  const { counts: careerCounts, total: careerTotal } =
    summarizePersonStats(stats);
  const eventSummaries = groupPersonStatsByEvent(filmMoments);

  return {
    person,
    rosterAppearances,
    filmMoments,
    eventSummaries,
    careerCounts,
    careerTotal,
  };
}

export { gameReviewUrl };
