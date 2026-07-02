import type { HighlightMoment } from "@/lib/highlight-draft";

/** One coach-mark event in the reel (may contain live + replay beats). */
export type ReelMomentGroup = {
  startIndex: number;
  moments: HighlightMoment[];
  timelineEventId?: string;
};

/** Group consecutive moments that share a timeline event id. */
export function groupHighlightMoments(
  moments: HighlightMoment[],
): ReelMomentGroup[] {
  const groups: ReelMomentGroup[] = [];
  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i]!;
    const eventId = moment.timelineEventId?.trim();
    const prev = groups[groups.length - 1];
    if (
      eventId &&
      prev?.timelineEventId === eventId &&
      prev.startIndex + prev.moments.length === i
    ) {
      prev.moments.push(moment);
      continue;
    }
    groups.push({
      startIndex: i,
      moments: [moment],
      ...(eventId ? { timelineEventId: eventId } : {}),
    });
  }
  return groups;
}

export function countReelEventGroups(moments: HighlightMoment[]): number {
  return groupHighlightMoments(moments).length;
}

export function isMultiBeatReelGroup(group: ReelMomentGroup): boolean {
  return group.moments.length > 1;
}

export function reelGroupDisplayLabel(group: ReelMomentGroup): string {
  const primary = group.moments[0];
  return primary?.label?.trim() || "Highlight";
}

export function reelGroupStyleLabel(group: ReelMomentGroup): string | null {
  if (!isMultiBeatReelGroup(group)) return null;
  const replayish = group.moments.slice(1).every(
    (m) => (m.speed ?? 1) < 1 || /replay|slow/i.test(m.label ?? ""),
  );
  if (replayish && group.moments.length === 2) return "Live + replay";
  if (group.moments.length === 2) return "2 beats";
  return `${group.moments.length} beats`;
}

/** Swap two adjacent event groups in the flattened moment list. */
export function moveReelMomentGroup(
  moments: HighlightMoment[],
  groupIndex: number,
  dir: -1 | 1,
): HighlightMoment[] | null {
  const groups = groupHighlightMoments(moments);
  const target = groupIndex + dir;
  if (target < 0 || target >= groups.length) return null;
  const nextGroups = [...groups];
  [nextGroups[groupIndex], nextGroups[target]] = [
    nextGroups[target]!,
    nextGroups[groupIndex]!,
  ];
  return nextGroups.flatMap((g) => g.moments);
}

/** Remove every beat in an event group. */
export function removeReelMomentGroup(
  moments: HighlightMoment[],
  group: ReelMomentGroup,
): HighlightMoment[] {
  const ids = new Set(group.moments.map((m) => m.id));
  return moments.filter((m) => !ids.has(m.id));
}

/** Apply a patch to every beat in a group (e.g. shared angle). */
export function patchReelMomentGroup(
  moments: HighlightMoment[],
  group: ReelMomentGroup,
  patch: Partial<HighlightMoment>,
): HighlightMoment[] {
  const ids = new Set(group.moments.map((m) => m.id));
  return moments.map((m) => (ids.has(m.id) ? { ...m, ...patch } : m));
}
