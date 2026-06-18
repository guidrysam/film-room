import type { GameTimelineEvent, GameVideoSource } from "@/lib/games";
import type { HighlightDraft } from "@/lib/highlight-draft";
import { getEventPlayerIds } from "@/lib/timeline-players";
import type { Player, Team } from "@/lib/teams";

export type GameDashboardMetrics = {
  sourceCount: number;
  syncedSourceCount: number;
  playerCount: number;
  parentContributorCount: number;
  coachMarkCount: number;
  highlightDraftCount: number;
};

export function isSourceSynced(
  source: Pick<GameVideoSource, "syncStatus">,
): boolean {
  return (
    source.syncStatus === "clock_synced" ||
    source.syncStatus === "manually_synced" ||
    source.syncStatus === "audio_synced"
  );
}

export function countCoachMarks(events: GameTimelineEvent[]): number {
  return events.filter((e) => e.type === "coach_mark").length;
}

export function collectTaggedPlayerIds(
  events: GameTimelineEvent[],
  highlightDrafts: HighlightDraft[],
): string[] {
  const ids = new Set<string>();
  for (const ev of events) {
    for (const id of getEventPlayerIds(ev)) ids.add(id);
  }
  for (const draft of highlightDrafts) {
    for (const id of draft.playerIds ?? []) ids.add(id);
    for (const m of draft.moments) {
      for (const id of m.playerIds ?? []) ids.add(id);
    }
  }
  return [...ids];
}

export function computeGameDashboardMetrics(input: {
  sources: GameVideoSource[];
  events: GameTimelineEvent[];
  players: Player[];
  highlightDrafts: HighlightDraft[];
  team: Team | null;
}): GameDashboardMetrics {
  const parentContributorCount = input.team
    ? Object.values(input.team.members).filter((r) => r === "parent").length
    : 0;

  return {
    sourceCount: input.sources.length,
    syncedSourceCount: input.sources.filter(isSourceSynced).length,
    playerCount: input.players.length,
    parentContributorCount,
    coachMarkCount: countCoachMarks(input.events),
    highlightDraftCount: input.highlightDrafts.length,
  };
}

export function recentCoachMarks(
  events: GameTimelineEvent[],
  limit = 5,
): GameTimelineEvent[] {
  return events
    .filter((e) => e.type === "coach_mark")
    .sort((a, b) => b.t - a.t)
    .slice(0, limit);
}

export function recentHighlightDrafts(
  drafts: HighlightDraft[],
  limit = 5,
): HighlightDraft[] {
  return drafts.slice(0, limit);
}

export function syncStatusSummary(sources: GameVideoSource[]): string {
  if (sources.length === 0) return "No sources yet";
  const synced = sources.filter(isSourceSynced).length;
  if (synced === 0) return `${sources.length} source${sources.length === 1 ? "" : "s"} · none synced`;
  if (synced === sources.length) {
    return `${sources.length} source${sources.length === 1 ? "" : "s"} · all synced`;
  }
  return `${synced} of ${sources.length} synced`;
}
