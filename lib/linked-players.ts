import {
  groupPersonStatsByEvent,
  summarizePersonStats,
  type PersonFilmMoment,
  type PersonRosterAppearance,
} from "@/lib/person-profile";
import { gameReviewUrl } from "@/lib/player-profile";
import {
  canViewTeam,
  listMyTeams,
  listTeamPlayers,
  type Player,
  type Team,
} from "@/lib/teams";
import { loadLinkedPlayerFilmMoments } from "@/lib/linked-player-film";

export type LinkedPlayerEntry = {
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  jerseyNumber?: string;
  eventLabel?: string;
  personId?: string;
  linkedUid?: string;
};

export type LinkedPlayerGroup = {
  key: string;
  displayName: string;
  personId?: string;
  entries: LinkedPlayerEntry[];
};

export type LinkedPlayerProfile = {
  group: LinkedPlayerGroup;
  rosterAppearances: PersonRosterAppearance[];
  filmMoments: PersonFilmMoment[];
  eventSummaries: ReturnType<typeof groupPersonStatsByEvent>;
  careerCounts: Record<string, number>;
  careerTotal: number;
};

export function linkedPlayerGroupKey(entry: {
  personId?: string;
  teamId: string;
  playerId: string;
}): string {
  if (entry.personId?.trim()) return `person:${entry.personId.trim()}`;
  return `player:${entry.teamId}:${entry.playerId}`;
}

export function parseLinkedPlayerGroupKey(key: string): {
  kind: "person" | "player";
  personId?: string;
  teamId?: string;
  playerId?: string;
} | null {
  if (key.startsWith("person:")) {
    const personId = key.slice("person:".length).trim();
    return personId ? { kind: "person", personId } : null;
  }
  if (key.startsWith("player:")) {
    const rest = key.slice("player:".length);
    const [teamId, playerId] = rest.split(":");
    if (!teamId || !playerId) return null;
    return { kind: "player", teamId, playerId };
  }
  return null;
}

function playerLinkedToParent(player: Player, parentUid: string): boolean {
  return (player.parentUids ?? []).includes(parentUid);
}

function entryFromPlayer(team: Team, player: Player): LinkedPlayerEntry {
  return {
    teamId: team.id,
    teamName: team.name,
    playerId: player.id,
    playerName: player.name,
    ...(team.importBatchLabel ? { eventLabel: team.importBatchLabel } : {}),
    ...(player.jerseyNumber ? { jerseyNumber: player.jerseyNumber } : {}),
    ...(player.personId ? { personId: player.personId } : {}),
    ...(player.linkedUid ? { linkedUid: player.linkedUid } : {}),
  };
}

/** Group roster rows linked to a parent across all teams they belong to. */
export async function listMyLinkedPlayerGroups(
  parentUid: string,
): Promise<LinkedPlayerGroup[]> {
  const teams = await listMyTeams(parentUid);
  const entries: LinkedPlayerEntry[] = [];

  for (const team of teams) {
    if (!canViewTeam(team, parentUid)) continue;
    const players = await listTeamPlayers(team.id);
    for (const player of players) {
      if (!playerLinkedToParent(player, parentUid)) continue;
      entries.push(entryFromPlayer(team, player));
    }
  }

  const byKey = new Map<string, LinkedPlayerGroup>();
  for (const entry of entries) {
    const key = linkedPlayerGroupKey(entry);
    const existing = byKey.get(key);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    byKey.set(key, {
      key,
      displayName: entry.playerName,
      ...(entry.personId ? { personId: entry.personId } : {}),
      entries: [entry],
    });
  }

  return [...byKey.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

export async function loadLinkedPlayerProfile(
  parentUid: string,
  groupKey: string,
): Promise<LinkedPlayerProfile | null> {
  const groups = await listMyLinkedPlayerGroups(parentUid);
  const group = groups.find((g) => g.key === groupKey);
  if (!group) return null;

  const rosterAppearances: PersonRosterAppearance[] = group.entries.map(
    (entry) => ({
      teamId: entry.teamId,
      teamName: entry.teamName,
      ...(entry.eventLabel ? { eventLabel: entry.eventLabel } : {}),
      playerId: entry.playerId,
      ...(entry.jerseyNumber ? { jerseyNumber: entry.jerseyNumber } : {}),
    }),
  );

  const filmMoments = await loadLinkedPlayerFilmMoments(parentUid, group);
  const statMoments = filmMoments.filter((m) => m.kind === "stat");
  const { counts: careerCounts, total: careerTotal } = summarizePersonStats(
    statMoments.map((m) => ({
      eventId: m.eventId,
      t: m.t,
      statType: m.statType ?? m.label,
      playerIds: [],
    })),
  );

  return {
    group,
    rosterAppearances,
    filmMoments,
    eventSummaries: groupPersonStatsByEvent(filmMoments),
    careerCounts,
    careerTotal,
  };
}

export { gameReviewUrl };
